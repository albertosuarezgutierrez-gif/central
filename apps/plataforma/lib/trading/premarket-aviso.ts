import { tgAviso } from '@/lib/telegram'
import { prisma } from '@/lib/db'
import { gapPremarket, mensajePremarket, UMBRAL_GAP, type MovPremarket } from './premarket'
import type { EntryRadar, Cohete } from './radar'

// Orquestador del vigía del premarket (IO: Prisma + Yahoo + Telegram; la lógica pura vive en
// premarket.ts). Pasada diaria L-V ~15:00 Madrid (premarket maduro en EEUU): mide el gap de los
// símbolos del último snapshot (top-20 + 🚀) y avisa SOLO si alguno supera el umbral, adjuntando
// el 8-K que el snapshot ya traía. Sin movimientos → silencio.
export async function avisoPremarket(): Promise<{ ok: boolean; motivo?: string; revisados?: number; movimientos?: number }> {
  const snap = await prisma.tradingRanking.findFirst({ orderBy: { fecha: 'desc' } })
  if (!snap) return { ok: false, motivo: 'sin-snapshot' }
  const entries = (snap.entries as unknown as EntryRadar[]) ?? []
  const cohetes = (snap.cohetes as unknown as Cohete[] | null) ?? []
  const simbolos = [...new Set([...entries.map(e => e.simbolo), ...cohetes.map(c => c.simbolo)])]

  const eventosPor = new Map<string, string[]>()
  const eventos = (snap.salud as { eventos?: Array<{ simbolo: string; etiquetas: string[] }> } | null)?.eventos ?? []
  for (const ev of eventos) eventosPor.set(ev.simbolo, [...(eventosPor.get(ev.simbolo) ?? []), ...ev.etiquetas])

  const movs: MovPremarket[] = []
  for (const s of simbolos) {
    const g = await gapPremarket(s)
    if (g && Math.abs(g.gap) >= UMBRAL_GAP) movs.push({ simbolo: s, gap: g.gap, etiquetas: eventosPor.get(s) ?? [] })
  }
  const msg = mensajePremarket(movs)
  if (msg) await tgAviso('trading.premarket', msg).catch(() => {})
  return { ok: true, revisados: simbolos.length, movimientos: movs.length }
}
