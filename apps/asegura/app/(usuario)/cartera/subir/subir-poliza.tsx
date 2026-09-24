'use client'

import { clasificarCoincidencias } from '@central/module-seguros'
import type { Coincidencia as CoincidenciaModulo } from '@central/module-seguros'

import { useState } from 'react'
import type { AutoLeido, HogarLeido } from '@central/module-seguros'
import { revisarFichero, TIPOS_ACEPTADOS } from '@/lib/documentos/fichero'
import { eur } from '@/lib/dinero'

type DatosLeidos = Record<string, string | number | null>

/** El tipo lo pone el módulo: si mañana aparece un criterio nuevo de
 *  coincidencia, `tsc` avisa aquí en vez de dejar que se clasifique solo. */
type Coincidencia = CoincidenciaModulo

/**
 * La coincidencia llega por HTTP, así que su `por` se COMPRUEBA, no se castea.
 *
 * 🚨 Un `por` que no se reconozca cae en `'email'` a propósito: lo único que
 * `'dni'` habilita es el botón de enlazar esta póliza a una ficha existente, y
 * ante un criterio desconocido la respuesta conservadora es no ofrecerlo. Al
 * revés —tratar lo desconocido como DNI— se funden dos personas, que es el
 * daño que no se ve.
 */
function leerCoincidencia(v: unknown): Coincidencia | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id === '') return null
  const por = o.por === 'dni' ? 'dni' : o.por === 'telefono' ? 'telefono' : 'email'
  return {
    id: o.id,
    nombre: typeof o.nombre === 'string' ? o.nombre : '',
    tipo: typeof o.tipo === 'string' ? o.tipo : '',
    por,
  }
}

type Estado =
  | { fase: 'inicio' }
  | { fase: 'leyendo' }
  | {
      fase: 'leido'
      nombre: string
      fuente: string
      ramo: string | null
      tipoLectura: 'auto' | 'hogar' | 'contrato_solo'
      datos: DatosLeidos
      campos: string[]
      fichero: File
      datosEditados: DatosLeidos
      telefono: string
      email: string
      guardando: boolean
      guardado?: {
        clienteId: string
        clienteNuevo: boolean
        declaradaId?: string
        documentoId: string
        repetido: boolean
        avisos: string[]
      }
      conflicto?: {
        error: string
        coincidencias: Coincidencia[]
        forzable: boolean
      }
      error?: string
    }
  | { fase: 'error'; mensaje: string }

/** Cómo se llama cada campo en pantalla, por tipo de lectura. El orden ES el
 *  orden en que se pintan. Los campos comunes (compañía, número…) van en las
 *  dos listas: cada póliza los tiene, sea del ramo que sea.
 *
 *  Las claves se tipan contra `AutoLeido`/`HogarLeido` (no `string` a secas)
 *  para que, si esos tipos renombran un campo, `tsc` avise aquí en vez de
 *  dejar la fila leyendo `undefined` en silencio y pintando «no aparece en
 *  el documento» sobre un dato que sí se leyó. */
type ClaveComun = keyof AutoLeido & keyof HogarLeido & string

const ETIQUETAS_COMUNES: [ClaveComun, string][] = [
  ['compania', 'Compañía'],
  ['codigoEntidadDgs', 'Código DGS'],
  ['numeroPoliza', 'Nº de póliza'],
  ['fechaEfecto', 'Fecha de efecto'],
  ['fechaVencimiento', 'Vencimiento'],
  ['primaAnual', 'Prima anual'],
]

const ETIQUETAS_AUTO: [keyof AutoLeido & string, string][] = [
  ...ETIQUETAS_COMUNES,
  ['matricula', 'Matrícula'],
  ['marca', 'Marca'],
  ['modelo', 'Modelo'],
  ['version', 'Versión'],
  ['fechaMatriculacion', 'Fecha de matriculación'],
  ['tomador', 'Tomador'],
  ['dni', 'DNI'],
  ['fechaNacimiento', 'Fecha de nacimiento'],
  ['fechaCarnet', 'Fecha del carnet'],
  ['aniosSinSiniestros', 'Años sin siniestros'],
  ['siniestrosUltimos5', 'Siniestros en 5 años'],
]

const ETIQUETAS_HOGAR: [keyof HogarLeido & string, string][] = [
  ...ETIQUETAS_COMUNES,
  ['direccion', 'Dirección de la vivienda'],
  ['cp', 'Código postal'],
  ['localidad', 'Localidad'],
  ['metrosCuadrados', 'Metros cuadrados'],
  ['anioConstruccion', 'Año de construcción'],
  ['capitalContinente', 'Capital del continente'],
  ['capitalContenido', 'Capital del contenido'],
  ['tomador', 'Tomador'],
  ['dni', 'DNI'],
  ['fechaNacimiento', 'Fecha de nacimiento'],
]

