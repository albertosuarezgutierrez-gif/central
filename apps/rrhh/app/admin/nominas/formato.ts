// Dinero en formato español para las pantallas de nóminas: 2162.49 → «2.162,49€» (punto de miles también en 4 cifras,
// coma decimal, € detrás). Mismo criterio que `eur()` de plataforma (`apps/plataforma/lib/dinero.ts`). Puro.
export function eur(n: number | string | null | undefined): string {
  const num = n == null || n === '' ? NaN : Number(n)
  if (!Number.isFinite(num)) return '—'
  return `${num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

/** Céntimos enteros → «1.234,56€». */
export function eurCent(c: number | null | undefined): string {
  return c == null || !Number.isFinite(c) ? '—' : eur(c / 100)
}

/**
 * Estado del envío a contabilidad de UNA nómina, leído de su hecho en el outbox `rrhh.hechos_nominas` (`listarNominas`). PURO.
 * null (sin fila) = no consta que se encolara (contabilidad de nóminas apagada al confirmar): no se pinta nada, no se afirma «no enviada».
 */
export function etiquetaContabilidad(estado: string | null | undefined, detalle: string | null | undefined): { texto: string; tono: 'ok' | 'info' | 'alerta' } | null {
  if (estado == null) return null
  if (estado === 'enviado') return (detalle ?? '').startsWith('202') ? { texto: 'En contabilidad, pendiente de regla', tono: 'info' } : { texto: 'Asentada en contabilidad', tono: 'ok' }
  if (estado === 'pendiente') return { texto: 'Contabilidad: pendiente de envío', tono: 'info' }
  if (estado === 'error') return { texto: 'Contabilidad: error, se reintenta', tono: 'alerta' }
  if (estado === 'rechazado') return { texto: 'Contabilidad: rechazada, revisar', tono: 'alerta' }
  return { texto: `Contabilidad: ${estado}`, tono: 'info' }
}
