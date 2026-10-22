// ¿El documento que subió el cliente parece antiguo? Decisión PURA, con `hoy` inyectado.
//
// Desfasado = lo leído no sirve para saber qué pasa HOY con la póliza:
//   - el vencimiento leído ya pasó (el papel es de un año anterior), o
//   - no se leyó la prima (no se puede comparar ni cotizar).
// Tres estados, nunca un cajón: `null` = «no se sabe» ≠ desfasado. Sin vencimiento
// pero con prima NO se afirma que esté desfasado (no hay evidencia de que sea viejo).
// El vencimiento de hoy mismo aún no ha pasado.

export type LeidoDelDocumento = {
  /** `YYYY-MM-DD`, o `null` si no se leyó. */
  fechaVencimiento: string | null
  /** Importe leído, o `null` si no se leyó. 0 NO es «no leída»: es un dato. */
  primaAnual: number | null
}

export type MotivoDesfase = 'vencida' | 'sin_prima'

export function motivosDesfase(leido: LeidoDelDocumento, hoy: string): MotivoDesfase[] {
  const motivos: MotivoDesfase[] = []
  if (leido.fechaVencimiento !== null && leido.fechaVencimiento < hoy) motivos.push('vencida')
  if (leido.primaAnual === null || !Number.isFinite(leido.primaAnual)) motivos.push('sin_prima')
  return motivos
}

export function documentoDesfasado(leido: LeidoDelDocumento, hoy: string): boolean {
  return motivosDesfase(leido, hoy).length > 0
}
