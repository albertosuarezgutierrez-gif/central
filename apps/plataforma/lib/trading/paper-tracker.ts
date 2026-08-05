import { tgSend } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { cierresDiarios } from './precios-stooq'
import { evaluarCestaVsBench, metricasRiesgoCesta, type EvalCesta, type MetricasRiesgo } from '@central/module-trading'
import { COHORTES_PAPER, COHORTE_ULTIMA, DIAS_ENTRE_COHORTES, type CarteraPaper } from './paper-cartera'

// Seguimiento del FORWARD PAPER (Fase B): mide cada cesta CONGELADA (`paper-cartera.ts`) vs el SPY desde
// su `fechaInicio` con precios gratis (Stooq→Yahoo), PERSISTE un snapshot por cohorte (curva del forward)
// y manda un digest por Telegram. Además calcula MÉTRICAS DE RIESGO (drawdown/vol/tracking error, idea 3)
// y la ATRIBUCIÓN del filtro de calidad (cesta combinada vs gurús-solo, idea 4). Lo dispara un cron
// SEMANAL de Vercel (su egress a Stooq/Yahoo sí sale; la rutina Claude no llega a Vercel, ver 403). Sin
// look-ahead: las cestas se fijaron ANTES. SOLO paper — no opera ni ejecuta órdenes reales.

const hoy = () => new Date().toISOString().slice(0, 10)
const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pct = (x: number | null | undefined): string => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)
const pct0 = (x: number | null | undefined): string => (x == null ? '—' : `${(x * 100).toFixed(0)}%`)
const dias = (d1: string, d2: string): number => Math.max(0, Math.round((Date.parse(d2) - Date.parse(d1)) / 86_400_000))

export type MedidaPaper = {
  cohorte: string          // version de la cohorte
  fechaInicio: string
  hoy: string
  diasTranscurridos: number
  benchmark: string
  resultado: EvalCesta | null       // cesta combinada (media/alpha/bate/porSimbolo)
  medianaCesta: number | null
  riesgo: MetricasRiesgo | null     // drawdown/vol/tracking error (idea 3)
  resultadoBase: EvalCesta | null   // cesta gurús-solo (atribución, idea 4) — null si la cohorte no la tiene
  medianaBase: number | null
}

// Calcula el rendimiento hacia delante de UNA cohorte congelada vs su benchmark, con riesgo y atribución.
// Best-effort (precios): lo que no haya (base ausente, fuente caída) queda a null sin romper.
export async function medirCohorte(c: CarteraPaper): Promise<MedidaPaper> {
  const d1 = c.fechaInicio
  const d2 = hoy()
  const base = c.simbolosBase ?? []
  const [bench, series, serieBase] = await Promise.all([
    cierresDiarios(c.benchmark, d1, d2),
    Promise.all(c.simbolos.map(s => cierresDiarios(s, d1, d2))),
    Promise.all(base.map(s => cierresDiarios(s, d1, d2))),
  ])

  const cesta = c.simbolos.map((simbolo, i) => ({ simbolo, cierres: series[i] }))
  const resultado = evaluarCestaVsBench(cesta, bench)
  const medianaCesta = resultado ? mediana(resultado.porSimbolo.map(x => x.retorno)) : null
  const riesgo = metricasRiesgoCesta(series, bench)

  const cestaBase = base.map((simbolo, i) => ({ simbolo, cierres: serieBase[i] }))
  const resultadoBase = base.length ? evaluarCestaVsBench(cestaBase, bench) : null
  const medianaBase = resultadoBase ? mediana(resultadoBase.porSimbolo.map(x => x.retorno)) : null

  return {
    cohorte: c.version, fechaInicio: d1, hoy: d2, diasTranscurridos: dias(d1, d2), benchmark: c.benchmark,
    resultado, medianaCesta, riesgo, resultadoBase, medianaBase,
  }
}

// Mide TODAS las cohortes (la más antigua primero, como en `COHORTES_PAPER`).
export async function medirTodasCohortes(): Promise<MedidaPaper[]> {
  return Promise.all(COHORTES_PAPER.map(medirCohorte))
}

