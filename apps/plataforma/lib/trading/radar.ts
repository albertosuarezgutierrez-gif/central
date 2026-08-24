import { tgSend, tgSendButtons } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import {
  rankearUniverso, diffRanking, snapshotsParaEvaluar, resumenTrackRecord,
  evaluarCestaVsBench, agregarConviccion, sma, rsi,
  type EmpresaUniverso, type ItemRadar, type EvaluacionSnapshot,
} from '@central/module-trading'
import { cierresDiarios, puntosDiarios, puntosDiariosVol } from './precios-stooq'
import { cierresPeriodicos, sobreSma } from './backtest-puro'
import { movimientosGestorDataroma, GESTORES_DEFECTO } from './dataroma'
import { submissionsCik, extraerEventos8K, extraerFilingsForm4, estimarProximoInforme } from './edgar'
import { transaccionesFiling } from './form4'
import { acumulacionDistribucion, type VeredictoVolumen } from './volumen'
import { anomaliasUniverso, camposEnvenenados, resumenErrores } from './calidad-datos'
import { correlacionMediaCesta, etiquetaConcentracion, parMasCorrelacionado, type ParCorrelacionado } from './concentracion'
import { candidatosCantera, bajasCantera, CANTERA_MAX_PROPUESTAS, type SnapshotTop } from './cantera'
import { proximaFechaEarningsYahoo } from './earnings-yahoo'

// RANKING SEMANAL del radar (Fase 1): lee la caché (cero llamadas a la SEC), rankea, confirma el
// timing del top-20 con técnico ligero (SMA50+RSI sobre cierres), cruza gurús, evalúa el track
// record de snapshots pasados vs SPY y persiste+avisa. La MEDIANA decide, como en el forward paper.

const hoyIso = () => new Date().toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const pct = (x: number | null | undefined) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)
const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const ETIQ = { fuerte: '🟢 fuerte', media: '🟡 media', debil: '⚪ débil' } as const

// `volumen` (📊, opcional — snapshots viejos no lo traen): acumulación/distribución institucional por
// picos de volumen (ver volumen.ts). INFO visual, nunca filtro.
export type EntryRadar = ItemRadar & { tecnico: 'si' | 'esperar' | null; volumen?: VeredictoVolumen | null }

// 🚀 SATÉLITE caza-cohetes (idea de Alberto, medida en el retrovisor): perfil = momentum >30% +
// calidad MALA (ROIC<0 o Piotroski<=4) — 1 de cada 8 acaba en +50%/3m (5× la base), pero es el
// segmento lotería. Confirmación multi-marco: precio > SMA30 SEMANAL y > SMA12 MENSUAL (la media
// "anual"). Lista APARTE con su propio track record; NUNCA entra en cohortes ni en la cesta núcleo.
export type Cohete = {
  simbolo: string; nombre: string | null; momentum: number | null
  piotroski: number | null; roic: number | null
  sobreSmaSem: boolean | null; sobreSmaMes: boolean | null; confirmado: boolean
  // 🆕 Recién cotizada (IPO/spin-off): meses desde su primer cierre SI empezó a cotizar DENTRO de la
  // ventana de 500d que bajamos; null = veterana. El retrovisor midió que las recién cotizadas pequeñas
  // son la peor lotería (mediana +0,8%, batacazo 21%) — este aviso da ese contexto en el digest/UI.
  mesesCotizando: number | null
}
const COHETES_MOMENTUM_MIN = 0.3
const COHETES_TOP = 5

// Cobertura mínima para rankear con la cabeza alta: mitad del universo con datos frescos (<14 días).
const FRESCURA_DIAS = 14
const COBERTURA_MIN = 0.5

