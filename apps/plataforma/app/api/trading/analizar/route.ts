import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import {
  indicadoresDe, torneo, dimensionar, abrir,
  superaConcentracion, superaLimiteOps, earningsInminente, bajoTendencia, regimenMercado, ajustesDeStats, rvol, confirmaVolumen,
} from '@central/module-trading'
import type { Vela, Fundamentales } from '@central/module-trading'

type Entrada = { simbolo: string; velas: Vela[]; fundamentales?: Fundamentales; opsRecientes?: number }

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { fecha, nav, simbolos, indice } = (await req.json()) as { fecha: string; nav: number; simbolos: Entrada[]; indice?: { cierres: number[] } }
  if (!fecha || !nav || !Array.isArray(simbolos)) return NextResponse.json({ error: 'payload inválido' }, { status: 400 })

  // Régimen de mercado (SPY): si está risk-off (SPY<SMA200), no se abre ningún largo nuevo. Degrada a
  // risk-on si no se pasa el índice.
  const riskOn = indice?.cierres ? regimenMercado(indice.cierres).riskOn : true
  // Ops recientes REALES por nombre (últimos 30 días): antes llegaba 0 siempre y la barrera era inerte.
  const desde = new Date(new Date(fecha).getTime() - 30 * 86_400_000)
  const ordenesRecientes = await prisma.tradingPaperOrden.findMany({ where: { fecha: { gte: desde } }, select: { simbolo: true } })
  const opsPorNombre = new Map<string, number>()
  for (const o of ordenesRecientes) opsPorNombre.set(o.simbolo, (opsPorNombre.get(o.simbolo) ?? 0) + 1)

  // Bucle de aprendizaje: modula la confianza de cada estrategia por su rendimiento real acumulado.
  // Solo ajusta con muestra suficiente (ajustesDeStats guarda por minN); sin historial no toca nada.
  const statsRows = await prisma.tradingEstrategiaStats.findMany({ where: { regimen: 'todos' } })
  const ajustes = ajustesDeStats(Object.fromEntries(statsRows.map(r => [r.estrategia, { hitRate: r.hitRate, retornoMedio: r.retornoMedio, n: r.n }])))

  const ideas: Array<{ simbolo: string; estrategia: string; direccion: string; confianza: number; operada: boolean; motivo?: string; rvol?: number | null; volConfirma?: string }> = []

  for (const s of simbolos) {
    if (!s.velas?.length) continue
    const ind = indicadoresDe(s.velas)
    const precioRef = s.velas[s.velas.length - 1].cierre
    const volumenRel = rvol(s.velas.map(v => v.volumen))   // volumen de hoy vs su media
    const señales = torneo(ind, s.fundamentales ?? {}, fecha, ajustes)

    // Persistir todas las señales como tesis.
    await prisma.tradingTesis.createMany({
      data: señales.map(se => ({
        simbolo: s.simbolo, fecha: new Date(fecha), estrategia: se.estrategia,
        direccion: se.direccion, confianza: se.confianza, horizonteDias: 10,
        precioRef, indicadores: ind as object, rationale: se.rationale,
      })),
    })

    // Ganadora = mayor confianza entre las no-neutrales.
    const ganadora = [...señales].filter(x => x.direccion !== 'neutral').sort((a, b) => b.confianza - a.confianza)[0]
    if (!ganadora || ganadora.direccion !== 'alcista') { ideas.push({ simbolo: s.simbolo, estrategia: ganadora?.estrategia ?? 'ninguna', direccion: ganadora?.direccion ?? 'neutral', confianza: ganadora?.confianza ?? 0, operada: false, rvol: volumenRel, volConfirma: confirmaVolumen(ganadora?.direccion ?? 'neutral', volumenRel) }); continue }

    // Barreras de riesgo.
    const cantidad = dimensionar(nav, precioRef, precioRef - 2 * (ind.atr14 ?? precioRef * 0.02), 0.01)
    const valorPos = cantidad * precioRef
    let motivo: string | undefined
    if (!riskOn) motivo = 'régimen bajista (SPY<SMA200)'
    else if (cantidad <= 0) motivo = 'sizing 0'
    else if (superaConcentracion(valorPos, nav)) motivo = 'excede concentración 20%'
    else if (superaLimiteOps(s.opsRecientes ?? opsPorNombre.get(s.simbolo) ?? 0)) motivo = 'límite de ops por nombre'
    else if (earningsInminente(s.fundamentales?.proximoEarnings, fecha)) motivo = 'earnings inminente (≤3d)'
    else if (bajoTendencia(precioRef, ind.sma50)) motivo = 'bajo SMA50 (tendencia de fondo bajista)'

    if (!motivo) {
      const pos = abrir(s.simbolo, cantidad, precioRef, ind.atr14 ?? precioRef * 0.02, fecha)
      await prisma.tradingPaperOrden.create({ data: { simbolo: s.simbolo, lado: 'BUY', cantidad, precio: precioRef, fecha: new Date(fecha), motivo: `${ganadora.estrategia} conf ${ganadora.confianza}` } })
      await prisma.tradingPaperPosicion.upsert({
        where: { simbolo: s.simbolo },
        create: { simbolo: s.simbolo, cantidad, precioEntrada: precioRef, stop: pos.stop, abiertaEn: new Date(fecha) },
        update: {},   // no promediar: si ya existe, no se toca
      })
    }
    ideas.push({ simbolo: s.simbolo, estrategia: ganadora.estrategia, direccion: ganadora.direccion, confianza: ganadora.confianza, operada: !motivo, motivo, rvol: volumenRel, volConfirma: confirmaVolumen(ganadora.direccion, volumenRel) })
  }

  ideas.sort((a, b) => b.confianza - a.confianza)
  return NextResponse.json({ fecha, top: ideas.slice(0, 5), total: ideas.length })
}
