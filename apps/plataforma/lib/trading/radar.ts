import { tgSend } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import {
  rankearUniverso, diffRanking, snapshotsParaEvaluar, resumenTrackRecord,
  evaluarCestaVsBench, agregarConviccion, sma, rsi,
  type EmpresaUniverso, type ItemRadar, type EvaluacionSnapshot,
} from '@central/module-trading'
import { cierresDiarios, puntosDiarios } from './precios-stooq'
import { cierresPeriodicos, sobreSma } from './backtest-puro'
import { movimientosGestorDataroma, GESTORES_DEFECTO } from './dataroma'

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

export type EntryRadar = ItemRadar & { tecnico: 'si' | 'esperar' | null }

// 🚀 SATÉLITE caza-cohetes (idea de Alberto, medida en el retrovisor): perfil = momentum >30% +
// calidad MALA (ROIC<0 o Piotroski<=4) — 1 de cada 8 acaba en +50%/3m (5× la base), pero es el
// segmento lotería. Confirmación multi-marco: precio > SMA30 SEMANAL y > SMA12 MENSUAL (la media
// "anual"). Lista APARTE con su propio track record; NUNCA entra en cohortes ni en la cesta núcleo.
export type Cohete = {
  simbolo: string; nombre: string | null; momentum: number | null
  piotroski: number | null; roic: number | null
  sobreSmaSem: boolean | null; sobreSmaMes: boolean | null; confirmado: boolean
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

  // 2) Gurús (best-effort) → guruScore por símbolo.
  const porGestor = await Promise.all(GESTORES_DEFECTO.map(c => movimientosGestorDataroma(c).catch(() => [])))
  const guru = new Map(agregarConviccion(porGestor.flat()).map(c => [c.simbolo, c.score]))

  // 3) Rankear (puro).
  const empresas: EmpresaUniverso[] = filas.map(f => ({
    simbolo: f.simbolo, nombre: f.nombre ?? undefined,
    piotroski: f.piotroski, roic: f.roic, earningsYield: f.earningsYield,
    momentum: f.momentum, mktCap: f.mktCap, guruScore: guru.get(f.simbolo) ?? 0,
    datosFrescos: f.actualizadoEn > limiteFresco,
  }))
  const radar = rankearUniverso(empresas, { top: 20 })

  // 4) Técnico ligero del top-20 (precios frescos; SOLO confirma el cuándo).
  const entries: EntryRadar[] = []
  for (const item of radar.items) {
    let tecnico: EntryRadar['tecnico'] = null
    const cierres = await cierresDiarios(item.simbolo, haceDias(150), hoy)
    if (cierres.length >= 60) {
      const s50 = sma(cierres, 50); const r14 = rsi(cierres)
      if (s50 != null && r14 != null) {
        tecnico = cierres[cierres.length - 1] > s50 && r14 >= 40 && r14 <= 70 ? 'si' : 'esperar'
      }
    }
    entries.push({ ...item, tecnico })
  }

  // 4-bis) 🚀 Satélite caza-cohetes: perfil lotería + confirmación por medias multi-marco.
  const candidatosCohete = filas
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
    cohetes.push({
      simbolo: c.simbolo, nombre: c.nombre, momentum: c.momentum,
      piotroski: c.piotroski, roic: c.roic,
      sobreSmaSem: sem, sobreSmaMes: mes, confirmado: sem === true && mes === true,
    })
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
  const salud = { total: filas.length, frescas: frescas.length, errores }
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
  const lineas = [
    '🌎 <b>Radar del mercado — S&P 500</b> (SOLO paper)',
    '',
    ...entries.slice(0, 10).map((e, i) =>
      `${i + 1}. <b>${e.simbolo}</b> — ${e.nombre ?? '¿?'} · ${ETIQ[e.etiqueta]}${e.guru ? ' 🏆' : ''}${e.tecnico === 'si' ? ' 📈' : ''}`),
    '',
    ultimo ? `Cambios: ${d.entran.length ? `entra ${d.entran.map(nom).join(', ')}` : 'sin entradas'} · ${d.salen.length ? `sale ${d.salen.join(', ')}` : 'sin salidas'}` : 'Primer snapshot — sin comparativa aún.',
    evals.length
      ? `Track record: ${evals.map(e => `hace ${Math.round(e.dias / 7)}sem → mediana ${pct(e.mediana)} vs SPY ${pct(e.retornoBench)} (baten ${e.baten}/${e.n})`).join(' · ')} — ${track.bateVentanas}/${track.ventanas} ventanas ganadas`
      : 'Track record: acumulando historial (necesita ≥4 semanas de snapshots).',
    `Salud: ${frescas.length}/${filas.length} frescos · ${errores} con error`,
    ...(cohetes.length ? [
      '',
      '🚀 <b>Caza-cohetes</b> (satélite LOTERÍA — aparte del núcleo, nunca entra en cohortes):',
      ...cohetes.map(c =>
        `· <b>${c.simbolo}</b> — ${c.nombre ?? '¿?'} · mom ${pct(c.momentum)} · ${c.confirmado ? '✅ sobre SMA30sem+SMA12mes' : `⏳ medias: sem ${c.sobreSmaSem === true ? '✓' : c.sobreSmaSem === false ? '✗' : '?'} / mes ${c.sobreSmaMes === true ? '✓' : c.sobreSmaMes === false ? '✗' : '?'}`}`),
      evalsCohetes.length
        ? `Track 🚀: ${evalsCohetes.map(e => `hace ${Math.round(e.dias / 7)}sem → mediana ${pct(e.mediana)} vs SPY ${pct(e.retornoBench)}`).join(' · ')} — ${trackCohetes.bateVentanas}/${trackCohetes.ventanas} ganadas`
        : 'Track 🚀: acumulando historial.',
    ] : []),
    '',
    '<i>La selección elige el QUÉ (calidad+gurús); 📈 solo confirma el CUÁNDO. SOLO paper.</i>',
  ]
  await tgSend(lineas.join('\n')).catch(() => {})
  return { ok: true, enviado: true, top: entries.length }
}