export async function generarRadarSemanal(): Promise<{ ok: boolean; motivo?: string; enviado?: boolean; top?: number }> {
  const hoy = hoyIso()

  // 1) Caché + frescura.
  const filas = await prisma.tradingUniverso.findMany()
  const limiteFresco = new Date(Date.now() - FRESCURA_DIAS * 86_400_000)
  const frescas = filas.filter(f => f.piotroski != null && f.roic != null && f.actualizadoEn > limiteFresco)
  if (filas.length === 0 || frescas.length < filas.length * COBERTURA_MIN) {
    await tgSend(`🌎 <b>Radar del mercado</b>: datos insuficientes (${frescas.length}/${filas.length} frescos) — no ranqueo con datos flojos. El refresco sigue su curso; reintento el próximo lunes.`).catch(() => {})
    return { ok: false, motivo: 'cobertura', enviado: true }
  }

  // 1-bis) 🛡️ Guardián de calidad de datos: escanear la caché buscando IMPOSIBLES (lección MCD 20/07)
  // y neutralizar los campos envenenados a null — esa empresa no puntúa ese factor esta semana, en vez
  // de contaminar los z-scores de todo el universo. Los extremos REALES (manía de memoria) no saltan.
  const anomalias = anomaliasUniverso(filas)
  const envenenados = camposEnvenenados(anomalias)

  // 2) Gurús (best-effort) → guruScore por símbolo.
  const porGestor = await Promise.all(GESTORES_DEFECTO.map(c => movimientosGestorDataroma(c).catch(() => [])))
  const guru = new Map(agregarConviccion(porGestor.flat()).map(c => [c.simbolo, c.score]))

  // 3) Rankear (puro).
  const empresas: EmpresaUniverso[] = filas.map(f => {
    const malos = envenenados.get(f.simbolo)
    return {
      simbolo: f.simbolo, nombre: f.nombre ?? undefined,
      piotroski: f.piotroski,
      roic: malos?.has('roic') ? null : f.roic,
      earningsYield: malos?.has('earningsYield') ? null : f.earningsYield,
      fcfYield: malos?.has('fcfYield') ? null : f.fcfYield,
      momentum: malos?.has('momentum') ? null : f.momentum,
      mktCap: malos?.has('mktCap') ? null : f.mktCap,
      guruScore: guru.get(f.simbolo) ?? 0,
      datosFrescos: f.actualizadoEn > limiteFresco,
    }
  })
  const radar = rankearUniverso(empresas, { top: 20 })

  // 4) Técnico ligero del top-20 (precios frescos; SOLO confirma el cuándo) + señal 📊 de volumen
  // (acumulación/distribución institucional — misma serie, sin fetch extra; INFO, no filtra).
  const entries: EntryRadar[] = []
  const cierresTop10: number[][] = []   // series del top-10 para la ⚖️ correlación (sin fetch extra)
  const simbolosTop10: string[] = []    // alineado con cierresTop10, para nombrar el par más correlacionado
  for (const item of radar.items) {
    let tecnico: EntryRadar['tecnico'] = null
    const puntos = await puntosDiariosVol(item.simbolo, haceDias(150), hoy)
    const cierres = puntos.map(p => p.cierre)
    if (cierres.length >= 60) {
      const s50 = sma(cierres, 50); const r14 = rsi(cierres)
      if (s50 != null && r14 != null) {
        tecnico = cierres[cierres.length - 1] > s50 && r14 >= 40 && r14 <= 70 ? 'si' : 'esperar'
      }
    }
    if (entries.length < 10) { cierresTop10.push(cierres); simbolosTop10.push(item.simbolo) }
    entries.push({ ...item, tecnico, volumen: acumulacionDistribucion(puntos)?.veredicto ?? null })
  }

  // 4-bis-pre-pre) ⚖️ Concentración del top-10: correlación media de retornos diarios (60 sesiones)
  // + el PAR más correlacionado — la media de 45 pares esconde un clúster de 4 (24/08/2026: media
  // 0,08 🟢 con SNDK/WDC/STX/MU, el mismo tirón de memoria ×4, dentro del top).
  // Alta = el top es UNA sola apuesta (hoy, la manía de memoria) y la diversificación es ilusoria.
  const correlacionTop = correlacionMediaCesta(cierresTop10)
  const parTop = parMasCorrelacionado(simbolosTop10, cierresTop10)

  // ⚖️ Ídem para la WATCHLIST del análisis nocturno (capas B+C; la A son índices): una watchlist
  // correlacionada es UNA sola apuesta aunque tenga 13 nombres — con paper da igual, pero es lo que
  // la escalera convertirá en dinero real (05/08/2026: STX+SNDK+WDC entraron a la vez — el mismo
  // tirón de almacenamiento por triplicado). Best-effort: sin series suficientes, sin línea.
  const wl = await prisma.tradingWatchlist.findMany({ select: { simbolo: true, capa: true, activo: true } })
  let correlacionWatchlist: number | null = null
  let parWatchlist: ParCorrelacionado | null = null
  try {
    const simbolosBC = wl.filter(w => w.activo && w.capa !== 'A').map(w => w.simbolo)
    const seriesBC = await Promise.all(simbolosBC.map(s => puntosDiarios(s, haceDias(150), hoy).then(p => p.map(x => x.cierre))))
    correlacionWatchlist = correlacionMediaCesta(seriesBC)
    parWatchlist = parMasCorrelacionado(simbolosBC, seriesBC)
  } catch { /* la concentración de la watchlist nunca tumba el radar */ }

  // 4-bis-pre) RÉGIMEN de mercado: SPY vs su media de 10 MESES (la media clásica de índice; distinta
  // del uso por-acción que el retrovisor descartó). Es CONTEXTO en el digest, no filtro — pero si un
  // lunes cruza a bajista, es la señal pre-registrada para re-correr las mediciones del retrovisor
  // (todas las conclusiones de 2024-26 son de régimen alcista; ver docs/TRADING-HIPOTESIS-PREREGISTRO.md).
  const puntosSpy = await puntosDiarios('SPY', haceDias(500), hoy)
  const regimenAlcista = sobreSma(cierresPeriodicos(puntosSpy, hoy, 'mes'), 10)
  const regimen: 'alcista' | 'bajista' | null = regimenAlcista === true ? 'alcista' : regimenAlcista === false ? 'bajista' : null

  // 4-bis) 🚀 Satélite caza-cohetes: perfil lotería + confirmación por medias multi-marco.
  // 🛡️ Con los campos NEUTRALIZADOS (no los crudos): como ordena por momentum DESC, un momentum
  // envenenado que quede bajo el techo del guardián encabezaría la lista — auditoría 11/08/2026.
  const candidatosCohete = filas
    .map(f => {
      const malos = envenenados.get(f.simbolo)
      return malos ? { ...f, momentum: malos.has('momentum') ? null : f.momentum, roic: malos.has('roic') ? null : f.roic } : f
    })
    .filter(f => f.actualizadoEn > limiteFresco && (f.momentum ?? 0) > COHETES_MOMENTUM_MIN
      && ((f.roic != null && f.roic < 0) || (f.piotroski != null && f.piotroski <= 4)))
    .sort((a, b) => (b.momentum ?? 0) - (a.momentum ?? 0))
    .slice(0, COHETES_TOP * 2)   // margen: algunos caerán por serie corta o media rota
  const cohetes: Cohete[] = []
  for (const c of candidatosCohete) {
    if (cohetes.length >= COHETES_TOP) break
    const puntos = await puntosDiarios(c.simbolo, haceDias(500), hoy)
    if (puntos.length < 60) continue
    const sem = sobreSma(cierresPeriodicos(puntos, hoy, 'sem'), 30)
    const mes = sobreSma(cierresPeriodicos(puntos, hoy, 'mes'), 12)
    // Si su primer cierre entra claramente DESPUÉS del inicio de la ventana (500d), es que empezó a
    // cotizar entonces (IPO/spin-off) — se etiqueta con los meses en bolsa. Veterana → null.
    const reciente = puntos[0].fecha > haceDias(460)
    const mesesCotizando = reciente ? Math.max(1, Math.round((Date.parse(hoy) - Date.parse(puntos[0].fecha)) / (30.44 * 86_400_000))) : null
    cohetes.push({
      simbolo: c.simbolo, nombre: c.nombre, momentum: c.momentum,
      piotroski: c.piotroski, roic: c.roic,
      sobreSmaSem: sem, sobreSmaMes: mes, confirmado: sem === true && mes === true,
      mesesCotizando,
    })
  }

  // 4-ter) 📰 Eventos corporativos de los picks del digest: 8-K de la SEC de los últimos 7 días
  // (fuente oficial y determinista — cero titulares/cifras inventadas). Es CONTEXTO para Alberto,
  // NUNCA filtro del ranking (decisión 20/07/2026 tras la oferta Stripe+Advent→PayPal, el tipo de
  // evento que el modelo de factores no puede ver venir). Best-effort: si la SEC falla, sin línea.
  // Un solo submissions JSON por símbolo alimenta las DOS capas: 8-K (eventos) y Form 4 (insiders).
  // 🧑‍💼 Insiders: compras/ventas de mercado abierto (código P/S) de directivos en los últimos 7 días —
  // la señal limpia de "los de dentro ponen su dinero". Cap 3 filings por símbolo (2 hops SEC cada uno).
  const cikPor = new Map(filas.filter(f => f.cik != null).map(f => [f.simbolo, f.cik!]))
  const simbolosDigest = [...new Set([...entries.slice(0, 10).map(e => e.simbolo), ...cohetes.map(c => c.simbolo)])]
  const eventos: Array<{ simbolo: string; fecha: string; etiquetas: string[] }> = []
  const insiders: Array<{ simbolo: string; compras: number; ventas: number; usdCompras: number }> = []
  const resultadosProximos: Array<{ simbolo: string; fecha: string; exacta?: boolean }> = []
  const VENTANA_RESULTADOS = haceDias(-10)   // próximos 10 días (misma ventana que el estimador EDGAR)
  for (const s of simbolosDigest) {
    // 📅 Fecha de resultados: Yahoo primero (exacta/prevista, ver earnings-yahoo.ts); EDGAR de respaldo.
    const earningsYahoo = await proximaFechaEarningsYahoo(s, hoy)
    if (earningsYahoo && earningsYahoo.fecha <= VENTANA_RESULTADOS)
      resultadosProximos.push({ simbolo: s, fecha: earningsYahoo.fecha, exacta: earningsYahoo.confirmada })
    const cik = cikPor.get(s)
    if (!cik) continue
    const subs = await submissionsCik(cik).catch(() => null)
    if (!subs) continue
    for (const ev of extraerEventos8K(subs, haceDias(7)))
      eventos.push({ simbolo: s, fecha: ev.fecha, etiquetas: ev.etiquetas })
    // 📅 Respaldo EDGAR: semana ESTIMADA por el patrón de 10-Q/10-K del año pasado (mismo JSON, sin fetch extra).
    if (!earningsYahoo) {
      const informe = estimarProximoInforme(subs, hoy)
      if (informe) resultadosProximos.push({ simbolo: s, fecha: informe })
    }
    let compras = 0; let ventas = 0; let usdCompras = 0
    const cikCorto = cik.replace(/^0+/, '') || '0'
    for (const f of extraerFilingsForm4(subs, haceDias(7)).slice(0, 3)) {
      for (const tx of await transaccionesFiling(cikCorto, f.accesion).catch(() => [])) {
        if (tx.tipo === 'compra') { compras++; usdCompras += tx.acciones * (tx.precioUsd ?? 0) }
        else ventas++
      }
    }
    if (compras || ventas) insiders.push({ simbolo: s, compras, ventas, usdCompras })
  }

  // 5) Track record de snapshots pasados (mismo motor que el forward paper; MEDIANA decide).
  const previos = await prisma.tradingRanking.findMany({ orderBy: { fecha: 'asc' } })
  const fechas = previos.map(p => p.fecha.toISOString().slice(0, 10))
  const evals: EvaluacionSnapshot[] = []
  const evalsCohetes: EvaluacionSnapshot[] = []
  for (const fecha of snapshotsParaEvaluar(fechas, hoy)) {
    const snap = previos.find(p => p.fecha.toISOString().slice(0, 10) === fecha)!
    const dias = Math.round((Date.parse(hoy) - Date.parse(fecha)) / 86_400_000)
    const bench = await cierresDiarios('SPY', fecha, hoy)
    const evaluar = async (simbolos: string[], destino: EvaluacionSnapshot[]) => {
      if (!simbolos.length) return
      const series = await Promise.all(simbolos.map(s => cierresDiarios(s, fecha, hoy)))
      const r = evaluarCestaVsBench(simbolos.map((simbolo, i) => ({ simbolo, cierres: series[i] })), bench)
      if (!r) return
      destino.push({
        fecha, dias, mediana: mediana(r.porSimbolo.map(x => x.retorno)),
        retornoBench: r.retornoBench, baten: r.ganadoresVsBench, n: r.n,
      })
    }
    await evaluar((snap.entries as unknown as EntryRadar[]).slice(0, 10).map(e => e.simbolo), evals)
    await evaluar(((snap.cohetes as unknown as Cohete[] | null) ?? []).map(c => c.simbolo), evalsCohetes)
  }
  const track = resumenTrackRecord(evals)
  const trackCohetes = resumenTrackRecord(evalsCohetes)

  // 6) Persistir snapshot (idempotente por fecha) + salud.
  const errores = filas.filter(f => f.error != null).length
  const salud = {
    total: filas.length, frescas: frescas.length, errores, regimen, eventos, insiders,
    // Descartadas por no tener NI earningsYield NI fcfYield: no puntúan porque su valor se DESCONOCE
    // (casi todas ADR/extranjeras sin capitalización cruzable), no porque sean caras. Ver la landmine
    // de `rankearUniverso`: antes entraban con zValor = 0, que es la MEDIA del universo, no una
    // abstención. Si este número crece mucho, el problema es la cobertura de datos, no el ranking.
    sinValor: radar.sinValor,
    correlacionTop, correlacionWatchlist, parTop, parWatchlist, resultadosProximos,
    anomalias: anomalias.map(a => ({ simbolo: a.simbolo, campo: a.campo, motivo: a.motivo })),
  }
  const ultimo = previos.at(-1)
  const trackRecordJson = { evals, ...track, cohetes: { evals: evalsCohetes, ...trackCohetes } } as object
  await prisma.tradingRanking.upsert({
    where: { fecha: new Date(hoy) },
    create: { fecha: new Date(hoy), entries: entries as object[], cohetes: cohetes as object[], trackRecord: trackRecordJson, salud, universoTotal: radar.universoTotal, conDatos: radar.conDatos },
    update: { entries: entries as object[], cohetes: cohetes as object[], trackRecord: trackRecordJson, salud, universoTotal: radar.universoTotal, conDatos: radar.conDatos },
  })

  // 7) Digest Telegram.
  const d = diffRanking(ultimo ? (ultimo.entries as unknown as EntryRadar[]).slice(0, 10).map(e => e.simbolo) : [], entries.slice(0, 10).map(e => e.simbolo))
  const nom = (s: string) => { const e = entries.find(x => x.simbolo === s); return e?.nombre ? `${s} — ${e.nombre}` : s }
  const corr = (x: number) => x.toFixed(2).replace('.', ',')
  // Par más correlacionado al lado de la media: la media puede salir 🟢 con un clúster dentro.
  const parTxt = (p: ParCorrelacionado | null) =>
    p ? ` · par más alto: ${p.correlacion >= 0.7 ? '⚠️ ' : ''}<b>${p.a}</b>–<b>${p.b}</b> ${corr(p.correlacion)}` : ''
  // 🚀 en la línea de insiders = símbolo del satélite caza-cohetes, no del top-10 (antes iban mezclados).
  const esCohete = new Set(cohetes.map(c => c.simbolo))
  const desgloseErrores = resumenErrores(filas.map(f => f.error))
  const lineas = [
    '🌎 <b>Radar del mercado — S&P 500</b> (SOLO paper)',
    '',
    ...entries.slice(0, 10).map((e, i) =>
      `${i + 1}. <b>${e.simbolo}</b> — ${e.nombre ?? '¿?'} · ${ETIQ[e.etiqueta]}${e.guru ? ' 🏆' : ''}${e.tecnico === 'si' ? ' 📈' : ''}${e.volumen === 'acumulacion' ? ' 📊↑' : e.volumen === 'distribucion' ? ' 📊↓' : ''}`),
    '',
    ultimo ? `Cambios: ${d.entran.length ? `entra ${d.entran.map(nom).join(', ')}` : 'sin entradas'} · ${d.salen.length ? `sale ${d.salen.join(', ')}` : 'sin salidas'}` : 'Primer snapshot — sin comparativa aún.',
    evals.length
      ? `Track record: ${evals.map(e => `hace ${Math.round(e.dias / 7)}sem → mediana ${pct(e.mediana)} vs SPY ${pct(e.retornoBench)} (baten ${e.baten}/${e.n})`).join(' · ')} — ${track.bateVentanas}/${track.ventanas} ventanas ganadas`
      : 'Track record: acumulando historial (necesita ≥4 semanas de snapshots).',
    `Salud: ${frescas.length}/${filas.length} frescos · ${errores} con error${desgloseErrores ? ` (${desgloseErrores})` : ''}`,
    `Régimen: ${regimen === 'alcista' ? '🟢 alcista' : regimen === 'bajista' ? '🔴 BAJISTA — re-medir el retrovisor (las conclusiones actuales son de régimen alcista)' : '—'} (SPY vs media 10 meses)`,
    ...(correlacionTop != null ? [
      `⚖️ Concentración del top-10: correlación media ${corr(correlacionTop)} (60 sesiones) — ${etiquetaConcentracion(correlacionTop)}${parTxt(parTop)}`,
    ] : []),
    ...(correlacionWatchlist != null ? [
      `⚖️ Concentración de la watchlist (B+C): correlación media ${corr(correlacionWatchlist)} — ${etiquetaConcentracion(correlacionWatchlist)}${parTxt(parWatchlist)}`,
    ] : []),
    ...(anomalias.length ? [
      `🛡️ Datos sospechosos NEUTRALIZADOS (no puntúan ese factor esta semana): ${anomalias.slice(0, 5).map(a => `<b>${a.simbolo}</b> ${a.campo} (${a.motivo})`).join(' · ')}${anomalias.length > 5 ? ` · +${anomalias.length - 5} más` : ''}`,
    ] : []),
    ...(resultadosProximos.length ? [
      `📅 Resultados PRONTO (sin ~ = fecha confirmada; ~ = prevista/estimada): ${resultadosProximos.slice(0, 8).map(r => `<b>${r.simbolo}</b> ${r.exacta ? '' : '~'}${r.fecha.slice(5)}`).join(' · ')}`,
    ] : []),
    ...(eventos.length ? [
      `📰 Eventos 8-K (7 días, SEC — contexto, no filtran): ${eventos.slice(0, 8).map(e => `<b>${e.simbolo}</b> ${e.etiquetas.join(' + ')} (${e.fecha.slice(5)})`).join(' · ')}${eventos.length > 8 ? ` · +${eventos.length - 8} más` : ''}`,
    ] : []),
    ...(insiders.length ? [
      `🧑‍💼 Insiders Form 4 (7 días, SEC — contexto, no filtran${insiders.some(i => esCohete.has(i.simbolo)) ? '; 🚀 = del satélite, no del top-10' : ''}): ${insiders.slice(0, 8).map(i => `${esCohete.has(i.simbolo) ? '🚀' : ''}<b>${i.simbolo}</b>${i.compras ? ` ${i.compras} compra${i.compras > 1 ? 's' : ''}${i.usdCompras > 0 ? ` ~${Math.round(i.usdCompras / 1000)} k$` : ''}` : ''}${i.compras && i.ventas ? ' /' : ''}${i.ventas ? ` ${i.ventas} venta${i.ventas > 1 ? 's' : ''}` : ''}`).join(' · ')}`,
    ] : []),
    ...(cohetes.length ? [
      '',
      '🚀 <b>Caza-cohetes</b> (satélite LOTERÍA — aparte del núcleo, nunca entra en cohortes):',
      ...cohetes.map(c =>
        `· <b>${c.simbolo}</b> — ${c.nombre ?? '¿?'} · mom ${pct(c.momentum)} · medias sem ${c.sobreSmaSem === true ? '✓' : c.sobreSmaSem === false ? '✗' : '?'}/mes ${c.sobreSmaMes === true ? '✓' : c.sobreSmaMes === false ? '✗' : '?'}${c.mesesCotizando != null ? ` · 🆕 ~${c.mesesCotizando} meses en bolsa` : ''}`),
      evalsCohetes.length
        ? `Track 🚀: ${evalsCohetes.map(e => `hace ${Math.round(e.dias / 7)}sem → mediana ${pct(e.mediana)} vs SPY ${pct(e.retornoBench)}`).join(' · ')} — ${trackCohetes.bateVentanas}/${trackCohetes.ventanas} ganadas`
        : 'Track 🚀: acumulando historial.',
    ] : []),
    '',
    '<i>La selección elige el QUÉ (calidad+gurús); 📈 solo confirma el CUÁNDO. 📊↑/↓ = picos de volumen comprando/vendiendo (huella de fondos entrando/saliendo; info, no filtra). SOLO paper.</i>',
  ]
  await tgSend(lineas.join('\n')).catch(() => {})

  // 7-bis) 🌱 Cantera capa C: los valores SOSTENIDOS ≥2 lunes seguidos en el top-10 se proponen por
  // Telegram con botones (el alta la decide Alberto — callback `wlc_` en el webhook). Es descubrimiento,
  // no cambia ranking/pesos/cestas. Best-effort: si algo falla aquí, el digest ya salió y no se rompe.
  try {
    const snaps: SnapshotTop[] = [
      ...previos.map(p => ({
        fecha: p.fecha.toISOString().slice(0, 10),
        top: (p.entries as unknown as EntryRadar[]).slice(0, 10).map(e => e.simbolo),
      })),
      { fecha: hoy, top: entries.slice(0, 10).map(e => e.simbolo) },
    ]
    const propuestas = await prisma.tradingCantera.findMany({ select: { simbolo: true, bajaPropuestaAt: true, bajaDecision: true, bajaDecididaAt: true } })
    const candidatos = candidatosCantera(snaps, new Set(wl.map(w => w.simbolo)), new Set(propuestas.map(p => p.simbolo)))
      .slice(0, CANTERA_MAX_PROPUESTAS)
    for (const c of candidatos) {
      await prisma.tradingCantera.upsert({
        where: { simbolo: c.simbolo },
        create: { simbolo: c.simbolo, semanasSeguidas: c.semanas },
        update: { semanasSeguidas: c.semanas },
      })
      const e = entries.find(x => x.simbolo === c.simbolo)
      await tgSendButtons(
        `🌱 <b>Cantera</b>: <b>${c.simbolo}</b>${e?.nombre ? ` — ${e.nombre}` : ''} lleva <b>${c.semanas} lunes seguidos</b> en el top-10 del radar (${e ? ETIQ[e.etiqueta] : '—'}${e?.tecnico === 'si' ? ' · 📈 técnico ok' : ''}).\n¿Alta en la watchlist (capa C) para el análisis nocturno? SOLO paper.`,
        [[
          { texto: '✅ Alta en capa C', callback: `wlc_alta:${c.simbolo}` },
          { texto: '❌ No', callback: `wlc_no:${c.simbolo}` },
        ]],
      )
    }

    // Espejo de BAJA: capa C que lleva ≥4 lunes fuera del top-20 → proponer quitarla (decide Alberto).
    // Los snapshots de baja miran el top-20 completo (más laxo que el top-10 de las altas a propósito:
    // salir del top-10 es normal; desaparecer del top-20 un mes seguido es haber perdido el sitio).
    const snaps20: SnapshotTop[] = [
      ...previos.map(p => ({
        fecha: p.fecha.toISOString().slice(0, 10),
        top: (p.entries as unknown as EntryRadar[]).map(e => e.simbolo),
      })),
      { fecha: hoy, top: entries.map(e => e.simbolo) },
    ]
    const capaC = new Set(wl.filter(w => w.capa === 'C' && w.activo).map(w => w.simbolo))
    // Un «✋ mantener» caduca a los 30 días (se re-pregunta si sigue fuera del top); una baja
    // pendiente o ejecutada no se re-propone.
    const limiteMantener = Date.now() - 30 * 86_400_000
    const yaPropuestasBaja = new Set(propuestas
      .filter(p => p.bajaPropuestaAt != null
        && !(p.bajaDecision === 'mantener' && p.bajaDecididaAt != null && p.bajaDecididaAt.getTime() < limiteMantener))
      .map(p => p.simbolo))
    const bajas = bajasCantera(snaps20, capaC, yaPropuestasBaja).slice(0, CANTERA_MAX_PROPUESTAS)
    for (const b of bajas) {
      await prisma.tradingCantera.upsert({
        where: { simbolo: b.simbolo },
        create: { simbolo: b.simbolo, bajaPropuestaAt: new Date() },
        update: { bajaPropuestaAt: new Date(), bajaDecision: null, bajaDecididaAt: null },
      })
      await tgSendButtons(
        `🍂 <b>Cantera</b>: <b>${b.simbolo}</b> lleva <b>${b.semanas} lunes seguidos</b> fuera del top-20 del radar.\n¿La quito de la watchlist (capa C)? Dejará de analizarse cada noche.`,
        [[
          { texto: '🗑️ Quitar de capa C', callback: `wlc_baja:${b.simbolo}` },
          { texto: '✋ Mantener', callback: `wlc_mantener:${b.simbolo}` },
        ]],
      )
    }
  } catch { /* la cantera nunca tumba el radar */ }

  return { ok: true, enviado: true, top: entries.length }
}
