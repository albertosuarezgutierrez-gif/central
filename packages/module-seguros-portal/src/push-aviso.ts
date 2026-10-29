// Datos extra del payload del push (29/10/2026): etiqueta por póliza y botones.
// Puro y sin PII: solo ids de póliza (ya van en la url) y un número.
import type { EventoCima } from './avisos-cima.ts'

export type AccionPush = { action: string; title: string; url: string }

/** Una notificación por póliza: `cima-poliza-<id>` si TODAS las novedades son de la misma; si no, sin etiqueta. */
export function tagPushCima(eventos: readonly EventoCima[]): string | undefined {
  if (eventos.length === 0) return undefined
  const ids = new Set(eventos.map((e) => e.polizaId))
  return ids.size === 1 ? `cima-poliza-${[...ids][0]}` : undefined
}

/** Tag del push de una obligación (prefijo `oblig-`, distinto del de CIMA: un recordatorio no pisa un aviso de recibo): su póliza de cartera; la aportada lleva su propio prefijo; sin póliza, nada. */
export function tagPushObligacion(o: { polizaId: string | null; polizaDeclaradaId: string | null }): string | undefined {
  if (o.polizaId) return `oblig-poliza-${o.polizaId}`
  if (o.polizaDeclaradaId) return `oblig-anadida-${o.polizaDeclaradaId}`
  return undefined
}

/** Botón «Ver recibo» (a la ancla del recibo devuelto) solo si hay un recibo devuelto. Sin recibo devuelto, sin botones. */
export function accionesPushCima(eventos: readonly EventoCima[]): AccionPush[] {
  const dev = eventos.find((e) => e.tipo === 'recibo_devuelto' && e.url)
  return dev?.url ? [{ action: 'ver', title: 'Ver recibo', url: dev.url }] : []
}
