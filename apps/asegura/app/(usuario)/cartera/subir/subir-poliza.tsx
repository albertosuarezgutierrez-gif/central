'use client'

import { useState } from 'react'
import type { AutoLeido, HogarLeido } from '@central/module-seguros'
import { revisarFichero, TIPOS_ACEPTADOS } from '@/lib/documentos/fichero'
import { eur } from '@/lib/dinero'

type DatosLeidos = Record<string, string | number | null>

type Coincidencia = { id: string; nombre: string; tipo: string; por: string }

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
                    ? (j.coincidencias as Coincidencia[])
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

              {/* Conflicto (409): coincidencias encontradas */}
              {estado.conflicto && (
                <div className="card conflict-box">
                  <h3>⚠️ Datos duplicados</h3>
                  <p>{estado.conflicto.error}</p>
                  <p>Se encontraron estas fichas que ya tienen este dato:</p>
                  <div className="coincidencias-lista">
                    {estado.conflicto.coincidencias.map((coincidencia) => (
                      <div key={coincidencia.id} className="coincidencia-item">
                        <div className="coincidencia-info">
                          <strong>{coincidencia.nombre}</strong>
                          <small className="muted">
                            {coincidencia.tipo} · por {coincidencia.por}
                          </small>
                        </div>
                        <button
                          className="btn btn-secondary"
                          onClick={() => guardar(coincidencia.id)}
                          disabled={estado.guardando}
                        >
                          Usar esta ficha
                        </button>
                      </div>
                    ))}
                  </div>
                  {estado.conflicto.forzable && (
                    <div className="mt-4">
                      <button
                        className="btn btn-primary"
                        onClick={() => guardar(undefined, true)}
                        disabled={estado.guardando}
                      >
                        Crear ficha nueva igualmente
                      </button>
                    </div>
                  )}
                </div>
              )}

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
