import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { puntuarTesis, agregarStats, aplicarStop, cerrar } from '@central/module-trading'
import type { Tesis } from '@central/module-trading'

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
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

  // 2-bis) Deslizamiento (proxy): a las órdenes de días ANTERIORES sin dato se les apunta el precio de
  // hoy si es su primer día hábil siguiente. En real no se ejecuta al cierre de la señal — esta columna
  // mide cuánto cuesta esa espera, y decidirá si el tramo 1 real replica al paper. Best-effort.
  try {
    const sinDato = await prisma.tradingPaperOrden.findMany({ where: { precioDiaSiguiente: null, fecha: { lt: new Date(hoy) } } })
    for (const o of sinDato) {
      const precio = precios[o.simbolo]
      // Solo el PRIMER precio tras la señal (≤5 días naturales cubre fines de semana/festivos): más tarde
      // ya no mide deslizamiento sino deriva, y mejor NULL («no lo sé») que un dato con otro significado.
      const diasDesde = (new Date(hoy).getTime() - new Date(o.fecha).getTime()) / 86_400_000
      if (precio === undefined || diasDesde > 5) continue
      await prisma.tradingPaperOrden.update({ where: { id: o.id }, data: { precioDiaSiguiente: precio } })
    }
  } catch (e) { console.warn('[trading/puntuar] deslizamiento falló (no bloquea):', e) }

  // 3) Stops sobre posiciones paper.
  const posiciones = await prisma.tradingPaperPosicion.findMany()
  let cerradas = 0
  for (const p of posiciones) {
    const precio = precios[p.simbolo]
    if (precio === undefined) continue
    if (aplicarStop({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio)) {
      const o = cerrar({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio, hoy, 'stop')
      // createMany+skipDuplicates: con el único (simbolo,lado,fecha) un reintento de la pasada no duplica ni revienta.
      await prisma.tradingPaperOrden.createMany({ data: [{ simbolo: o.simbolo, lado: 'SELL', cantidad: o.cantidad, precio: o.precio, fecha: new Date(hoy), motivo: o.motivo }], skipDuplicates: true })
      await prisma.tradingPaperPosicion.delete({ where: { simbolo: p.simbolo } })
      cerradas++
    }
  }

  return NextResponse.json({ puntuadas, cerradas, estrategias: Object.keys(stats).length })
}
