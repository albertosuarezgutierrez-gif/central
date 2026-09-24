import { getResumenFinanciero } from '@/lib/finanzas'
import { getEvolucionMensual } from '@/lib/banca'
import ResumenPeriodo from './ResumenPeriodo'

/**
 * Los bloques LENTOS de «Dinero», cada uno en su propio `<Suspense>` desde
 * `page.tsx` (24/09/2026, «adelgaza la página de banca»).
 *
 * Antes iban en la misma `Promise.all` que el saldo y el libro: la página no
 * pintaba NADA hasta que terminaba la tesorería, que recorre TODO el histórico
 * de movimientos, aunque su bloque estuviera plegado y casi nunca se abriera.
 * Ahora el saldo, las bandejas y el libro salen primero y estos llegan después.
 * La tesorería y el benchmark de pisos ni siquiera se calculan hasta abrir su
 * plegable: los pide `AnalisisPerezoso.tsx` a `/api/banca/analisis`.
 */

const aviso: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '0 0 24px' }

/** Resumen interactivo del periodo + gráficas. Un fallo se dice; no se pinta un periodo vacío. */
export async function ResumenDiferido({ cuentaId, year, quarter, desde, hasta, periodoLabel }: {
  cuentaId: string; year: number; quarter: number; desde: string; hasta: string; periodoLabel: string
}) {
  const [resumen, evolucion] = await Promise.all([
    getResumenFinanciero(cuentaId, year, quarter, desde || undefined, hasta || undefined)
      .catch(e => { console.error('[banca] resumen', e); return null }),
    getEvolucionMensual(cuentaId, 12)
      .catch(e => { console.error('[banca] evolucion', e); return null }),
  ])
  if (!resumen) return <p style={aviso}>No se ha podido calcular el resumen del periodo. Los movimientos de abajo sí están.</p>
  return (
    <>
      {/* Sin evolución, las gráficas saldrían vacías y se leerían como «no hubo movimiento». */}
      {evolucion === null && <p style={aviso}>No se ha podido leer la evolución de 12 meses: las gráficas comparativas no están completas.</p>}
      <ResumenPeriodo resumen={resumen} evolucion={evolucion ?? []} periodoLabel={periodoLabel} />
    </>
  )
}
