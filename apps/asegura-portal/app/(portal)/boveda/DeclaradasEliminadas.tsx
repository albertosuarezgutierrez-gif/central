import { TEXTO_ELIMINADAS } from '@/lib/declaradas-eliminadas'

import { RAMO } from './PolizaVista'
import { RestaurarPoliza } from './RestaurarPoliza'

/** Cuántas se pintan como mucho. Si hay más, se DICE (no se recorta en silencio). */
export const LIMITE_ELIMINADAS = 50

/** `AAAA-MM-DD` o ISO → `dd/mm/aaaa`, en UTC (las columnas `date` llegan a medianoche UTC). */
function diaEs(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

/**
 * «Eliminadas»: las pólizas que la persona APORTÓ y luego quitó de su bóveda (10/10/2026).
 *
 * Alberto: «lo que el cliente sube puede eliminarlo, pero NADA se pierde». Quitar ya no borra
 * (`eliminadaEn`); aquí están, con un botón para devolverlas tal como estaban.
 *
 * Nace PLEGADO (`<details>` sin `open`) y debajo de «Tu cartera»: no es lo que se viene a ver, es
 * la red por si se equivocó. Mismo marcado que `GrupoPlegable` para que se lea igual, sin JS para
 * abrirlo. Como mucho `LIMITE_ELIMINADAS` filas (regla de rendimiento de la casa); si hay más, se
 * dice. Solo se enseñan compañía, ramo y fechas: lo justo para reconocerla.
 */
export function DeclaradasEliminadas({
  filas,
  hayMas,
}: {
  filas: { id: string; compania: string | null; ramo: string | null; fechaVencimiento: string | null; eliminadaEn: string | null }[]
  hayMas: boolean
}) {
  const cuenta = hayMas ? `más de ${filas.length}` : String(filas.length)
  return (
    <section className="seccion">
      <details className="plegable-cartera">
        <summary className="plegable-cartera-resumen">
          <h2 className="plegable-cartera-titulo">
            <span className="plegable-cartera-nombre">Eliminadas</span>
            <span className="plegable-cartera-cuenta">{cuenta}</span>
          </h2>
        </summary>
        <div className="plegable-cartera-cuerpo">
          <p className="suave" style={{ marginTop: 0 }}>
            {TEXTO_ELIMINADAS}
          </p>
          <ul className="eliminadas-lista">
            {filas.map((f) => {
              const titulo = f.compania ?? 'Póliza sin compañía identificada'
              const ramo = f.ramo ? (RAMO[f.ramo] ?? f.ramo) : null
              const vence = diaEs(f.fechaVencimiento)
              const quitada = diaEs(f.eliminadaEn)
              const meta = [
                ramo,
                vence ? `Vence el ${vence}` : 'Sin fecha de vencimiento',
                quitada ? `La quitaste el ${quitada}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={f.id} className="eliminadas-fila">
                  <span className="eliminadas-fila-texto">
                    <span className="poliza-titulo">{titulo}</span>
                    <span className="poliza-meta">{meta}</span>
                  </span>
                  <RestaurarPoliza id={f.id} titulo={titulo} />
                </li>
              )
            })}
          </ul>
          {hayMas && (
            <p className="suave">
              Te enseñamos las {filas.length} que quitaste más recientemente. Las anteriores siguen guardadas: si
              buscas una, escríbenos y te la recuperamos.
            </p>
          )}
        </div>
      </details>
    </section>
  )
}