// Compat: medición de la cohorte más reciente (consumidores de una sola cesta).
export async function medirCarteraPaper(): Promise<MedidaPaper> {
  return medirCohorte(COHORTE_ULTIMA)
}

// Persiste un snapshot de la medición (curva del forward + riesgo + atribución). Idempotente por
// cohorte+fecha. Best-effort: si la tabla aún no existe o la BD falla, NO rompe el digest.
export async function persistirSnapshot(m: MedidaPaper): Promise<boolean> {
  const r = m.resultado
  if (!r) { console.warn(`[paper-tracker] sin precios para cohorte ${m.cohorte} (Stooq+Yahoo no dieron datos) — no se persiste`); return false }
  const alphaMediana = m.medianaCesta == null ? null : m.medianaCesta - r.retornoBench
  const datos = {
    dias: m.diasTranscurridos, n: r.n, retornoCesta: r.retornoCesta, retornoMediana: m.medianaCesta,
    retornoBench: r.retornoBench, alpha: r.alpha, alphaMediana, baten: r.ganadoresVsBench,
    maxDrawdown: m.riesgo?.maxDrawdown ?? null, maxDrawdownBench: m.riesgo?.maxDrawdownBench ?? null,
    volAnual: m.riesgo?.volAnual ?? null, trackingError: m.riesgo?.trackingError ?? null,
    retornoBase: m.resultadoBase?.retornoCesta ?? null, medianaBase: m.medianaBase ?? null,
    nBase: m.resultadoBase?.n ?? null,
  }
  try {
    await prisma.tradingPaperTrack.upsert({
      where: { cohorte_fecha: { cohorte: m.cohorte, fecha: new Date(m.hoy) } },
      create: { cohorte: m.cohorte, fecha: new Date(m.hoy), benchmark: m.benchmark, ...datos },
      update: datos,
    })
    return true
  } catch (e) {
    console.error(`[paper-tracker] persistirSnapshot falló para cohorte ${m.cohorte}:`, e)
    return false
  }
}

// Bloque de digest de UNA cohorte. La MEDIANA es la métrica que decide (un outlier no la mueve).
function bloqueCohorte(m: MedidaPaper, i: number, total: number): string[] {
  const r = m.resultado
  const cab = total > 1 ? `<b>Cohorte ${i + 1}/${total}</b> · ${m.fechaInicio} · ${m.diasTranscurridos} días` : `Desde ${m.fechaInicio} · ${m.diasTranscurridos} días`
  if (!r) return [cab, '<i>sin precios ahora mismo (fuente caída) — reintenta el próximo lunes.</i>']
  const bate = (m.medianaCesta ?? -Infinity) > r.retornoBench
  const lineas = [
    cab,
    `Cesta (media): ${pct(r.retornoCesta)}`,
    `Cesta (MEDIANA): ${pct(m.medianaCesta)}  ${bate ? '✅ &gt; SPY' : '⚠️ ≤ SPY'}`,
    `SPY: ${pct(r.retornoBench)}`,
    `Baten al SPY: ${r.ganadoresVsBench}/${r.n}`,
  ]
  // Riesgo (idea 3): batir con más riesgo no es batir. Drawdown y volatilidad de la cesta vs el índice.
  if (m.riesgo) {
    lineas.push(`Riesgo — caída máx: ${pct(m.riesgo.maxDrawdown)} (SPY ${pct(m.riesgo.maxDrawdownBench)}) · vol ${pct0(m.riesgo.volAnual)} (SPY ${pct0(m.riesgo.volBenchAnual)}) · TE ${pct0(m.riesgo.trackingError)}`)
  }
  // Atribución (idea 4): ¿aporta el filtro de calidad? Combinada vs gurús-solo (ambas por MEDIANA).
  if (m.resultadoBase) {
    const aporta = m.medianaCesta != null && m.medianaBase != null ? m.medianaCesta - m.medianaBase : null
    lineas.push(`Filtro calidad: gurús-solo (MEDIANA) ${pct(m.medianaBase)} → aporta ${pct(aporta)} ${aporta != null && aporta > 0 ? '✅' : '⚠️'}`)
  }
  return lineas
}

