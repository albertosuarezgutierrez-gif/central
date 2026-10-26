// Orden de lo que corre en `after` tras un `ok` del worker (26/10/2026). PURA: las dependencias se inyectan.
//
// 🚨 El BORRADOR del presupuesto + Telegram a Alberto va PRIMERO y no espera a la extracción de coberturas: la IA puede tardar
//    hasta su timeout (90 s) y la ruta tiene `maxDuration = 90`; si Vercel cortase en mitad de la extracción, el borrador no saldría nunca.
//    La extracción corre EN PARALELO con un tope propio (`TOPE_EXTRACCION_MS`) y nunca lanza.

export const TOPE_EXTRACCION_MS = 40_000

export type DepsTrasRpa = {
  borrador: (trabajoId: string) => Promise<{ estado: string; motivo?: string }>
  extraer: (trabajoId: string) => Promise<{ estado: string; motivo?: string }>
  error: (...args: unknown[]) => void
}

export async function trasResultadoRpa(trabajoId: string, deps: DepsTrasRpa, topeMs = TOPE_EXTRACCION_MS): Promise<void> {
  // El borrador se LANZA primero (síncrono hasta su primer await), antes de tocar la extracción.
  const pBorrador = deps.borrador(trabajoId)
    .then((p) => { if (p.estado === 'error') deps.error('[tarificador] presupuesto tras RPA', trabajoId, p.motivo) })
    .catch((e) => deps.error('[tarificador] presupuesto tras RPA', trabajoId, e instanceof Error ? e.message.slice(0, 300) : e))
  let reloj: ReturnType<typeof setTimeout> | undefined
  const tope = new Promise<'tope'>((res) => { reloj = setTimeout(() => res('tope'), topeMs) })
  const pExtraccion = deps.extraer(trabajoId)
    .then((e) => { if (e.estado === 'fallo') deps.error('[tarificador] coberturas tras RPA', trabajoId, e.motivo); return 'fin' as const })
    .catch((e) => { deps.error('[tarificador] coberturas tras RPA', trabajoId, e instanceof Error ? e.message.slice(0, 300) : e); return 'fin' as const })
  const quien = await Promise.race([pExtraccion, tope])
  if (reloj) clearTimeout(reloj)
  if (quien === 'tope') deps.error('[tarificador] coberturas tras RPA', trabajoId, `sin terminar en ${topeMs} ms (se sigue sin ellas)`)
  await pBorrador
}
