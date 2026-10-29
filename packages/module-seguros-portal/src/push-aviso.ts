// Datos extra del payload del push (29/10/2026): etiqueta por póliza, botones y contador del icono.
// Puro y sin PII: solo ids de póliza (ya van en la url) y un número.
import { siniestroAbierto } from './siniestro-historial.ts'
import type { EventoCima, PolizaParaAviso } from './avisos-cima.ts'

export type AccionPush = { action: string; title: string; url: string }

/** Una notificación por póliza: `poliza-<id>` si TODAS las novedades son de la misma; si no, sin etiqueta. */
export function tagPushCima(eventos: readonly EventoCima[]): string | undefined {
  if (eventos.length === 0) return undefined
  const ids = new Set(eventos.map((e) => e.polizaId))
  return ids.size === 1 ? `poliza-${[...ids][0]}` : undefined
}

/** Tag del push de una obligación: su póliza de cartera; la aportada lleva su propio prefijo; sin póliza, nada. */
export function tagPushObligacion(o: { polizaId: string | null; polizaDeclaradaId: string | null }): string | undefined {
  if (o.polizaId) return `poliza-${o.polizaId}`
  if (o.polizaDeclaradaId) return `anadida-${o.polizaDeclaradaId}`
  return undefined
}

/** Botón «Ver recibo» (a la ancla del recibo devuelto) solo si hay un recibo devuelto. Sin recibo devuelto, sin botones. */
export function accionesPushCima(eventos: readonly EventoCima[]): AccionPush[] {
  const dev = eventos.find((e) => e.tipo === 'recibo_devuelto' && e.url)
  return dev?.url ? [{ action: 'ver', title: 'Ver recibo', url: dev.url }] : []
}

/**
 * Pendientes para el contador del icono: recibos devueltos + siniestros abiertos de lo ya leído.
 * `null` = no se pudo leer ninguna lista (no se sabe ≠ 0): no se toca el contador.
 */
export function pendientesBadge(polizas: readonly Pick<PolizaParaAviso, 'recibos' | 'siniestros'>[]): number | null {
  let leido = false
  let n = 0
  for (const p of polizas) {
    if (p.recibos !== null) {
      leido = true
      n += p.recibos.filter((r) => r.situacion.trim().toLowerCase() === 'devuelto').length
    }
    if (p.siniestros !== null) {
      leido = true
      n += p.siniestros.filter((s) => siniestroAbierto(s.estado)).length
    }
  }
  return leido ? n : null
}
