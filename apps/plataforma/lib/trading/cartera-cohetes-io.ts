// IO de la CARTERA COHETES (paper, rotatoria). Lee los cohetes confirmados del último trading_ranking,
// rebalancea semanalmente y valora a diario contra el SPY con precios gratis (Stooq→Yahoo). La valoración
// pura vive en @central/module-trading::carteraCohetes. SOLO estudio — cero órdenes reales.
import { prisma } from '@/lib/db'
import { cierresDiarios } from './precios-stooq'
import { rebalancear, valorar, type CohetePick, type Tenencia } from '@central/module-trading'

export const CAPITAL_COHETES_EUR = 30000
const BENCH = 'SPY'
const hoyIso = () => new Date().toISOString().slice(0, 10)

// Último cierre disponible de un símbolo (ventana de ~15 días para cubrir findes/festivos). null si no hay.
async function ultimoCierre(simbolo: string): Promise<number | null> {
  const desde = new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10)
  const serie = await cierresDiarios(simbolo, desde, hoyIso()).catch(() => [] as number[])
  const ult = serie.at(-1)
  return typeof ult === 'number' && ult > 0 ? ult : null
}

// Forma de los cohetes persistidos en trading_ranking.cohetes (ver radar.ts::Cohete).
type CoheteRanking = { simbolo: string; confirmado: boolean; mesesCotizando: number | null }

// REBALANCEO SEMANAL: coge los cohetes confirmados del snapshot más reciente, baja sus precios y arma la
// cesta equiponderada a partir del valor VIVO de la cartera (o 30.000€ en el arranque). Idempotente por día.
export async function rebalancearCartera(): Promise<{ ok: boolean; motivo?: string; fecha?: string; n?: number }> {
  const snap = await prisma.tradingRanking.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null)
  const cohetes = ((snap?.cohetes as unknown as CoheteRanking[] | null) ?? []).filter(c => c.confirmado)
  if (!cohetes.length) return { ok: false, motivo: 'sin cohetes confirmados' }

  const hoy = hoyIso()
  // Precios de los picks (best-effort) + SPY.
  const precios = new Map<string, number>()
  for (const c of cohetes) {
    const p = await ultimoCierre(c.simbolo)
    if (p != null) precios.set(c.simbolo, p)
  }
  const spyPrecio = await ultimoCierre(BENCH)
  const picks: CohetePick[] = cohetes
    .filter(c => precios.has(c.simbolo))
    .map(c => ({ simbolo: c.simbolo, precio: precios.get(c.simbolo)!, esIpo: c.mesesCotizando != null, mesesCotizando: c.mesesCotizando }))
  if (!picks.length) return { ok: false, motivo: 'sin precios' }

  // Valor vivo de arranque: valora la última cesta a precios de HOY; si no hay historia, arranca en 30.000€.
  const inicio = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'asc' } }).catch(() => null)
  const ultima = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null)
  let capital = CAPITAL_COHETES_EUR
  if (ultima) {
    const preciosUlt: Record<string, number> = {}
    for (const t of ultima.cesta as unknown as Tenencia[]) {
      const p = await ultimoCierre(t.simbolo); if (p != null) preciosUlt[t.simbolo] = p
    }
    capital = valorar({ capitalEur: ultima.capitalEur, tenencias: ultima.cesta as unknown as Tenencia[] }, preciosUlt).valorEur
  }

  const reb = rebalancear(capital, picks)
  const spyUnidades = inicio ? null : (spyPrecio ? CAPITAL_COHETES_EUR / spyPrecio : null)
  await prisma.tradingCohetesRebalanceo.upsert({
    where: { fecha: new Date(hoy) },
    create: { fecha: new Date(hoy), capitalEur: reb.capitalEur, cesta: reb.tenencias as object[], spyPrecio, spyUnidades },
    update: { capitalEur: reb.capitalEur, cesta: reb.tenencias as object[], spyPrecio },
  })
  return { ok: true, fecha: hoy, n: reb.tenencias.length }
}

// VALORACIÓN DIARIA: valora la cesta del último rebalanceo a precios de hoy + benchmark SPY buy&hold.
export async function valorarDia(): Promise<{ ok: boolean; motivo?: string; valorEur?: number; plPct?: number }> {
  const ultima = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null)
  const inicio = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'asc' } }).catch(() => null)
  if (!ultima) return { ok: false, motivo: 'sin rebalanceos' }

  const tenencias = ultima.cesta as unknown as Tenencia[]
  const precios: Record<string, number> = {}
  for (const t of tenencias) { const p = await ultimoCierre(t.simbolo); if (p != null) precios[t.simbolo] = p }
  const val = valorar({ capitalEur: ultima.capitalEur, tenencias }, precios)

  // Benchmark: unidades SPY fijadas en el arranque × precio SPY de hoy.
  const spyPrecioHoy = await ultimoCierre(BENCH)
  const spyEur = inicio?.spyUnidades != null && spyPrecioHoy != null ? inicio.spyUnidades * spyPrecioHoy : null
  const spyPlPct = spyEur != null ? spyEur / CAPITAL_COHETES_EUR - 1 : null
  // alpha desde INICIO: (valor/30k − 1) − (spy/30k − 1). Usa valor vivo global, no el plPct del tramo.
  const carteraDesdeInicio = val.valorEur / CAPITAL_COHETES_EUR - 1
  const alphaPct = spyPlPct != null ? carteraDesdeInicio - spyPlPct : null

  const hoy = hoyIso()
  await prisma.tradingCohetesTrack.upsert({
    where: { fecha: new Date(hoy) },
    create: {
      fecha: new Date(hoy), valorEur: val.valorEur, spyEur, plPct: carteraDesdeInicio, alphaPct,
      ipoValorEur: val.ipoValorEur, ipoPlPct: val.ipoPlPct, nIpo: val.nIpo, detalle: val.porNombre as object[],
    },
    update: {
      valorEur: val.valorEur, spyEur, plPct: carteraDesdeInicio, alphaPct,
      ipoValorEur: val.ipoValorEur, ipoPlPct: val.ipoPlPct, nIpo: val.nIpo, detalle: val.porNombre as object[],
    },
  }).catch(() => {})
  return { ok: true, valorEur: val.valorEur, plPct: carteraDesdeInicio }
}

// Resumen para UI/digest: último punto de curva + tenencias vigentes.
export async function resumenCohetes() {
  const [track, reb] = await Promise.all([
    prisma.tradingCohetesTrack.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null),
    prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null),
  ])
  if (!track || !reb) return null
  return { track, tenencias: reb.cesta as unknown as Tenencia[], fechaRebalanceo: reb.fecha.toISOString().slice(0, 10) }
}

// Curva completa (para el gráfico), de más antigua a más reciente.
export async function curvaCohetes() {
  return prisma.tradingCohetesTrack.findMany({ orderBy: { fecha: 'asc' } }).catch(() => [])
}