// Mide, PERSISTE y avisa por Telegram. Si NINGUNA cohorte tiene precios (fuente caída) no molesta.
export async function enviarPaperTracker(): Promise<{ enviado: boolean; medidas: MedidaPaper[]; persistidos: number }> {
  const medidas = await medirTodasCohortes()
  const persistidos = (await Promise.all(medidas.map(persistirSnapshot))).filter(Boolean).length

  const conDatos = medidas.filter(m => m.resultado)
  if (conDatos.length === 0) return { enviado: false, medidas, persistidos }

  const total = medidas.length
  const lineas: string[] = ['📈 <b>Forward paper — cesta gurús∩calidad</b> (SOLO paper)']
  medidas.forEach((m, i) => { lineas.push('', ...bloqueCohorte(m, i, total)) })

  // 💼 Cartera de estudio (Alberto, 20/07/2026): CADA cohorte en EUROS — 30.000€ simulados por cohorte.
  // Reutiliza las mediciones ya hechas (solo añade el fetch del FX). Best-effort: sin FX/precios, sin línea.
  {
    const { valorarDesdeMedida } = await import('./cartera-estudio-io')
    const { eur } = await import('@/lib/dinero')
    const carteras = (await Promise.all(medidas.map(m => valorarDesdeMedida(m).catch(() => null)))).filter(c => c != null)
    if (carteras.length) {
      lineas.push('', `💼 <b>Cartera de estudio</b> (${eur(carteras[0].capitalEur)} SIMULADOS por cohorte — solo estudio, nada se opera):`)
      for (const c of carteras) {
        lineas.push(`· Cohorte ${c.fechaInicio}: ${eur(c.valorEur)} (${pct(c.plPct)}) · ${c.bench.simbolo}: ${eur(c.bench.valorEur)} ${c.valorEur >= c.bench.valorEur ? '✅' : '⚠️'}`)
      }
    }
  }

  // 🚀 Cartera cohetes (paper): bolsillo APARTE que rota a los cohetes confirmados. Contexto, nunca filtro;
  // el criterio de selección NO se auto-modifica. Best-effort: sin datos, sin bloque.
  {
    const { resumenCohetes, CAPITAL_COHETES_EUR } = await import('./cartera-cohetes-io')
    const { eur } = await import('@/lib/dinero')
    const r = await resumenCohetes().catch(() => null)
    if (r) {
      const semanas = Math.round(dias(r.track.fecha.toISOString().slice(0, 10), hoy()) / 7)
      const bate = (r.track.alphaPct ?? -Infinity) > 0
      const lineas2 = [
        '',
        `🚀 <b>Cartera cohetes</b> (${eur(CAPITAL_COHETES_EUR)} SIMULADOS, bolsillo aparte — lotería, SOLO estudio):`,
        `Valor: ${eur(r.track.valorEur)} (${pct(r.track.plPct)}) · SPY: ${r.track.spyEur != null ? eur(r.track.spyEur) : '—'} ${bate ? '✅' : '⚠️'}`,
        r.track.nIpo ? `De los recién cotizados (IPO): ${eur(r.track.ipoValorEur ?? 0)} (${pct(r.track.ipoPlPct)}) · n=${r.track.nIpo}` : '',
        semanas >= 6
          ? `<i>Veredicto provisional: ${bate ? 'bate' : 'NO bate'} al SPY (${semanas} sem).</i>`
          : '<i>Reloj joven: aún NO es veredicto.</i>',
      ].filter(Boolean)
      const narr = await (await import('./cartera-cohetes-io')).narrarCohetes().catch(() => '')
      if (narr) lineas2.push(`💬 <i>${narr}</i>`)
      lineas.push(...lineas2)
    }
  }

  // 🪜 Escalera de dinero real (firmada en TRADING-HIPOTESIS-PREREGISTRO.md, 05/08/2026): la suben
  // las señales, NO el calendario (Alberto). Cada tramo es una decisión SEPARADA suya; esto solo mide.
  {
    const { evaluarEscalera, emparejarOps } = await import('./puerta-fase2')
    // Dedupe por cesta: dos versiones con los MISMOS valores son UNA prueba (misma regla que /trading).
    const vistas = new Set<string>()
    const cohortesEscalera = medidas.filter(m => {
      const c = COHORTES_PAPER.find(x => x.version === m.cohorte)
      const clave = c ? [...c.simbolos].sort().join(',') : m.cohorte
      if (vistas.has(clave)) return false
      vistas.add(clave)
      return true
    }).map(m => ({
      cohorte: m.cohorte, dias: m.diasTranscurridos,
      alphaMediana: m.medianaCesta != null && m.resultado ? m.medianaCesta - m.resultado.retornoBench : null,
      maxDrawdown: m.riesgo?.maxDrawdown ?? null, maxDrawdownBench: m.riesgo?.maxDrawdownBench ?? null,
    }))
    const escalera = evaluarEscalera(cohortesEscalera)
    lineas.push('', `🪜 <b>Escalera de dinero real — escalón alcanzable: Tramo ${escalera.alcanzable}</b> <i>(la suben las señales, no el calendario)</i>`)
    for (const t of escalera.tramos) lineas.push(`${t.ok ? '✅' : '⬜'} ${t.titulo} — ${t.detalle}`)
    if (escalera.alcanzable >= 2) lineas.push('<b>Un tramo nuevo cumple sus requisitos medibles. La decisión (y la orden) es SIEMPRE de Alberto.</b>')

    // Deslizamiento señal→día siguiente (proxy de ejecución real): media de las BUY con dato. Alimenta
    // el requisito de «fricción sin anomalías» del tramo 2. Walk-forward de señales: ops cerradas.
    const ordenes = await prisma.tradingPaperOrden.findMany().catch(() => [])
    const desliz = ordenes
      .filter(o => o.lado === 'BUY' && o.precioDiaSiguiente != null && o.precio > 0)
      .map(o => (o.precioDiaSiguiente! - o.precio) / o.precio)
    if (desliz.length) {
      const media = desliz.reduce((s, x) => s + x, 0) / desliz.length
      lineas.push(`Deslizamiento señal→día sig.: ${pct(media)} de media (n=${desliz.length})`)
    }
    const ops = emparejarOps(ordenes.map(o => ({ simbolo: o.simbolo, lado: o.lado, precio: o.precio, fecha: o.fecha.toISOString().slice(0, 10) })))
    if (ops.length) {
      const mediaOps = ops.reduce((s, o) => s + o.retorno, 0) / ops.length
      lineas.push(`Ops cerradas del sistema de señales: ${ops.length} · retorno medio ${pct(mediaOps)}`)
    }
  }

  // Nota de madurez: la cohorte más joven manda (aún no hay veredicto hasta acumular semanas).
  const masJoven = Math.min(...medidas.map(m => m.diasTranscurridos))
  lineas.push('', masJoven < 21
    ? '<i>Reloj joven: aún NO es veredicto (necesita meses).</i>'
    : '<i>Mediana &gt; SPY sostenida y repetida entre cohortes (y ajustada a riesgo) = candidato a dinero real (Opción B).</i>')

  // Recordatorio de cadencia: si la última cohorte ya tiene DIAS_ENTRE_COHORTES, toca congelar otra.
  const edadUltima = dias(COHORTE_ULTIMA.fechaInicio, hoy())
  if (edadUltima >= DIAS_ENTRE_COHORTES) {
    lineas.push('', `🧊 <i>Toca congelar una cohorte nueva (la última tiene ${edadUltima} días): corre /api/trading/seleccion y añádela a COHORTES_PAPER (con su simbolosBase para la atribución).</i>`)
  }

  await tgSend(lineas.join('\n')).catch(() => {})
  return { enviado: true, medidas, persistidos }
}

// Lee la CURVA persistida de una cohorte (o de todas), de más antigua a más reciente. Best-effort.
export async function curvaForward(cohorte?: string) {
  try {
    return await prisma.tradingPaperTrack.findMany({
      where: cohorte ? { cohorte } : undefined,
      orderBy: [{ cohorte: 'asc' }, { fecha: 'asc' }],
    })
  } catch {
    return []
  }
}
