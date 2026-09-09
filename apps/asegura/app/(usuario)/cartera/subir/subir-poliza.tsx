'use client'

import { useState } from 'react'
import { revisarFichero, TIPOS_ACEPTADOS } from '@/lib/documentos/fichero'
import { eur } from '@/lib/dinero'

type DatosLeidos = Record<string, string | number | null>

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
    }
  | { fase: 'error'; mensaje: string }

/** Cómo se llama cada campo en pantalla, por tipo de lectura. El orden ES el
 *  orden en que se pintan. Los campos comunes (compañía, número…) van en las
 *  dos listas: cada póliza los tiene, sea del ramo que sea. */
const ETIQUETAS_COMUNES: [string, string][] = [
  ['compania', 'Compañía'],
  ['codigoEntidadDgs', 'Código DGS'],
  ['numeroPoliza', 'Nº de póliza'],
  ['fechaEfecto', 'Fecha de efecto'],
  ['fechaVencimiento', 'Vencimiento'],
  ['primaAnual', 'Prima anual'],
]

const ETIQUETAS_AUTO: [string, string][] = [
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

const ETIQUETAS_HOGAR: [string, string][] = [
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

function etiquetasPara(tipoLectura: 'auto' | 'hogar' | 'contrato_solo'): [string, string][] {
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
      setEstado({
        fase: 'leido',
        nombre: String(j.nombre ?? f.name),
        fuente: String(j.fuente),
        ramo: typeof j.ramo === 'string' ? j.ramo : null,
        tipoLectura,
        datos: (j.datos ?? {}) as DatosLeidos,
        campos: (j.campos ?? []) as string[],
      })
    } catch (e) {
      setEstado({ fase: 'error', mensaje: (e as Error).message })
    }
  }

  const leyendo = estado.fase === 'leyendo'

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
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Leído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etiquetasPara(estado.tipoLectura).map(([clave, etiqueta]) => {
                      const v = estado.datos[clave]
                      return (
                        <tr key={clave}>
                          <th style={{ textAlign: 'left', width: '45%' }}>{etiqueta}</th>
                          <td>
                            {v === null || v === undefined ? (
                              // Un hueco se dice. Nunca se pinta 0 ni vacío.
                              <span className="muted">no aparece en el documento</span>
                            ) : CAMPOS_DINERO.has(clave) ? (
                              eur(Number(v))
                            ) : (
                              String(v)
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
