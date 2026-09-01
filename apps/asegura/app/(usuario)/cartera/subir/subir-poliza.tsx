'use client'

import { useState } from 'react'
import { revisarFichero, TIPOS_ACEPTADOS } from '@/lib/documentos/fichero'
import { eur } from '@/lib/dinero'

type AutoLeido = Record<string, string | number | null>

type Estado =
  | { fase: 'inicio' }
  | { fase: 'leyendo' }
  | { fase: 'leido'; nombre: string; fuente: string; datos: AutoLeido; campos: string[] }
  | { fase: 'error'; mensaje: string }

/** Cómo se llama cada campo en pantalla. El orden ES el orden de lectura. */
const ETIQUETAS: [keyof AutoLeido & string, string][] = [
  ['compania', 'Compañía'],
  ['codigoEntidadDgs', 'Código DGS'],
  ['numeroPoliza', 'Nº de póliza'],
  ['fechaEfecto', 'Fecha de efecto'],
  ['fechaVencimiento', 'Vencimiento'],
  ['primaAnual', 'Prima anual'],
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
      setEstado({
        fase: 'leido',
        nombre: String(j.nombre ?? f.name),
        fuente: String(j.fuente),
        datos: (j.datos ?? {}) as AutoLeido,
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
            {' · '}
            <strong>{estado.campos.length}</strong> campo(s) encontrado(s)
          </p>

          {estado.campos.length === 0 ? (
            // El modelo respondió pero no encontró nada. NO es lo mismo que no
            // haber podido mirar (eso llega como error), y se dice distinto.
            <p>
              El documento se ha leído, pero <strong>no se ha reconocido ningún dato</strong>. Puede
              que no sea una póliza de auto, o que la calidad no dé. Revísalo antes de darlo por
              vacío.
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
                    {ETIQUETAS.map(([clave, etiqueta]) => {
                      const v = estado.datos[clave]
                      return (
                        <tr key={clave}>
                          <th style={{ textAlign: 'left', width: '45%' }}>{etiqueta}</th>
                          <td>
                            {v === null || v === undefined ? (
                              // Un hueco se dice. Nunca se pinta 0 ni vacío.
                              <span className="muted">no aparece en el documento</span>
                            ) : clave === 'primaAnual' ? (
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
