// apps/asegura/lib/seguro-anterior-conyuge.ts
//
// Quién cuenta como CÓNYUGE para ofrecer su seguro como «seguro anterior» (07/10/2026, Alberto): en
// motor la bonificación va con el tomador, pero muchas compañías aceptan la del cónyuge/pareja. Puro,
// sin BD: las relaciones entran ya leídas (`listarRelaciones`, que ya deja fuera fichas fusionadas y
// descartadas). Solo `Cónyuge/Pareja de Hecho`: hijos, padres, novios, empresas… NO bonifican.

export const TIPO_CONYUGE = 'Cónyuge/Pareja de Hecho'

export type RelacionParaConyuge = { relacionadoId: string; tipo: string; nombre: string }

/** Los cónyuges/parejas del tomador, sin repetir y sin él mismo. El orden de entrada se respeta. */
export function conyugesDe(relaciones: readonly RelacionParaConyuge[], tomadorId: string): { id: string; nombre: string }[] {
  const vistos = new Set<string>()
  const out: { id: string; nombre: string }[] = []
  for (const r of relaciones) {
    if (r.tipo !== TIPO_CONYUGE || r.relacionadoId === tomadorId || vistos.has(r.relacionadoId)) continue
    vistos.add(r.relacionadoId)
    out.push({ id: r.relacionadoId, nombre: r.nombre.trim() || 'cónyuge' })
  }
  return out
}
