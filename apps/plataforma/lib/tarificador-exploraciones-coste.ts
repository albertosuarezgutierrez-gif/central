// EXPLORADOR IA — coste REAL (solo servidor, 13/10/2026). La pasarela graba cada llamada en `ai_usos` con
// `cliente_ref = 'explorador:<trabajoId>'` y el coste real (usage × precio). Aquí se suma por exploración. Si no se
// puede leer, el coste queda `null` («no se pudo comprobar»), nunca 0: la pantalla cae al estimado de asegura.
import { prisma } from '@/lib/db'
import { refCosteExplorador } from './tarificador-exploraciones.ts'

/** `trabajoId` → € reales. Un trabajo sin filas en `ai_usos` no aparece (≠ 0). `null` = no se pudo leer. */
export async function costesRealesExploracion(trabajoIds: readonly string[]): Promise<Map<string, number> | null> {
  if (trabajoIds.length === 0) return new Map()
  const refs = trabajoIds.map(refCosteExplorador)
  try {
    const filas = await prisma.$queryRaw<{ cliente_ref: string; coste: number | null }[]>`
      SELECT cliente_ref, sum(coste_eur)::float AS coste
      FROM ai_usos
      WHERE cliente_ref = ANY(${refs}::text[])
      GROUP BY cliente_ref`
    const m = new Map<string, number>()
    for (const f of filas) if (f.coste !== null && Number.isFinite(f.coste)) m.set(f.cliente_ref.slice('explorador:'.length), f.coste)
    return m
  } catch {
    return null
  }
}

/** Añade `costeRealEur` a cada elemento (`null` si no hay dato o no se pudo leer). */
export function conCosteReal<T extends { trabajoId: string }>(items: readonly T[], costes: Map<string, number> | null): (T & { costeRealEur: number | null })[] {
  return items.map((i) => ({ ...i, costeRealEur: costes?.get(i.trabajoId) ?? null }))
}
