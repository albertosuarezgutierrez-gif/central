import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import {
  indicadoresDe, torneo, dimensionar, abrir,
  superaConcentracion, superaLimiteOps,
} from '@central/module-trading'
import type { Vela, Fundamentales } from '@central/module-trading'

type Entrada = { simbolo: string; velas: Vela[]; fundamentales?: Fundamentales; opsRecientes?: number }

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { fecha, nav, simbolos } = (await req.json()) as { fecha: string; nav: number; simbolos: Entrada[] }
  if (!fecha || !nav || !Array.isArray(simbolos)) return NextResponse.json({ error: 'payload inválido' }, { status: 400 })

  const ideas: Array<{ simbolo: string; estrategia: string; direccion: string; confianza: number; operada: boolean; motivo?: string }> = []

  for (const s of simbolos) {
    if (!s.velas?.length) continue
    const ind = indicadoresDe(s.velas)
    const precioRef = s.velas[s.velas.length - 1].cierre
    const señales = torneo(ind, s.fundamentales ?? {}, fecha)

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
    if (!ganadora || ganadora.direccion !== 'alcista') { ideas.push({ simbolo: s.simbolo, estrategia: ganadora?.estrategia ?? 'ninguna', direccion: ganadora?.direccion ?? 'neutral', confianza: ganadora?.confianza ?? 0, operada: false }); continue }

    // Barreras de riesgo.
    const cantidad = dimensionar(nav, precioRef, precioRef - 2 * (ind.atr14 ?? precioRef * 0.02), 0.01)
    const valorPos = cantidad * precioRef
    let motivo: string | undefined
    if (cantidad <= 0) motivo = 'sizing 0'
    else if (superaConcentracion(valorPos, nav)) motivo = 'excede concentración 20%'
    else if (superaLimiteOps(s.opsRecientes ?? 0)) motivo = 'límite de ops por nombre'

    if (!motivo) {
      const pos = abrir(s.simbolo, cantidad, precioRef, ind.atr14 ?? precioRef * 0.02, fecha)
      await prisma.tradingPaperOrden.create({ data: { simbolo: s.simbolo, lado: 'BUY', cantidad, precio: precioRef, fecha: new Date(fecha), motivo: `${ganadora.estrategia} conf ${ganadora.confianza}` } })
      await prisma.tradingPaperPosicion.upsert({
        where: { simbolo: s.simbolo },
        create: { simbolo: s.simbolo, cantidad, precioEntrada: precioRef, stop: pos.stop, abiertaEn: new Date(fecha) },
        update: {},   // no promediar: si ya existe, no se toca
      })
    }
    ideas.push({ simbolo: s.simbolo, estrategia: ganadora.estrategia, direccion: ganadora.direccion, confianza: ganadora.confianza, operada: !motivo, motivo })
  }

  ideas.sort((a, b) => b.confianza - a.confianza)
  return NextResponse.json({ fecha, top: ideas.slice(0, 5), total: ideas.length })
}
