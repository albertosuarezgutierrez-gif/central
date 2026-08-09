import { NextResponse, type NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { tgSend } from '@/lib/telegram'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { mensajeCompraPaper } from '@/lib/trading-notify'
import {
  indicadoresDe, torneo, dimensionar, abrir,
  superaConcentracion, superaLimiteOps, earningsInminente, bajoTendencia, factorFlojo, regimenMercado, ajustesDeStats, rvol, confirmaVolumen,
} from '@central/module-trading'
import type { Vela, Fundamentales } from '@central/module-trading'
import { datosYahoo, lineaEarningsProximos, type FechaEarnings } from '@/lib/trading/earnings-yahoo'
import { filtrarPreciosAnomalos, resumenDescartes, detectarSuplantaciones, resumenSuplantaciones, contrastarFuentes, resumenDivergencias, DIAS_REFERENCIA_MAX } from '@/lib/trading/precios-guardia'
import { cierresDeContraste } from '@/lib/trading/precios-contraste'

type Entrada = { simbolo: string; velas: Vela[]; fundamentales?: Fundamentales; opsRecientes?: number; factorScore?: number }

// El contraste de precios sale a internet una vez por símbolo (además de los fundamentales de Yahoo,
// que ya lo hacían). Techo alto + presupuesto acotado dentro: lo que garantiza que la pasada VUELVE es
// el presupuesto, no el techo (lección de `facturas-scan`, 31/07/2026).
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { fecha, nav, simbolos, indice, minFactorScore } = (await req.json()) as { fecha: string; nav: number; simbolos: Entrada[]; indice?: { cierres: number[] }; minFactorScore?: number }
  if (!fecha || !nav || !Array.isArray(simbolos)) return NextResponse.json({ error: 'payload inválido' }, { status: 400 })

  // Contador de pasadas del día: los únicos anti-duplicado hacen INVISIBLE un reintento en los datos,
  // así que se cuenta aquí y se avisa UNA vez (al llegar a 2) si la rutina corre repetida. Best-effort.
  try {
    const [p] = await prisma.$queryRaw<{ analizar: number }[]>`
      INSERT INTO trading_pasadas (fecha, analizar) VALUES (${new Date(fecha)}, 1)
      ON CONFLICT (fecha) DO UPDATE SET analizar = trading_pasadas.analizar + 1
      RETURNING analizar`
    if (p?.analizar === 2) {
      await tgSend(`⚠️ <b>Trading:</b> la pasada de ${fecha} ha corrido 2 veces (reintento de la rutina). Los únicos evitan duplicados, pero conviene mirar por qué se repite.`).catch(() => {})
    }
  } catch (e) { console.warn('[trading/analizar] contador de pasadas falló (no bloquea):', e) }

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

  // 📅💼 Fundamentales de Yahoo para lo que el payload NO traiga: fecha de earnings (activa la
  // barrera `earningsInminente` ≤3d y la estrategia catalizador) y PER/PB/deuda-EBITDA/margen
  // (reactiva la estrategia «valor», que sin fundamentales queda neutral). Con FMP sin créditos
  // TODO esto llegaba vacío y las tres degradaban a no-actuar en silencio (la pasada del 05/08
  // podía abrir paper en SNDK/WDC la noche de sus resultados sin saberlo). Lo que el agente sí
  // aporte (FMP u otra fuente) NUNCA se pisa. Best-effort: si Yahoo falla, queda como estaba.
  const datosPorSimbolo = await Promise.all(simbolos.map(async s => ({ simbolo: s.simbolo, datos: await datosYahoo(s.simbolo, fecha) })))
  const datosPor = new Map(datosPorSimbolo.map(d => [d.simbolo, d.datos]))
  const fechasEarnings: Array<{ simbolo: string; earnings: FechaEarnings | null }> = []
  for (const s of simbolos) {
    const d = datosPor.get(s.simbolo)
    fechasEarnings.push({
      simbolo: s.simbolo,
      earnings: s.fundamentales?.proximoEarnings
        ? { fecha: s.fundamentales.proximoEarnings, confirmada: false }   // la fecha de FMP no dice si la anunció la empresa
        : d?.earnings ?? null,
    })
    if (!d) continue
    s.fundamentales = {
      ...(s.fundamentales ?? {}),
      per: s.fundamentales?.per ?? d.per,
      pb: s.fundamentales?.pb ?? d.pb,
      deudaEbitda: s.fundamentales?.deudaEbitda ?? d.deudaEbitda,
      margenNeto: s.fundamentales?.margenNeto ?? d.margenNeto,
      proximoEarnings: s.fundamentales?.proximoEarnings ?? d.earnings?.fecha,
    }
  }

  // 🚨 GUARDIA DE PRECIOS — aquí está el ORIGEN del envenenamiento del 03/08/2026 (CVX a 590,17 con
  // cierre real 193,18; ver `lib/trading/precios-guardia.ts`). El precio malo no solo se guardaba como
  // `precio_ref`: TODA la serie de velas de ese símbolo entra en `indicadoresDe`, así que EMA, MACD, RSI,
  // ADX y ATR salían de una vela falsa y las tesis del día no eran conocimiento. Por eso un símbolo con
  // el último cierre fuera de rango se salta ENTERO — no se le recorta el precio: no se le cree nada.
  // Sin referencia reciente no se juzga (símbolo nuevo): la guardia nunca inventa un veto.
  const cierresHoy = Object.fromEntries(
    simbolos.filter(s => s.velas?.length).map(s => [s.simbolo, s.velas[s.velas.length - 1].cierre]),
  )
  // `anulado = false`: una tesis anulada lo está porque su `precio_ref` resultó ser de otra empresa.
  // Usarla de referencia sería medir el precio de hoy contra la mentira de anteayer — la guardia
  // validaría lo torcido y descartaría lo recto.
  const refFilas = await prisma.$queryRaw<Array<{ simbolo: string; precio: number }>>`
    SELECT DISTINCT ON (simbolo) simbolo, precio_ref AS precio
    FROM trading_tesis
    WHERE fecha < ${fecha}::date AND fecha >= ${fecha}::date - ${DIAS_REFERENCIA_MAX} AND NOT anulado
    ORDER BY simbolo, fecha DESC`
  const referencias = Object.fromEntries(refFilas.map(f => [f.simbolo, f.precio]))
  const { limpios, descartados } = filtrarPreciosAnomalos(cierresHoy, referencias)

  // 0-ter) ¿ES SUYO ESTE PRECIO? Las dos guardias siguientes discuten si el número es creíble; esta
  // pregunta de quién es. El barajado de los `get_price_history` paralelos produce cierres REALES bajo
  // la etiqueta equivocada, y contra eso un umbral de plausibilidad no puede nada. Ver el detalle y los
  // tres casos verificados en `lib/trading/precios-guardia.ts`.
  const { limpios: propios, suplantados } = detectarSuplantaciones(limpios, referencias)

  // 0-bis) SEGUNDO PAR DE OJOS. El ×2 de arriba solo caza lo escandaloso; un error del 10% entra limpio
  // y contamina los indicadores del día igual de bien. Se pregunta el MISMO cierre a la fuente propia
  // del servidor (Stooq con respaldo Yahoo) y el que no cuadre se veta. Presupuesto acotado: los
  // símbolos que no dan tiempo salen «sin contraste», que deja pasar el precio — un contraste a medias
  // nunca puede bloquear la pasada entera.
  const contraste = await cierresDeContraste(Object.keys(propios), fecha, { presupuestoMs: 90_000 })
  const { divergentes, sinContraste } = contrastarFuentes(propios, contraste.cierres)

  const vetados = new Set([
    ...descartados.map(d => d.simbolo),
    ...suplantados.map(s => s.simbolo),
    ...divergentes.map(d => d.simbolo),
  ])
  const aviso = [resumenDescartes(descartados), resumenSuplantaciones(suplantados), resumenDivergencias(divergentes)]
    .filter(Boolean).join('\n')
  if (aviso) {
    console.warn('[trading/analizar]', aviso)
    // Se avisa SIEMPRE: un símbolo que desaparece del análisis en silencio es indistinguible de un
    // símbolo que hoy no dio señal, y eso es justo lo que dejó pasar el 03/08 sin que nadie mirara.
    await tgSend(`⚠️ <b>Trading ${fecha}:</b> precio no fiable, esos símbolos NO se analizan hoy.\n${aviso}`).catch(() => {})
  }

  const ideas: Array<{ simbolo: string; estrategia: string; direccion: string; confianza: number; operada: boolean; motivo?: string; rvol?: number | null; volConfirma?: string; factorScore?: number }> = []

  for (const s of simbolos) {
    if (!s.velas?.length) continue
    if (vetados.has(s.simbolo)) continue
    const ind = indicadoresDe(s.velas)
    const precioRef = s.velas[s.velas.length - 1].cierre
    const volumenRel = rvol(s.velas.map(v => v.volumen))   // volumen de hoy vs su media
    const señales = torneo(ind, s.fundamentales ?? {}, fecha, ajustes)

    // Persistir todas las señales como tesis. skipDuplicates + único (simbolo,fecha,estrategia):
    // si la pasada se reintenta el mismo día, no duplica filas (el 04/08 corrió 5 veces y dejó
    // 288 tesis donde tocaban 52 — habría inflado el n del walk-forward).
    await prisma.tradingTesis.createMany({
      data: señales.map(se => ({
        simbolo: s.simbolo, fecha: new Date(fecha), estrategia: se.estrategia,
        direccion: se.direccion, confianza: se.confianza, horizonteDias: 10,
        precioRef, precioFuente: 'sesion', indicadores: ind as object, rationale: se.rationale,
      })),
      skipDuplicates: true,
    })

    // Ganadora = mayor confianza entre las no-neutrales.
    const ganadora = [...señales].filter(x => x.direccion !== 'neutral').sort((a, b) => b.confianza - a.confianza)[0]
    if (!ganadora || ganadora.direccion !== 'alcista') { ideas.push({ simbolo: s.simbolo, estrategia: ganadora?.estrategia ?? 'ninguna', direccion: ganadora?.direccion ?? 'neutral', confianza: ganadora?.confianza ?? 0, operada: false, rvol: volumenRel, volConfirma: confirmaVolumen(ganadora?.direccion ?? 'neutral', volumenRel) }); continue }

    // Barreras de riesgo.
    const cantidad = dimensionar(nav, precioRef, precioRef - 2 * (ind.atr14 ?? precioRef * 0.02), 0.01)
    const valorPos = cantidad * precioRef
    // Posición ya abierta = barrera, ANTES de registrar nada: un reintento de la misma pasada (o una
    // señal repetida en días siguientes) no debe crear otra orden BUY (el 04/08 quedaron 5 idénticas,
    // y cada duplicada inflaba opsPorNombre para la barrera de límite de ops).
    const yaAbierta = await prisma.tradingPaperPosicion.findUnique({ where: { simbolo: s.simbolo } })
    let motivo: string | undefined
    if (yaAbierta) motivo = 'posición ya abierta'
    else if (!riskOn) motivo = 'régimen bajista (SPY<SMA200)'
    // SELECCIÓN filtra al TIMING (Fase B): un nombre fundamentalmente flojo vs sus pares no se compra
    // aunque el gráfico dé señal. Degrada si el agente no aporta factorScore/minFactorScore.
    else if (factorFlojo(s.factorScore, minFactorScore)) motivo = `factor flojo (${s.factorScore?.toFixed(2)} < ${minFactorScore})`
    else if (cantidad <= 0) motivo = 'sizing 0'
    else if (superaConcentracion(valorPos, nav)) motivo = 'excede concentración 20%'
    else if (superaLimiteOps(s.opsRecientes ?? opsPorNombre.get(s.simbolo) ?? 0)) motivo = 'límite de ops por nombre'
    else if (earningsInminente(s.fundamentales?.proximoEarnings, fecha)) motivo = 'earnings inminente (≤3d)'
    else if (bajoTendencia(precioRef, ind.sma50)) motivo = 'bajo SMA50 (tendencia de fondo bajista)'

    // Señal ganadora alcista VETADA: se persiste el porqué en su tesis (lo pinta /trading agrupado).
    if (motivo) {
      await prisma.tradingTesis.updateMany({
        where: { simbolo: s.simbolo, fecha: new Date(fecha), estrategia: ganadora.estrategia, direccion: 'alcista' },
        data: { motivoBloqueo: motivo },
      })
    }

    if (!motivo) {
      const pos = abrir(s.simbolo, cantidad, precioRef, ind.atr14 ?? precioRef * 0.02, fecha)
      // createMany+skipDuplicates y no create: con el único (simbolo,lado,fecha) un reintento no revienta ni duplica.
      await prisma.tradingPaperOrden.createMany({ data: [{ simbolo: s.simbolo, lado: 'BUY', cantidad, precio: precioRef, fecha: new Date(fecha), motivo: `${ganadora.estrategia} conf ${ganadora.confianza}` }], skipDuplicates: true })
      // Marca la tesis GANADORA (recién insertada arriba) como comprada de verdad: es la única fila
      // (simbolo,fecha,estrategia) de esta pasada, así que el updateMany impacta exactamente esa señal.
      // El panel «Ideas de compra del agente» filtra por `operada` → no muestra señales que el agente no compró.
      await prisma.tradingTesis.updateMany({
        where: { simbolo: s.simbolo, fecha: new Date(fecha), estrategia: ganadora.estrategia, direccion: 'alcista' },
        data: { operada: true },
      })
      await prisma.tradingPaperPosicion.upsert({
        where: { simbolo: s.simbolo },
        create: { simbolo: s.simbolo, cantidad, precioEntrada: precioRef, stop: pos.stop, abiertaEn: new Date(fecha) },
        update: {},   // no promediar: si ya existe, no se toca
      })
      // Aviso inmediato por Telegram (aquí la posición es siempre nueva: `yaAbierta` es barrera arriba). Best-effort.
      await tgSend(mensajeCompraPaper(fecha, { simbolo: s.simbolo, cantidad, precio: precioRef, estrategia: ganadora.estrategia, confianza: ganadora.confianza, stop: pos.stop, pctNav: valorPos / nav })).catch(() => {})
    }
    ideas.push({ simbolo: s.simbolo, estrategia: ganadora.estrategia, direccion: ganadora.direccion, confianza: ganadora.confianza, operada: !motivo, motivo, rvol: volumenRel, volConfirma: confirmaVolumen(ganadora.direccion, volumenRel), factorScore: s.factorScore })
  }

  // 📅 Aviso diario de resultados inminentes en la watchlist (el digest del radar es semanal y los
  // earnings caen entre semana). Contexto para Alberto — el veto ya lo aplicó la barrera de arriba.
  const lineaEarnings = lineaEarningsProximos(fechasEarnings, fecha)
  if (lineaEarnings) await tgSend(lineaEarnings).catch(() => {})

  // 💓 Huella de que el ANÁLISIS corrió. No puede ser `max(trading_tesis.created_at)`: con el único
  // (simbolo,fecha,estrategia) + skipDuplicates de arriba, una segunda pasada del MISMO día no inserta
  // ni una fila, así que el reloj de la tabla se queda clavado en la primera. Pasó el 06/08/2026 —
  // `/analizar` corrió a las 09:34 UTC (repaso manual) y otra vez esa noche; la nocturna fue un no-op
  // en datos y a la mañana siguiente el watchdog vio «21 h sin tesis» y avisó de una pasada que SÍ
  // había corrido entera. Igual que `/puntuar`: la huella se escribe siempre, haya filas nuevas o no.
  // Best-effort (no rompe la respuesta si la tabla no está).
  await registrarLatido(
    'trading_analizar',
    true,
    `${ideas.length} símbolo(s) analizados · ${ideas.filter(i => i.operada).length} operado(s) en paper` +
      (vetados.size > 0 ? ` · ⚠️ ${vetados.size} vetado(s) por precio no fiable` : '') +
      (sinContraste.length > 0 ? ` · ${sinContraste.length} sin 2ª fuente` : ''),
  )

  ideas.sort((a, b) => b.confianza - a.confianza)
  // `vetados` y `sinContraste` viajan en la respuesta para que la sesión los cante: un símbolo que
  // desaparece del análisis sin decirlo se confunde con uno que hoy no dio señal.
  return NextResponse.json({
    fecha, top: ideas.slice(0, 5), total: ideas.length,
    vetados: [...vetados], descartados, suplantados, divergentes,
    contraste: { consultados: contraste.consultados, sinDato: contraste.sinDato, sinTiempo: contraste.sinTiempo, sinJuzgar: sinContraste },
  })
}
