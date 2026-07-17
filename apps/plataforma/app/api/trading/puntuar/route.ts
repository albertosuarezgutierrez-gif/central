import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { puntuarTesis, agregarStats, aplicarStop, cerrar } from '@central/module-trading'
import type { Tesis } from '@central/module-trading'

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { hoy, precios } = (await req.json()) as { hoy: string; precios: Record<string, number> }
  const hoyMs = new Date(hoy).getTime()

  // 1) Puntuar tesis vencidas sin resultado.
  const pendientes = await prisma.tradingTesis.findMany({ where: { resultado: null } })
  let puntuadas = 0
  for (const t of pendientes) {
    const vence = new Date(t.fecha).getTime() + t.horizonteDias * 86_400_000
    const precio = precios[t.simbolo]
    if (vence > hoyMs || precio === undefined) continue
    const r = puntuarTesis(t as unknown as Tesis, precio)
    await prisma.tradingTesisResultado.create({ data: { tesisId: t.id, precioDespues: precio, ventanaDias: t.horizonteDias, retorno: r.retorno, acierto: r.acierto } })
    puntuadas++
  }

  // 2) Recomputar stats por estrategia (régimen 'todos' en Fase 1; se refina con snapshot por tesis después).
  const resultados = await prisma.tradingTesisResultado.findMany({ include: { tesis: true } })
  const stats = agregarStats(resultados.map(r => ({ estrategia: r.tesis.estrategia as Tesis['estrategia'], acierto: r.acierto, retorno: r.retorno })))
  for (const [est, s] of Object.entries(stats)) {
    await prisma.tradingEstrategiaStats.upsert({
      where: { estrategia_regimen: { estrategia: est, regimen: 'todos' } },
      create: { estrategia: est, regimen: 'todos', hitRate: s.hitRate, retornoMedio: s.retornoMedio, n: s.n },
      update: { hitRate: s.hitRate, retornoMedio: s.retornoMedio, n: s.n },
    })
  }

  // 3) Stops sobre posiciones paper.
  const posiciones = await prisma.tradingPaperPosicion.findMany()
  let cerradas = 0
  for (const p of posiciones) {
    const precio = precios[p.simbolo]
    if (precio === undefined) continue
    if (aplicarStop({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio)) {
      const o = cerrar({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio, hoy, 'stop')
      await prisma.tradingPaperOrden.create({ data: { simbolo: o.simbolo, lado: 'SELL', cantidad: o.cantidad, precio: o.precio, fecha: new Date(hoy), motivo: o.motivo } })
      await prisma.tradingPaperPosicion.delete({ where: { simbolo: p.simbolo } })
      cerradas++
    }
  }

  return NextResponse.json({ puntuadas, cerradas, estrategias: Object.keys(stats).length })
}