const CAMPOS_DINERO = new Set(['primaAnual', 'capitalContinente', 'capitalContenido'])

function etiquetasPara(
  tipoLectura: 'auto' | 'hogar' | 'contrato_solo',
): [(keyof AutoLeido | keyof HogarLeido) & string, string][] {
  if (tipoLectura === 'hogar') return ETIQUETAS_HOGAR
  if (tipoLectura === 'auto') return ETIQUETAS_AUTO
  return ETIQUETAS_COMUNES
}

export default function SubirPoliza() {
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' })

  async function subir(f: File) {
    // Se revisa en el navegador ANTES de subir: rechazar aquí ahorra el viaje.
    const reparo = revisarFichero({ type: f.type, size: f.size, name: f.name })
    if (reparo) {
      setEstado({ fase: 'error', mensaje: reparo })
      return
    }

    setEstado({ fase: 'leyendo' })
    const cuerpo = new FormData()
    cuerpo.append('fichero', f)
    try {
      const res = await fetch('/api/cartera/documentos', { method: 'POST', body: cuerpo })
      const j = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        setEstado({ fase: 'error', mensaje: String(j.error ?? `error ${res.status}`) })
        return
      }
      const tipoLectura = j.tipoLectura === 'hogar' || j.tipoLectura === 'auto' ? j.tipoLectura : 'contrato_solo'
      const datosLeidos = (j.datos ?? {}) as DatosLeidos
      setEstado({
        fase: 'leido',
        nombre: String(j.nombre ?? f.name),
        fuente: String(j.fuente),
        ramo: typeof j.ramo === 'string' ? j.ramo : null,
        tipoLectura,
        datos: datosLeidos,
        campos: (j.campos ?? []) as string[],
        fichero: f,
        datosEditados: { ...datosLeidos },
        telefono: '',
        email: '',
        guardando: false,
      })
    } catch (e) {
      setEstado({ fase: 'error', mensaje: (e as Error).message })
    }
  }

  const leyendo = estado.fase === 'leyendo'

  function describirAviso(codigo: string): string {
    const AVISOS: Record<string, string> = {
      sin_dni: 'Sin DNI en el documento: esta ficha no se puede casar por identidad, solo por nombre.',
      nombre_partido: 'El corte entre nombre y apellidos lo ha hecho el lector, no el documento: revísalo.',
      sin_vencimiento: 'Sin fecha de vencimiento: no habrá aviso de cuándo entrar.',
      sin_compania: 'Sin compañía: no se podrá comprobar si esa póliza ya la lleva la casa.',
      sin_numero: 'Sin número de póliza: no se podrá comprobar si esa póliza ya la lleva la casa.',
      sin_nombre: 'El documento no trae el tomador.',
    }
    return AVISOS[codigo] ?? codigo
  }

  async function guardar(clienteId?: string, forzar?: boolean) {
    if (estado.fase !== 'leido') return

    setEstado((s) => (s.fase === 'leido' ? { ...s, guardando: true } : s))

    const cuerpo = new FormData()
    cuerpo.append('fichero', estado.fichero)
    cuerpo.append(
      'datos',
      JSON.stringify({
        lectura: {
          ramo: estado.ramo,
          tipoLectura: estado.tipoLectura,
          datos: estado.datosEditados,
        },
        clienteId,
        telefono: estado.telefono || undefined,
        email: estado.email || undefined,
        forzar,
      }),
    )

    try {
      const res = await fetch('/api/operador/poliza-documento', {
        method: 'POST',
        body: cuerpo,
      })
      const j = (await res.json()) as Record<string, unknown>

      if (res.ok) {
        setEstado((s) =>
          s.fase === 'leido'
            ? {
                ...s,
                guardando: false,
                guardado: {
                  clienteId: String(j.clienteId),
                  clienteNuevo: Boolean(j.clienteNuevo),
                  declaradaId: j.declaradaId ? String(j.declaradaId) : undefined,
                  documentoId: String(j.documentoId),
                  repetido: Boolean(j.repetido),
                  avisos: Array.isArray(j.avisos) ? j.avisos.map(String) : [],
                },
              }
            : s,
        )
      } else if (res.status === 409) {
        setEstado((s) =>
          s.fase === 'leido'
            ? {
                ...s,
                guardando: false,
                conflicto: {
                  error: String(j.error ?? 'Conflicto'),
                  coincidencias: Array.isArray(j.coincidencias)
                    ? j.coincidencias.map(leerCoincidencia).filter((c): c is Coincidencia => c !== null)
                    : [],
                  forzable: Boolean(j.forzable),
                },
              }
            : s,
        )
      } else if (res.status === 422) {
        setEstado((s) =>
          s.fase === 'leido'
            ? {
                ...s,
                guardando: false,
                error: String(j.error ?? 'Error al guardar'),
              }
            : s,
        )
      } else {
        setEstado((s) =>
          s.fase === 'leido'
            ? {
                ...s,
                guardando: false,
                error: String(j.error ?? `Error ${res.status}`),
              }
            : s,
        )
      }
    } catch (e) {
      setEstado((s) =>
        s.fase === 'leido'
          ? { ...s, guardando: false, error: (e as Error).message }
          : s,
      )
    }
  }

  return (
    <>
      <div className="card">
        <label htmlFor="fichero">Póliza (PDF o foto)</label>
        <input
          id="fichero"
          type="file"
          accept={[...TIPOS_ACEPTADOS, '.pdf'].join(',')}
          disabled={leyendo}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void subir(f)
          }}
        />
        {leyendo && <p className="muted">Leyendo el documento… puede tardar unos segundos.</p>}
        {estado.fase === 'error' && <p className="err">{estado.mensaje}</p>}
      </div>

      {estado.fase === 'leido' && (
        <div className="card">
          <h2>Lo que el agente ha leído</h2>
          <p className="muted">
            {estado.nombre} · leído {estado.fuente === 'vision' ? 'de la imagen' : 'del texto del PDF'}
            {' · ramo '}
            <strong>{estado.ramo ?? 'no identificado'}</strong>
            {' · '}
            <strong>{estado.campos.length}</strong> campo(s) encontrado(s)
          </p>

          {estado.tipoLectura === 'contrato_solo' && (
            <p className="muted">
              Hoy solo se leen a fondo pólizas de <strong>auto</strong> y <strong>hogar</strong>. De
              esta se ha leído lo común a cualquier póliza (compañía, número, vencimiento, prima); lo
              propio de su ramo hay que teclearlo a mano.
            </p>
          )}

          {estado.campos.length === 0 ? (
            // El modelo respondió pero no encontró nada. NO es lo mismo que no
            // haber podido mirar (eso llega como error), y se dice distinto.
            <p>
              El documento se ha leído, pero <strong>no se ha reconocido ningún dato</strong>. Puede
              que la calidad no dé, o que no sea una póliza. Revísalo antes de darlo por vacío.
            </p>
          ) : (
            <>
              {/* Campos leídos editables */}
              <div className="campos-lectura">
                {etiquetasPara(estado.tipoLectura).map(([clave, etiqueta]) => {
                  const v = estado.datosEditados[clave]
                  const esMoneda = CAMPOS_DINERO.has(clave)
                  return (
                    <div key={clave} className="campo-editable">
                      <label htmlFor={`campo-${clave}`}>{etiqueta}</label>
                      <input
                        id={`campo-${clave}`}
                        type="text"
                        value={v === null || v === undefined ? '' : String(v)}
                        placeholder={
                          v === null || v === undefined ? 'no aparece en el documento' : undefined
                        }
                        onChange={(e) => {
                          setEstado((s) =>
                            s.fase === 'leido'
                              ? {
                                  ...s,
                                  datosEditados: {
                                    ...s.datosEditados,
                                    [clave]: e.target.value || null,
                                  },
                                }
                              : s,
                          )
                        }}
                      />
                      {esMoneda && v !== null && v !== undefined && (
                        <small className="muted">se guardará como {Number(v)}</small>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Campos de contacto */}
              <div className="campos-contacto">
                <h3>Contacto (opcional)</h3>
                <div className="campo-editable">
                  <label htmlFor="telefono">Teléfono</label>
                  <input
                    id="telefono"
                    type="tel"
                    value={estado.telefono}
                    placeholder="no se ha encontrado en el documento"
                    onChange={(e) => {
                      setEstado((s) =>
                        s.fase === 'leido' ? { ...s, telefono: e.target.value } : s,
                      )
                    }}
                  />
                </div>
                <div className="campo-editable">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={estado.email}
                    placeholder="no se ha encontrado en el documento"
                    onChange={(e) => {
                      setEstado((s) =>
                        s.fase === 'leido' ? { ...s, email: e.target.value } : s,
                      )
                    }}
                  />
                </div>
              </div>

              {/* Avisos */}
              {estado.guardado?.avisos && estado.guardado.avisos.length > 0 && (
                <div className="avisos">
                  {estado.guardado.avisos.map((codigo, i) => (
                    <p key={i} className="aviso">
                      ⚠️ {describirAviso(codigo)}
                    </p>
                  ))}
                </div>
              )}

              {/* Error en guardado */}
              {estado.error && (
                <div className="card error-box">
                  <p className="err">{estado.error}</p>
                </div>
              )}

              {/* Conflicto (409). 🚨 DOS listas, no una: ver `clasificarCoincidencias`.
                  Una ficha que comparte el DNI es la misma persona; una que solo
                  comparte teléfono o email es, casi siempre, otra persona de la
                  misma casa — y el trámite lo suele hacer uno por todos, así que
                  en el papel del padre va el móvil del hijo. Ofrecer «usar esta
                  ficha» ahí cuelga la póliza del padre de la ficha del hijo, y
                  con nombres parecidos no lo nota nadie. */}
              {estado.conflicto && (() => {
                const { mismaPersona, mismoContacto } = clasificarCoincidencias(
                  estado.conflicto.coincidencias,
                )
                return (
                  <div className="card conflict-box">
                    <h3>⚠️ Ya hay fichas con estos datos</h3>

                    {mismaPersona.length > 0 && (
                      <>
                        <p>
                          Mismo <strong>DNI</strong>: es la misma persona. La póliza va a su ficha.
                        </p>
                        <div className="coincidencias-lista">
                          {mismaPersona.map((c) => (
                            <div key={c.id} className="coincidencia-item">
                              <div className="coincidencia-info">
                                <strong>{c.nombre}</strong>
                                <small className="muted">{c.tipo} · mismo DNI</small>
                              </div>
                              <button
                                className="btn btn-secondary"
                                onClick={() => guardar(c.id)}
                                disabled={estado.guardando}
                              >
                                Usar esta ficha
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {mismoContacto.length > 0 && (
                      <>
                        <p>
                          Comparte <strong>teléfono o correo</strong> con estas fichas. Eso suele
                          querer decir que son de la misma casa —o que una hace el trámite por la
                          otra—, <strong>no</strong> que sean la misma persona:
                        </p>
                        <div className="coincidencias-lista">
                          {mismoContacto.map((c) => (
                            <div key={c.id} className="coincidencia-item">
                              <div className="coincidencia-info">
                                <strong>{c.nombre}</strong>
                                <small className="muted">
                                  {c.tipo} · mismo {c.por === 'telefono' ? 'teléfono' : 'correo'}
                                </small>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="muted" style={{ fontSize: 13 }}>
                          Si de verdad es la misma persona, ábrele ficha y fúndelas después
                          comprobando el DNI: fundir dos personas mezcla sus pólizas y sus papeles,
                          y a diferencia de un duplicado no se ve.
                        </p>
                      </>
                    )}

                    {estado.conflicto.forzable && (
                      <div className="mt-4">
                        <button
                          className="btn btn-primary"
                          onClick={() => guardar(undefined, true)}
                          disabled={estado.guardando}
                        >
                          Es otra persona · crear su ficha
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Guardado exitoso */}
              {estado.guardado && !estado.conflicto && (
                <div className="card success-box">
                  <h3>✓ Documento guardado</h3>
                  {estado.guardado.repetido ? (
                    <p>Ese mismo documento ya estaba en la ficha: no se ha duplicado nada.</p>
                  ) : (
                    <>
                      <p>
                        El documento se ha guardado correctamente en{' '}
                        <strong>
                          {estado.guardado.clienteNuevo
                            ? 'una ficha nueva'
                            : 'la ficha existente'}
                        </strong>
                        .
                      </p>
                      {process.env.NEXT_PUBLIC_PLATAFORMA_URL && (
                        <a
                          href={`${process.env.NEXT_PUBLIC_PLATAFORMA_URL}/correduria/cliente/${estado.guardado.clienteId}`}
                          className="btn btn-secondary"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver ficha en plataforma →
                        </a>
                      )}
                      {!process.env.NEXT_PUBLIC_PLATAFORMA_URL && (
                        <p className="muted">
                          Ficha del cliente: <code>{estado.guardado.clienteId}</code>
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Botón Guardar */}
              {!estado.guardado && (
                <div className="botones-accion">
                  <button
                    className="btn btn-primary"
                    onClick={() => guardar()}
                    disabled={estado.guardando || estado.campos.length === 0}
                  >
                    {estado.guardando ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              )}

              <p className="muted">
                <span className="badge warn">Leído de un documento</span> Ninguno de estos datos
                está confirmado: los ha leído una máquina. Revísalos antes de usarlos, y ten en
                cuenta que lo que ya venga de la compañía por CIMA <strong>no se sustituye</strong>.
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
