import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { eventFactor, seasonalFloorFactor, PRICING_HORIZON_DAYS, EVENTS } from "@/lib/pricing-calendar"
import { combinarEventosDeFecha, normalizarEstado, type EventoBruto } from "@/lib/sivra/eventos-estado"
import { decidirEventoACiegas } from "@/lib/sivra/pricing-centinelas"
import { factorLastMinute } from "@/lib/sivra/pricing-lastminute"
import { factorAntelacion } from "@/lib/sivra/pricing-antelacion"
import { premioMercadoFecha } from "@/lib/sivra/pricing-premio-mercado"
import { anclaMercadoFecha } from "@/lib/sivra/pricing-ancla-fecha"
import { techoMercado, acotarPorTecho } from "@/lib/sivra/pricing-techo-mercado"
import { descongelar, detalleDescongeladas } from "@/lib/sivra/pricing-descongelar"
import { baseSaltoEvento } from "@/lib/sivra/pricing-base-evento"
import { baseDesdeGuestConFijo } from "@/lib/sivra/pricing-canal"
import { factorDemandaFecha, type DemandaFechaResult } from "@/lib/sivra/pricing-demanda"
import { elegirBucket } from "@/lib/sivra/pricing-bucket-fuente"
import { sqlCompPlausible } from "@/lib/sivra/pricing-comps-plausibles"
import { sqlCompDeNuestraLiga, sqlNotaCreible } from "@/lib/sivra/pricing-comps-liga"
import { aplicarTechoAdr } from "@/lib/sivra/pricing-techo-adr"
import { sqlUltimaPasadaUtil, avisoPisosSinTarifar, type PisoSaltado } from "@/lib/sivra/pricing-corpus-utilizable"
import { sqlAnclaGlobalAcumulada, elegirAnclaGlobal, MIN_FECHAS_ANCLA } from "@/lib/sivra/pricing-ancla-global"
import { avisoSmoobuRechaza, type FalloEscritura } from "@/lib/sivra/pricing-latido-apply"
import { aplicarPrior, indicesPrior, type IndicePrior, type MesHistorico } from "@/lib/sivra/prior-estacional"
import { getSmoobuKey } from "@/lib/smoobu"
import { tgAviso } from '@/lib/telegram'
import { eur } from "@/lib/dinero"
import { anclaRail, avisoRailCiego, type LecturaAncla } from "@/lib/sivra/pricing-ancla-rail"
import { resumenLecturasCaidas, avisoLecturasCaidas, type LecturaCaida } from "@/lib/sivra/pricing-lecturas"
import { PASADAS_POR_DIA_APPLY } from "@/lib/sivra/pricing-latido-apply"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/sivra/pricing/apply
//
// APLICA el precio recomendado por el motor (anclado al mercado) escribiéndolo en
// SMOOBU vía su API. Es el paso "recomendar → aplicar".
//
// Protegido por CRON_SECRET (Bearer) O por una sesión de admin logueada.

const BASE = "https://login.smoobu.com/api"

const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const fmt = (d: Date) => d.toISOString().slice(0, 10)

// Si el precio ACTUAL supera en +40% la base "normal" del mes/global, esa noche es especial
// (alguien o el mercado la subió). Lejos de la fecha NO la hundimos a ciegas por debajo del
// actual; cerca (≤N días) dejamos que el last-minute suavice.
const OUTLIER_RATIO = 1.4
const OUTLIER_HORIZON_DAYS = 30
// Idea #3: min-stay en noches de evento fuerte y lejanas para no malvender una única noche
// premium. Conservador: solo eventos ≥1.8×, a >14 días, y nunca en un hueco suelto entre reservas.
const MIN_STAY_EVENTOS = true
// Premio de MERCADO por fecha exacta (22/07/2026): si el mercado del PROPIO día va ≥ este ratio por
// encima de su base normal del mes/global, la fecha es premium AUNQUE el calendario de eventos no la
// conozca (caso Karol G/Feria: el conector tenía 931€/424€ pero sin factor el motor las tarifaba como
// mes normal y las hundió). 1.5 separa el EVENTO real (1,5-5× el mes) del premio de FINDE (~1,1-1,4×,
// porque la mediana del mes mezcla entre semana y findes) → no encarece un sábado corriente.
const PREMIO_MERCADO_RATIO = 1.5

// GET = mismo comportamiento que POST (patrón cron-GET del repo, como /api/rates/snapshot);
// dryRun=true por defecto en ambos, así que un GET sin params nunca escribe.
export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  // Autorización: vale el CRON_SECRET (crons) O una sesión de admin (panel del propietario).
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const qs = req.nextUrl.searchParams.get("secret")
  const secretOk = !!secret && (bearer === secret || qs === secret)
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const onlyProp = sp.get("property")
  const days = Math.min(Math.max(Number(sp.get("days") ?? 14), 1), PRICING_HORIZON_DAYS)
  let dryRun = sp.get("dryRun") !== "false"

  // Botón de pánico / pausa global: si está pausado, NUNCA escribe (degrada a dry-run).
  let paused = false
  try {
    const cfg = await prisma.$queryRaw<{ paused: boolean }[]>(Prisma.sql`
      SELECT paused FROM pricing_config WHERE id = 1 LIMIT 1`)
    paused = cfg[0]?.paused === true
  } catch { /* sin tabla aún: no pausado */ }
  if (paused && !dryRun) dryRun = true

  const SMOOBU_KEY = await getSmoobuKey()

  const MIN_SAMPLE = 5
  const MAX_MARKET_AGE_DAYS = 7

  const recs = await prisma.$queryRaw<{
    property_id: string
    // Ancla del BARRIDO de la última pasada útil (respaldo) y ancla ACUMULADA de 30 días
    // (la buena, ver pricing-ancla-global.ts). Elige `elegirAnclaGlobal`, no el SQL.
    med_pasada: number; flo_pasada: number; cei_pasada: number
    med_anc: number | null; flo_anc: number | null; cei_anc: number | null
    fechas_anc: number; corpus_fiable: boolean | null
    demand_factor: number; quality_factor: number
    occupancy_global: number; demand_baseline: number; demand_k: number
    channel_markup: number; cuota_fija: number; noches_ref: number
    max_change_pct: number; min_price: number | null; max_price: number | null
    sample_n: number; market_age_days: number; events_enabled: boolean; gap_discount_pct: number
    flight_demand_k: number; seasonal_floor_k: number; lastminute_k: number; antelacion_k: number
  }[]>(Prisma.sql`
    WITH latest AS (${Prisma.raw(sqlUltimaPasadaUtil())}),
    -- Ancla GLOBAL sobre el corpus ACUMULADO (una lectura por comparable x fecha en 30 dias).
    -- El percentil del barrido de la manana muestreaba 6-7 fechas de las ~110 del horizonte y
    -- cada dia otras: eso era el serrucho. Ver pricing-ancla-global.ts.
    anc AS (${Prisma.raw(sqlAnclaGlobalAcumulada())}),
    -- Cada comparable se NORMALIZA al aforo del piso (pricing_factor_aforo) antes de entrar en el
    -- percentil. Sin esto, una casa de 12 plazas se tarificaba contra apartamentos de 4-8 y salia
    -- a mitad de precio (hallazgo 31/07/2026). Con comps del mismo aforo el factor es 1: no cambia nada.
    -- OJO: esta consulta va en un template literal de TS, aqui NO se pueden usar backticks ni $ { }.
    mkt AS (
      SELECT m.scenario,
        percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests))::numeric med,
        percentile_cont(s.floor_pctl)  WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests))::numeric flo,
        percentile_cont(s.ceil_pctl)   WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests))::numeric cei,
        -- Solo notas CREIBLES: un 10,0 con 6 resenas no mide nada y movia esta mediana (el caso
        -- real, 68 apariciones en el corpus de Busto). Ver sqlNotaCreible.
        percentile_cont(0.5) WITHIN GROUP (ORDER BY m.score)
          FILTER (WHERE ${Prisma.raw(sqlNotaCreible("m."))})::numeric mkt_score,
        COUNT(*)::int AS sample_n,
        (CURRENT_DATE - MAX(l.sd))::int AS market_age_days
      FROM market_rates m JOIN latest l ON l.scenario = m.scenario AND l.sd = m.search_date
      JOIN pricing_settings s ON s.property_id = m.scenario
      LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
      WHERE m.price_night > 0
        -- Plausibilidad €/plaza (17/08/2026): un comp muy por debajo del minimo por plaza es una
        -- HABITACION vestida de piso entero (ver pricing-comps-plausibles.ts) y no entra al percentil.
        AND ${Prisma.raw(sqlCompPlausible("m."))}
        -- Liga (03/09/2026): un comp con nota CREIBLE muy por encima de la nuestra no es competencia
        -- nuestra. Sin esto, el corpus de Busto (6,9) tenia una mediana de 8,8 y el 100% de sus comps
        -- puntuaba mejor. Ver pricing-comps-liga.ts.
        AND ${Prisma.raw(sqlCompDeNuestraLiga("m.", "s.own_score"))}
      GROUP BY m.scenario, s.target_pctl, s.floor_pctl, s.ceil_pctl
    ),
    occ AS (
      SELECT property_id scenario, (1 - AVG(available))::numeric occupancy
      FROM rate_snapshots WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND rate_date >= CURRENT_DATE AND available IS NOT NULL GROUP BY property_id
    )
    SELECT
      mkt.scenario AS property_id,
      -- 🚨 El ancla NO se elige aqui: el SQL devuelve las DOS (barrido y acumulada) y decide
      -- elegirAnclaGlobal en TS, que es donde hay tests. El recomendado se compone alli con los
      -- mismos dos factores que viajan abajo, para que no pueda divergir del precio real.
      -- OJO: sin backticks ni $ { }, esto va dentro de un template literal de TS.
      ROUND(mkt.med)::int AS med_pasada,
      -- Los dos factores del ajuste, POR SEPARADO: el de demanda se gatea por fecha segun la
      -- antelacion real del piso (ver pricing-demanda.ts) y el de calidad aplica siempre.
      GREATEST(LEAST(1 + (COALESCE(occ.occupancy,0.5) - s.demand_baseline) * s.demand_k, 1.10), 0.92)::float8 AS demand_factor,
      GREATEST(LEAST(1 + (s.own_score - mkt.mkt_score) * s.quality_k, 1.10), 0.75)::float8 AS quality_factor,
      -- Los ingredientes del factor de demanda, en crudo: hacen falta para RECALCULARLO con la
      -- ocupacion del MES de cada fecha (ver pricing-demanda.ts). El de arriba, con la
      -- ocupacion anual, queda de fallback para los meses sin snapshot.
      COALESCE(occ.occupancy, 0.5)::float8 AS occupancy_global,
      s.demand_baseline::float8 AS demand_baseline,
      s.demand_k::float8 AS demand_k,
      ROUND(mkt.flo)::int AS flo_pasada, ROUND(mkt.cei)::int AS cei_pasada,
      ROUND(anc.med)::int AS med_anc, ROUND(anc.flo)::int AS flo_anc, ROUND(anc.cei)::int AS cei_anc,
      COALESCE(anc.fechas, 0) AS fechas_anc,
      anc.corpus_fiable,
      COALESCE(s.channel_markup, 1.20)::float8 AS channel_markup,
      COALESCE(s.cuota_fija, 0)::float8 AS cuota_fija,
      GREATEST(COALESCE(s.noches_ref, 2), 1)::int AS noches_ref,
      s.max_change_pct::float8 AS max_change_pct,
      s.min_price, s.max_price,
      mkt.sample_n, mkt.market_age_days,
      COALESCE(s.events_enabled, true) AS events_enabled,
      COALESCE(s.gap_discount_pct, 0)::float8 AS gap_discount_pct,
      COALESCE(s.flight_demand_k, 0)::float8 AS flight_demand_k,
      COALESCE(s.seasonal_floor_k, 0)::float8 AS seasonal_floor_k,
      COALESCE(s.lastminute_k, 0)::float8 AS lastminute_k,
      COALESCE(s.antelacion_k, 0)::float8 AS antelacion_k
    FROM mkt
    JOIN pricing_settings s ON s.property_id = mkt.scenario
    LEFT JOIN occ ON occ.scenario = mkt.scenario
    LEFT JOIN anc ON anc.scenario = mkt.scenario
    WHERE s.apply_enabled = true
      AND (${onlyProp}::text IS NULL OR mkt.scenario = ${onlyProp})
  `)

  if (recs.length === 0) {
    // `paused` viaja también por esta puerta corta: sin él, `apply-auto` no puede distinguir en su
    // latido una pausa global (motor apagado a propósito, o por olvido) de un simulacro cualquiera.
    return NextResponse.json({ ok: true, dryRun, paused, applied: 0, fechas_escritas: 0, properties: 0, message: "Ningún piso con apply_enabled=true (o filtro sin match)" })
  }

  const today = new Date()
  const end = new Date(today); end.setDate(end.getDate() + days)
  const startDate = fmt(today), endDate = fmt(end)

  // Eventos descubiertos (Ticketmaster / búsqueda web / prensa / mano de Alberto). Se traen SIN
  // agregar por fecha porque el efecto depende del `estado` de cada fila: un 'previsto' —una noticia
  // de prensa sobre algo que aún no tiene entradas— protege el suelo pero NO mueve el precio. Un
  // MAX(factor) plano mezclaría las dos cosas y una previsión inflaría el precio objetivo. Toda esa
  // lógica vive en el helper puro `lib/sivra/eventos-estado.ts`.
  //
  // 🚨 El `.catch()` NO devuelve un mapa vacío y ya está. Un fallo de esta consulta significaría
  // tarificar la Feria como un martes de febrero, y hasta el 01/08/2026 eso pasaba respondiendo
  // `ok:true` sin una palabra. Ahora se marca y sale en la respuesta y en el aviso.
  let eventosIlegibles = false
  const autoEvRows = await prisma.$queryRaw<{
    rate_date: string; factor: number; estado: string | null; confianza: number | null
  }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, factor::float8 AS factor, estado, confianza::float8 AS confianza
    FROM pricing_eventos_auto WHERE rate_date >= CURRENT_DATE
  `).catch(() => { eventosIlegibles = true; return [] })

  const porFecha = new Map<string, EventoBruto[]>()
  for (const r of autoEvRows) {
    const lista = porFecha.get(r.rate_date) ?? []
    lista.push({ estado: r.estado, factor: Number(r.factor), confianza: r.confianza })
    porFecha.set(r.rate_date, lista)
  }
  /** factor que puede mover el PRECIO: confirmados + previstos LEJANOS ponderados (v2) */
  const autoEv = new Map<string, number>()
  /** factor que protege el SUELO: confirmados + la parte prudente de los previstos */
  const autoEvSuelo = new Map<string, number>()
  /**
   * factor SOLO de eventos CONFIRMADOS de la tabla. `autoEv` no sirve para la guarda de
   * congelación: mezcla confirmados con previstos lejanos ponderados, y un previsto es una
   * apuesta — congelarle la bajada sería tratar un rumor como un hecho (decisión Fable 13/08/2026).
   */
  const autoEvConfirmado = new Map<string, number>()
  /**
   * Fechas cuyo precio lo subió un evento que DESPUÉS se descartó y que hoy no tienen ningún evento
   * vivo. Es la mitad que faltaba del ciclo del rumor (decisión de Alberto, 27/08/2026): sin esto la
   * apuesta se deshace en `pricing_eventos_auto` pero NO en el precio, que se queda arriba y cae en
   * la guarda de outlier. Ver `lib/sivra/pricing-descongelar.ts`.
   */
  const rumorCaido = new Set<string>()
  for (const [fecha, lista] of porFecha) {
    // Los previstos LEJANOS suben el precio ponderado por confianza (v2, decisión de Alberto
    // 09/08/2026); cerca de la fecha vuelven a solo-suelo. El contexto de distancia va aquí.
    const diasVista = Math.round((new Date(fecha).getTime() - today.getTime()) / 86400000)
    const ef = combinarEventosDeFecha(lista, { diasVista })
    if (ef.factorPrecio > 1) autoEv.set(fecha, ef.factorPrecio)
    if (ef.factorSuelo > 1) autoEvSuelo.set(fecha, ef.factorSuelo)
    const confirmado = Math.max(1, ...lista
      .filter(e => normalizarEstado(e.estado) === 'confirmado')
      .map(e => Number(e.factor) || 1))
    if (confirmado > 1) autoEvConfirmado.set(fecha, confirmado)
    // Hubo un descartado Y no queda premio vivo de ninguna otra fila de la misma fecha: la razón
    // que justificaba el precio alto ya no existe. Si SIGUE habiendo evento vivo no se marca — ahí
    // el objetivo sube por su cuenta y las guardas ni llegan a plantearse retener nada.
    const hayDescartado = lista.some(e => normalizarEstado(e.estado) === 'descartado')
    if (hayDescartado && ef.factorPrecio <= 1 && confirmado <= 1) rumorCaido.add(fecha)
  }

  // 🟠 Lecturas auxiliares que pueden caerse sin invalidar la pasada — pero que se DECLARAN
  // (hallazgo 4 de la auditoría 23/08/2026): cada una empuja aquí en su .catch, y al final la
  // pasada sale ok:false + Telegram + latido rojo con el nombre de lo que se perdió.
  const lecturasCaidas: LecturaCaida[] = []

  // Señal de demanda por vuelos a SVQ (Fase 3). Solo influye si flight_demand_k>0 por piso.
  const flightRows = await prisma.$queryRaw<{ rate_date: string; demand_index: number }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, demand_index::float8 AS demand_index
    FROM pricing_flight_demand WHERE rate_date >= CURRENT_DATE
  `).catch((e) => { lecturasCaidas.push({ nombre: 'vuelos', error: String(e).slice(0, 120) }); return [] })
  const flightIdx = new Map(flightRows.map(r => [r.rate_date, Number(r.demand_index)]))

  // ─── Bucket por MES = precio de una noche NORMAL de ese mes ──────────────────────────────
  // 🚨 El bucket del mes NO puede incluir las noches de evento (31/07/2026). Luxury acabó a 841€ las 28
  // noches de junio de 2027 —168€ por plaza en un piso de 5— porque su ÚNICA muestra de mercado de ese
  // mes eran 10 comps del día 11, la noche de Karol G (p50 931€). El motor tomaba ese p50 como "junio
  // normal" y se lo aplicaba a todo el mes; para contrastar, el 18 de junio el mercado va a 109€. El
  // premio del evento NO se pierde: lo aplican el bucket por FECHA EXACTA y el factor de evento, que
  // corren aparte. Aquí solo queremos el suelo de referencia del mes.
  //
  // Dos guardas, porque cada una tapa un agujero distinto:
  //   · Se EXCLUYEN las fechas con evento conocido (calendario del repo + `pricing_eventos_auto`).
  //   · Se exige muestra de varias FECHAS distintas (MIN_FECHAS_MES), no solo muchos comps: 10 anuncios
  //     de un mismo día son un día, no un mes. Sin esto, un barrido que solo cubra un evento sin
  //     catalogar volvería a contaminar el bucket por la puerta de atrás.
  // OJO: SQL dentro de un template literal de TS — aqui NO se pueden usar backticks ni $ { }.
  // ─── Antelación REAL de venta de cada piso (01/08/2026) ──────────────────────────────────
  // Es la referencia de la palanca de urgencia: cuándo se vende de verdad cada piso. NO se
  // configura a ojo, se MIDE — y se mide POR PISO Y POR MES DE ENTRADA, no en global.
  //
  // 🚨 Corregido el 01/08/2026, el mismo día que se estrenó. La primera versión sacaba una mediana
  // GLOBAL por piso de `rate_snapshots` (transiciones de libre a ocupado). El problema es que esa
  // mediana mezcla todo el calendario, y Semana Santa y Feria —que se reservan con medio año de
  // antelación— la disparan. Contra el histórico REAL de Smoobu (`incomes.reserved_at`, el campo
  // created-at de su API) la diferencia resultó ser de un orden de magnitud en el mes que importaba:
  //
  //     piso              global (snapshots)   octubre 2024   octubre 2025
  //     Busto Reform            108 días            13              3
  //     Luxury Busto             57                 17             11
  //     House Sevillana          32                 24             39
  //     Duplex Center             7                 11             11
  //
  // Con la global, Busto habría empezado a descontar el precio de octubre tres meses antes de que
  // octubre se venda — regalando margen en el mejor mes del año por una urgencia inventada.
  //
  // Fuente: `incomes.reserved_at`, que es la fecha REAL de la reserva. `createdAt` NO sirve (en el
  // histórico es la fecha de la importación masiva) y `rate_snapshots` solo cubre desde mayo-2026,
  // así que no tiene un octubre entero que enseñar. Se agrupa por MES DEL AÑO (no por año concreto)
  // para juntar octubres de varios años y llegar a muestra.
  //
  // 🚨 Y se respeta `pricing_settings.historico_desde`: un piso puede haber cambiado de PRODUCTO, y
  // entonces su histórico anterior no lo describe. House Sevillana estuvo alquilada como dos pisos
  // independientes hasta 2024, cuando pasó a casa entera de 12 plazas — el ADR salta de 166€ a 473€.
  // Sin este filtro, la mediana de octubre de House salía de 51 reservas de las que 30 eran de
  // cuando era otro negocio. Es el mismo veneno que ya hizo proponer bajarle el precio a 285€.
  // OJO: SQL dentro de un template literal de TS — aqui NO se pueden usar backticks ni $ { }.
  const antelacionRows = await prisma.$queryRaw<{
    property_id: string; mes: number; mediana: number; muestra: number
  }[]>(Prisma.sql`
    SELECT i."propertyId" AS property_id,
           EXTRACT(MONTH FROM i."checkIn")::int AS mes,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY (i."checkIn"::date - i.reserved_at::date)
           )::int AS mediana,
           COUNT(*)::int AS muestra
    FROM incomes i
    LEFT JOIN pricing_settings ps ON ps.property_id = i."propertyId"
    WHERE i.reserved_at IS NOT NULL
      AND i."checkIn" IS NOT NULL
      AND i."checkIn"::date >= i.reserved_at::date
      AND (ps.historico_desde IS NULL OR i."checkIn"::date >= ps.historico_desde)
    GROUP BY 1, 2
  `).catch((e) => { lecturasCaidas.push({ nombre: 'antelacion', error: String(e).slice(0, 120) }); return [] })
  const antelacion = new Map(
    antelacionRows.map(a => [
      `${a.property_id}|${a.mes}`,
      { mediana: Number(a.mediana), muestra: Number(a.muestra) },
    ]),
  )
  /** Antelación del piso para el MES de esa fecha. Sin datos de ese mes devuelve null: la palanca
   *  se queda quieta, que es lo correcto — una urgencia inventada cuesta margen real. */
  const antelacionDe = (propertyId: string, fechaIso: string) =>
    antelacion.get(`${propertyId}|${Number(fechaIso.slice(5, 7))}`) ?? null

  // Ocupación por piso y MES (año-mes real, no mes del año): el mismo cálculo que la subconsulta
  // `occ` de arriba con un GROUP BY más. Es lo único que le faltaba al motor para poder distinguir
  // «septiembre va lleno» de «el año está vacío» — ver pricing-demanda.ts.
  // OJO: SQL dentro de un template literal de TS — aqui NO se pueden usar backticks ni $ { }.
  //
  // 🚨 El fallo de esta consulta NO puede ser mudo. Si revienta, TODAS las fechas caen al factor
  // global y la pasada aplica precios más bajos sin un solo error en el log — indistinguible de una
  // pasada correcta. Es el mismo agujero que tenía la lectura de eventos hasta el 01/08/2026 (ver el
  // bloque de `eventosIlegibles` al final), así que se trata igual: se marca, se declara `degradado`
  // en la respuesta y se avisa por Telegram. Descubierto el 09/08/2026 al intentar verificar el
  // PR #1323 en producción: la señal que se había diseñado para cazarlo no era observable.
  let ocupacionMesIlegible = false
  const ocupacionMesRows = await prisma.$queryRaw<{
    property_id: string; ym: string; occ: number
  }[]>(Prisma.sql`
    SELECT property_id,
           to_char(rate_date, 'YYYY-MM') AS ym,
           (1 - AVG(available))::float8 AS occ
    FROM rate_snapshots
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
      AND rate_date >= CURRENT_DATE
      AND available IS NOT NULL
    GROUP BY property_id, to_char(rate_date, 'YYYY-MM')
  `).catch((e) => { ocupacionMesIlegible = true; console.error("[pricing] ocupación por mes ilegible:", e); return [] })
  const ocupacionMes = new Map(
    ocupacionMesRows.map(o => [`${o.property_id}|${o.ym}`, Number(o.occ)]),
  )

  const MIN_BUCKET = 3
  const MIN_FECHAS_MES = 3
  const FACTOR_EVENTO_EXCLUIR = 1.15
  // Las fechas del calendario del repo van como params ESCALARES en un VALUES, no como array: los
  // arrays de Prisma ya fallaron una vez contra el pooler de Supabase (landmine del acotado de código).
  const fechasEventoCalendario = Object.entries(EVENTS)
    .filter(([, f]) => Number(f) >= FACTOR_EVENTO_EXCLUIR)
    .map(([d]) => d)
  const eventosCalendarioSql = fechasEventoCalendario.length
    ? Prisma.sql`UNION SELECT d::date FROM (VALUES ${Prisma.join(fechasEventoCalendario.map(d => Prisma.sql`(${d})`))}) AS t(d)`
    : Prisma.empty
  // 🚨 PREFERENCIA DE FUENTE (09/08/2026, auditoría `docs/AUDITORIA-2026-08-precios-dinamicos.md`).
  // El bucket excluía `corpus_clonado` pero NO miraba `fuente`, así que mezclaba los precios de
  // ANUNCIO de Serper (que no distinguen la fecha) con las mediciones reales del conector. Medido
  // ese día, el objetivo se movía **+24% en septiembre** y **−13% en octubre** contra el corpus
  // fiable — y la dirección mala es la segunda: Serper hunde el bucket justo en el mejor mes.
  //
  // NO se puede filtrar a secas: hoy el corpus fiable solo alcanza las 3 fechas que exige
  // `MIN_FECHAS_MES` en sep/oct/nov; de diciembre en adelante tiene 1-2 y esos meses se quedarían
  // sin bucket (caerían al ancla global, que es PEOR). Así que el percentil se calcula DOS veces y
  // se usa el fiable **solo cuando por sí mismo cumple el umbral**; si no, la mezcla, como antes.
  // Nunca se degrada respecto al estado anterior: el peor caso es exactamente lo de ayer.
  const mesRows = await prisma.$queryRaw<{
    property_id: string; ym: string; med_guest: number; flo_guest: number; cei_guest: number
    n: number; fechas: number
    med_fiable: number | null; flo_fiable: number | null; cei_fiable: number | null
    n_fiable: number; fechas_fiable: number
  }[]>(Prisma.sql`
    WITH eventos AS (
      SELECT DISTINCT rate_date FROM pricing_eventos_auto WHERE factor >= ${FACTOR_EVENTO_EXCLUIR}
      ${eventosCalendarioSql}
    ),
    recent AS (
      -- price_night NORMALIZADO al aforo del piso (ver pricing_factor_aforo); con comps del mismo
      -- aforo el factor es 1. Sin esto los buckets de un piso grande salian a precio de apartamento.
      -- La columna fuente viaja con la fila GANADORA del dedupe (una por comp, la más reciente).
      -- OJO: NO entra en el DISTINCT ON a propósito — si entrara, un mismo comparable medido por
      -- las dos vías contaría DOS veces en el percentil.
      SELECT DISTINCT ON (m.scenario, m.checkin_date, m.comp_name)
        m.scenario, m.checkin_date, m.fuente,
        m.price_night * pricing_factor_aforo(z.max_guests, m.guests) AS price_night
      FROM market_rates m
      LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
      -- LEFT y no JOIN: sin fila de ajustes no sabemos en que liga jugamos, y eso DEJA PASAR al
      -- comparable (ver pricing-comps-liga.ts), nunca lo descarta en silencio.
      LEFT JOIN pricing_settings sl ON sl.property_id = m.scenario
      WHERE m.price_night > 0 AND m.scenario LIKE 'prop_%'
        AND m.checkin_date >= CURRENT_DATE
        AND m.search_date >= CURRENT_DATE - 120
        -- 🚨 Fuera las pasadas cuyo corpus NO distingue la fecha (06/08/2026): el barrido llegó a
        -- cubrir el calendario entero pero devolvía los MISMOS precios para fechas distintas (117
        -- ventanas, 22 medianas, 93% repetidas). Meterlas aquí es fabricar estacionalidad: el
        -- bucket de noviembre saldría igual que el de abril y el motor lo aplicaría como si fuera
        -- mercado medido. Sin ellas se cae al ancla global, que es peor pero honesto.
        AND NOT m.corpus_clonado
        AND m.checkin_date NOT IN (SELECT rate_date FROM eventos)
        -- Plausibilidad €/plaza (17/08/2026): fuera las habitaciones vestidas de piso entero.
        AND ${Prisma.raw(sqlCompPlausible("m."))}
        -- Liga (03/09/2026): fuera los comps con nota creible MUY por encima de la nuestra. El
        -- corpus de un piso puntuado 6,9 traia Mercer Residences (9,1) y Palacio Bucarelli (9,1),
        -- y el motor tomaba su percentil 55. Ver pricing-comps-liga.ts.
        AND ${Prisma.raw(sqlCompDeNuestraLiga("m.", "sl.own_score"))}
      ORDER BY m.scenario, m.checkin_date, m.comp_name, m.search_date DESC
    )
    SELECT r.scenario AS property_id, to_char(r.checkin_date, 'YYYY-MM') AS ym,
      ROUND(percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY r.price_night))::int AS med_guest,
      ROUND(percentile_cont(s.floor_pctl)  WITHIN GROUP (ORDER BY r.price_night))::int AS flo_guest,
      ROUND(percentile_cont(s.ceil_pctl)   WITHIN GROUP (ORDER BY r.price_night))::int AS cei_guest,
      COUNT(*)::int AS n,
      COUNT(DISTINCT r.checkin_date)::int AS fechas,
      -- Mismo percentil sobre SOLO el corpus fiable (medido por fecha, no de anuncio).
      ROUND(percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY r.price_night)
            FILTER (WHERE r.fuente IN ('booking_mcp','manual')))::int AS med_fiable,
      ROUND(percentile_cont(s.floor_pctl)  WITHIN GROUP (ORDER BY r.price_night)
            FILTER (WHERE r.fuente IN ('booking_mcp','manual')))::int AS flo_fiable,
      ROUND(percentile_cont(s.ceil_pctl)   WITHIN GROUP (ORDER BY r.price_night)
            FILTER (WHERE r.fuente IN ('booking_mcp','manual')))::int AS cei_fiable,
      COUNT(*) FILTER (WHERE r.fuente IN ('booking_mcp','manual'))::int AS n_fiable,
      COUNT(DISTINCT r.checkin_date) FILTER (WHERE r.fuente IN ('booking_mcp','manual'))::int AS fechas_fiable
    FROM recent r JOIN pricing_settings s ON s.property_id = r.scenario
    GROUP BY r.scenario, to_char(r.checkin_date, 'YYYY-MM'), s.target_pctl, s.floor_pctl, s.ceil_pctl
  `).catch((e) => { lecturasCaidas.push({ nombre: 'bucket_mes', error: String(e).slice(0, 120) }); return [] })
  const mes = new Map<string, Map<string, {
    med: number; flo: number; cei: number; n: number; fechas: number; fuente: 'fiable' | 'mixto'
  }>>()
  for (const m of mesRows) {
    if (!mes.has(m.property_id)) mes.set(m.property_id, new Map())
    const el = elegirBucket(
      { valores: m.med_fiable == null ? null : { med: m.med_fiable, flo: m.flo_fiable!, cei: m.cei_fiable! },
        n: m.n_fiable, fechas: m.fechas_fiable },
      { valores: { med: m.med_guest, flo: m.flo_guest, cei: m.cei_guest }, n: m.n, fechas: m.fechas },
      MIN_BUCKET, MIN_FECHAS_MES,
    )
    if (!el) continue
    mes.get(m.property_id)!.set(m.ym, { ...el.valores, n: el.n, fechas: el.fechas, fuente: el.fuente })
  }

  // ─── Idea #4: mercado por FECHA EXACTA (resolución por día en noches de evento) ─────────
  // El bucket por MES promedia la noche especial (un puente dentro de un octubre "normal" se
  // diluye en la mediana del mes → el motor no la ve). Cuando hay comps suficientes del PROPIO
  // día, el premio de evento se ancla a la mediana de ESA fecha en vez de la del mes/global. Solo
  // influye en fechas con evento (acota el radio de cambio a lo que el fallo destapó).
  const MIN_FECHA_BUCKET = 3
  const fechaRows = await prisma.$queryRaw<{
    property_id: string; rate_date: string; med_guest: number; n: number
    med_fiable: number | null; n_fiable: number
  }[]>(Prisma.sql`
    WITH recent AS (
      -- price_night NORMALIZADO al aforo del piso (ver pricing_factor_aforo); con comps del mismo
      -- aforo el factor es 1. Sin esto los buckets de un piso grande salian a precio de apartamento.
      -- La columna fuente viaja con la fila GANADORA del dedupe (una por comp, la más reciente).
      -- OJO: NO entra en el DISTINCT ON a propósito — si entrara, un mismo comparable medido por
      -- las dos vías contaría DOS veces en el percentil.
      SELECT DISTINCT ON (m.scenario, m.checkin_date, m.comp_name)
        m.scenario, m.checkin_date, m.fuente,
        m.price_night * pricing_factor_aforo(z.max_guests, m.guests) AS price_night
      FROM market_rates m
      LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
      -- LEFT y no JOIN: sin fila de ajustes no sabemos en que liga jugamos, y eso DEJA PASAR al
      -- comparable (ver pricing-comps-liga.ts), nunca lo descarta en silencio.
      LEFT JOIN pricing_settings sl ON sl.property_id = m.scenario
      WHERE m.price_night > 0 AND m.scenario LIKE 'prop_%'
        AND m.checkin_date >= CURRENT_DATE
        AND m.search_date >= CURRENT_DATE - 120
        AND NOT m.corpus_clonado   -- mismo motivo que en el bucket del mes
        -- Plausibilidad €/plaza (17/08/2026): fuera las habitaciones vestidas de piso entero.
        AND ${Prisma.raw(sqlCompPlausible("m."))}
        -- Liga (03/09/2026): fuera los comps con nota creible MUY por encima de la nuestra. El
        -- corpus de un piso puntuado 6,9 traia Mercer Residences (9,1) y Palacio Bucarelli (9,1),
        -- y el motor tomaba su percentil 55. Ver pricing-comps-liga.ts.
        AND ${Prisma.raw(sqlCompDeNuestraLiga("m.", "sl.own_score"))}
      ORDER BY m.scenario, m.checkin_date, m.comp_name, m.search_date DESC
    )
    SELECT r.scenario AS property_id, r.checkin_date::text AS rate_date,
      ROUND(percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY r.price_night))::int AS med_guest,
      COUNT(*)::int AS n,
      ROUND(percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY r.price_night)
            FILTER (WHERE r.fuente IN ('booking_mcp','manual')))::int AS med_fiable,
      COUNT(*) FILTER (WHERE r.fuente IN ('booking_mcp','manual'))::int AS n_fiable
    FROM recent r JOIN pricing_settings s ON s.property_id = r.scenario
    GROUP BY r.scenario, r.checkin_date, s.target_pctl
  `).catch((e) => { lecturasCaidas.push({ nombre: 'bucket_fecha', error: String(e).slice(0, 120) }); return [] })
  const fecha = new Map<string, Map<string, { med: number; n: number; fuente: 'fiable' | 'mixto' }>>()
  // Comps FIABLES crudos por piso×fecha, para la guarda de congelación. Va aparte del mapa `fecha`
  // porque ese descarta filas vía `elegirBucket` — y para la guarda un «0 comps fiables» es
  // precisamente el dato, no una fila que se pueda tirar. Una fecha SIN fila aquí es 0.
  const fiablesFecha = new Map<string, Map<string, number>>()
  for (const f of fechaRows) {
    if (!fiablesFecha.has(f.property_id)) fiablesFecha.set(f.property_id, new Map())
    fiablesFecha.get(f.property_id)!.set(f.rate_date, Number(f.n_fiable) || 0)
    if (!fecha.has(f.property_id)) fecha.set(f.property_id, new Map())
    // Misma regla que en el mes, con el umbral de este bucket y sin exigir fechas distintas.
    const el = elegirBucket(
      { valores: f.med_fiable, n: f.n_fiable, fechas: 1 },
      { valores: f.med_guest, n: f.n, fechas: 1 },
      MIN_FECHA_BUCKET,
    )
    if (!el) continue
    fecha.get(f.property_id)!.set(f.rate_date, { med: el.valores, n: el.n, fuente: el.fuente })
  }

  // ─── Prior estacional desde el HISTÓRICO PROPIO (17/07/2026, OK de Alberto) ────────────
  // El motor solo miraba comps actuales: sin comps frescos de un mes "no sabía" que octubre o
  // abril son temporada alta aunque `incomes` lo demuestre desde 2020 (lección de octubre-26:
  // 2 reservas en 4 días a precio corto). Índice por mes = ADR histórico × ocupación relativa
  // (octubre destaca en NOCHES VENDIDAS más que en ADR — históricamente también se vendió
  // barato, por eso el ADR solo no basta). Se usa como SUELO del objetivo, nunca como techo.
  const priorRows = await prisma.$queryRaw<{ pid: string; m: number; adr: number; nights: number }[]>(Prisma.sql`
    SELECT "propertyId" AS pid, EXTRACT(MONTH FROM "checkIn")::int AS m,
           (SUM(amount_gross) / NULLIF(SUM(nights), 0))::float8 AS adr,
           SUM(nights)::float8 AS nights
    FROM incomes
    WHERE nights > 0 AND amount_gross > 0 AND "checkIn" >= CURRENT_DATE - INTERVAL '6 years'
    GROUP BY 1, 2
  `).catch((e) => { lecturasCaidas.push({ nombre: 'prior_estacional', error: String(e).slice(0, 120) }); return [] })
  // El cálculo vive en `lib/sivra/prior-estacional.ts` (puro y testeado) porque la regla NO es
  // simétrica: se sube con ADR × ocupación, pero se BAJA solo con ADR. Ver su cabecera.
  const priorIdx = new Map<string, IndicePrior[]>()
  {
    const porPiso = new Map<string, MesHistorico[]>()
    for (const row of priorRows) {
      if (!porPiso.has(row.pid)) porPiso.set(row.pid, [])
      porPiso.get(row.pid)!.push({ mes: row.m, adr: row.adr, nights: row.nights })
    }
    for (const [pid, rows] of porPiso) priorIdx.set(pid, indicesPrior(rows))
  }
  // ADR BRUTO propio por piso x mes, de la MISMA lectura que el prior (no es una consulta mas).
  // Alimenta el techo por ADR (`pricing-techo-adr.ts`): el prior solo sabe multiplicar el ancla de
  // mercado por un indice, asi que nada comparaba nunca el precio con euros que alguien haya pagado.
  const adrMes = new Map<string, Map<number, { adr: number; nights: number }>>()
  for (const row of priorRows) {
    if (!adrMes.has(row.pid)) adrMes.set(row.pid, new Map())
    adrMes.get(row.pid)!.set(row.m, { adr: Number(row.adr), nights: Number(row.nights) })
  }

  // ─── Velocidad de conversión por mes (17/07/2026, OK de Alberto) ───────────────────────
  // Si un mes futuro acumula ≥2 reservas entradas en los últimos 7 días, el precio está corto
  // (lección oct-26: 2 reservas en 4 días, una con el neto en el suelo). El objetivo de ese mes
  // sube un escalón automático; si la demanda para, la ventana de 7 días vacía el boost sola.
  const velRows = await prisma.$queryRaw<{ pid: string; ym: string; n: number }[]>(Prisma.sql`
    SELECT "propertyId" AS pid, to_char("checkIn", 'YYYY-MM') AS ym, COUNT(*)::int AS n
    FROM incomes
    WHERE "createdAt" >= CURRENT_DATE - 7 AND "checkIn" >= CURRENT_DATE
    GROUP BY 1, 2
  `).catch((e) => { lecturasCaidas.push({ nombre: 'velocidad_reservas', error: String(e).slice(0, 120) }); return [] })
  const velocidad = new Map<string, Map<string, number>>()
  for (const v of velRows) {
    if (!velocidad.has(v.pid)) velocidad.set(v.pid, new Map())
    velocidad.get(v.pid)!.set(v.ym, Number(v.n))
  }

  /** congelaciones de TODOS los pisos, para el aviso agrupado (una pasada = un mensaje como mucho) */
  const congeladasGlobal: { property: string; fecha: string; precio: number; factor: number }[] = []
  /** descongelaciones de TODOS los pisos, para el parte de la respuesta (ver pricing-descongelar.ts) */
  const descongeladasGlobal: { property: string; fecha: string; motivo: string }[] = []

  // ⏱️ Raíl por DÍA de verdad (fix auditoría 18/07/2026): `max_change_pct` está documentado como
  // tope "±/día", pero anclado al precio de la PASADA anterior con 3 crons/día era ±73%/día real
  // (1,2³) — la V de Karol G: 326→112 y 112→701 en pocos días, con reservas cazando los valles
  // (344€ una noche de mercado ~930€). Referencia del raíl = último precio aplicado ANTES de hoy;
  // las pasadas 2ª/3ª del día se mueven dentro del MISMO rango diario. Los saltos legítimos al
  // alza (evento de calendario, suelo estacional) siguen saltando el raíl como antes.
  // Lecturas del ancla que han reventado. Vacío = las dos respondieron (aunque sea con 0 filas).
  const anclaCaida: LecturaAncla[] = []
  const ref24Rows = await prisma.$queryRaw<{ pid: string; rate_date: string; p: number }[]>(Prisma.sql`
    SELECT DISTINCT ON (property_id, rate_date)
      property_id AS pid, rate_date::text AS rate_date, new_price AS p
    FROM pricing_applied
    WHERE dry_run = false AND rate_date >= CURRENT_DATE
      AND applied_at < CURRENT_DATE
    ORDER BY property_id, rate_date, applied_at DESC
  `).catch((e) => { anclaCaida.push({ nombre: 'ref24', error: String(e).slice(0, 120) }); return [] })
  const ref24 = new Map(ref24Rows.map(x => [`${x.pid}|${x.rate_date}`, Number(x.p)]))

  // Ancla de respaldo: con qué precio empezó HOY cada fecha (old_price de la 1ª pasada del día).
  // Cubre las fechas que NUNCA se han escrito —las que entran nuevas en el horizonte—, donde no
  // hay `ref24` que buscar y sin esto cada pasada re-anclaba en la anterior (-36% en dos pasadas
  // el 19/08/2026, House Sevillana jun-ago 2027). Ver lib/sivra/pricing-ancla-rail.ts.
  const anclaHoyRows = await prisma.$queryRaw<{ pid: string; rate_date: string; p: number }[]>(Prisma.sql`
    SELECT DISTINCT ON (property_id, rate_date)
      property_id AS pid, rate_date::text AS rate_date, old_price AS p
    FROM pricing_applied
    WHERE dry_run = false AND rate_date >= CURRENT_DATE AND applied_at >= CURRENT_DATE
    ORDER BY property_id, rate_date, applied_at ASC
  `).catch((e) => { anclaCaida.push({ nombre: 'anclaHoy', error: String(e).slice(0, 120) }); return [] })
  const anclaHoy = new Map(anclaHoyRows.map(x => [`${x.pid}|${x.rate_date}`, Number(x.p)]))

  // 🔓 Días desde la ÚLTIMA escritura de cada fecha — la segunda llave de los congeladores
  // (`lib/sivra/pricing-descongelar.ts`). Va con las auxiliares y NO con las anclas del raíl: si
  // esta lectura revienta, el mapa queda vacío, ninguna fecha recibe la llave por antigüedad y el
  // motor se comporta EXACTAMENTE como antes del 27/08/2026. Es la degradación conservadora — un
  // fallo aquí no puede descongelar de más, solo de menos — pero se declara igual, porque un
  // candado que deja de abrirse en silencio es lo que costó 279 noches.
  const escrituraRows = await prisma.$queryRaw<{ pid: string; rate_date: string; dias: number }[]>(Prisma.sql`
    SELECT property_id AS pid, rate_date::text AS rate_date,
           (CURRENT_DATE - MAX(applied_at)::date)::int AS dias
    FROM pricing_applied
    WHERE dry_run = false AND rate_date >= CURRENT_DATE
    GROUP BY property_id, rate_date
  `).catch((e) => { lecturasCaidas.push({ nombre: 'ultima_escritura', error: String(e).slice(0, 120) }); return [] })
  const diasSinEscribir = new Map(escrituraRows.map(x => [`${x.pid}|${x.rate_date}`, Number(x.dias)]))
  /** true = la lectura respondió (aunque sea con 0 filas). Sin ella, «nunca escrita» no es afirmable. */
  const hayHistorialEscrituras = !lecturasCaidas.some(l => l.nombre === 'ultima_escritura')

  // 🛑 Si CUALQUIERA de las dos lecturas reventó, esta pasada NO tarifica. Ver la cabecera de
  // `pricing-ancla-rail.ts`: un `[]` por excepción es indistinguible del `[]` legítimo (fecha sin
  // histórico, 1ª pasada del día), así que el motor caería a `actual` para TODAS las fechas y el
  // tope ±X%/DÍA pasaría a ser ±X%/PASADA — el mismo −36% del 19/08, por otra puerta.
  //
  // Se aborta también en SIMULACRO a propósito: un preview calculado con el raíl 3× más ancho son
  // números que nadie debería mirar, y así queda UN solo camino que razonar.
  if (anclaCaida.length > 0) {
    const maxPct = recs.reduce((m, r) => Math.max(m, Number(r.max_change_pct) || 0), 0)
    const aviso = avisoRailCiego(anclaCaida, { maxChangePct: maxPct, pasadasPorDia: PASADAS_POR_DIA_APPLY })
    if (aviso) { try { await tgAviso('pisos.pricing-aplicado', aviso) } catch { /* el flag de la respuesta manda */ } }
    return NextResponse.json({
      ok: false,
      rail_ciego: `ancla ilegible (${anclaCaida.map(f => f.nombre).join(', ')}): pasada abortada para no tarifar con el raíl ensanchado`,
      dryRun, paused, days, properties: recs.length, fechas_escritas: 0, results: [],
    }, { status: 503 })
  }

  const results: any[] = []
  // 🚨 Un piso que no se tarifica es CARO y hasta el 22/08/2026 era INVISIBLE: vivía solo aquí
  // dentro, en un array que solo ve quien lee la respuesta HTTP a mano. Ese día House se quedó el
  // día entero sin tarificar (1 comparable utilizable de 22) y ni Telegram ni el latido lo dijeron.
  const sinTarifar: PisoSaltado[] = []
  // 🛑 Escrituras que Smoobu RECHAZÓ. Es el hallazgo 🔴 nº2 de la auditoría del 23/08/2026: el
  // eslabón que pone el precio delante del huésped fallaba en silencio — solo se apuntaba en
  // `results`, que no lee nadie. Ahora sale por Telegram, marca `ok:false` y tiñe el latido.
  const fallosSmoobu: FalloEscritura[] = []
  // Noches que SÍ entraron en el canal. Sin este contador, el latido no puede distinguir «corrió y
  // nada cruzó el umbral del 3%» de «corrió y Smoobu lo rechazó todo».
  let fechasEscritas = 0

  for (const r of recs) {
    const smoobuId = SMOOBU_ID[r.property_id]
    if (!smoobuId) { results.push({ property: r.property_id, error: "sin smoobuId" }); continue }

    if (!dryRun && (r.sample_n < MIN_SAMPLE || r.market_age_days > MAX_MARKET_AGE_DAYS)) {
      results.push({
        property: r.property_id, skipped: "datos_insuficientes",
        sample_n: r.sample_n, market_age_days: r.market_age_days,
        detail: `Necesita ≥${MIN_SAMPLE} comparables y mercado ≤${MAX_MARKET_AGE_DAYS}d`,
      })
      sinTarifar.push({
        property: r.property_id, sample_n: r.sample_n, market_age_days: r.market_age_days,
      })
      continue
    }

    let plRates: Record<string, { price: number | null; available: number }> = {}
    try {
      const res = await fetch(`${BASE}/rates?apartments[]=${smoobuId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { "Api-Key": SMOOBU_KEY, "Cache-Control": "no-cache" }, next: { revalidate: 0 } })
      if (!res.ok) { results.push({ property: r.property_id, error: `Smoobu GET ${res.status}` }); continue }
      plRates = (await res.json()).data?.[smoobuId] ?? {}
    } catch (e) {
      results.push({ property: r.property_id, error: `Smoobu GET ${String(e).slice(0, 80)}` }); continue
    }

    // 🚨 CÓMO SE PASA DE MERCADO (lo que paga el huésped) A BASE (lo que se pone en Smoobu).
    //
    // El canal NO es un multiplicador: es una recta `escaparate = markup × base + cuota_fija`, con
    // la cuota fija (la limpieza) cobrada UNA vez por estancia. Medido en el escaparate real de los
    // cuatro pisos el 19/08/2026 — ver `lib/sivra/pricing-canal.ts` y el cron
    // `/api/sivra/pricing/canal`, que es quien escribe estos tres números. Antes aquí había un
    // ×1,20 SUPUESTO y sin cuota, y ese error viajaba a TODAS las fechas del piso a la vez: en una
    // noche de mercado de 1.500€ pedía 1.250€ de base cuando lo correcto era ~1.333€.
    //
    // Ya NO se filtra `>= 1`: el multiplicador medido es ~0,9 y la guarda vieja lo habría tirado en
    // silencio para dividir por un 1,16 inventado. Solo se rechaza lo imposible (≤0).
    const markup = Number(r.channel_markup) > 0 ? Number(r.channel_markup) : 1
    const nochesRef = Number(r.noches_ref) > 0 ? Number(r.noches_ref) : 2
    const fijoNoche = Number(r.cuota_fija) > 0 ? Number(r.cuota_fija) / nochesRef : 0
    /** mercado (guest/noche) → base de Smoobu, con la cuota fija descontada. Única conversión. */
    const aBase = (guestNoche: number) => baseDesdeGuestConFijo(guestNoche, markup, fijoNoche)
    const demandFactor = Number(r.demand_factor) > 0 ? Number(r.demand_factor) : 1
    const qualityFactor = Number(r.quality_factor) > 0 ? Number(r.quality_factor) : 1
    // ─── ANCLA GLOBAL: corpus ACUMULADO, no el barrido de esta mañana ────────────────────
    // Es la base de TODA fecha sin bucket de mes, y era la fuente del serrucho: el percentil de
    // una sola pasada muestrea 6-7 fechas de entrada distintas cada día, así que el ancla saltaba
    // 95↔208 y las fechas sin comps propios la perseguían saturando el raíl ±20% en direcciones
    // alternas. Ver `lib/sivra/pricing-ancla-global.ts` para las mediciones.
    //
    // Como en el bucket del mes, el corpus FIABLE (medido por fecha) manda si por sí mismo pasa el
    // umbral; si no, la mezcla; y si tampoco, el barrido — nunca se queda un piso sin ancla.
    const ancla = elegirAnclaGlobal({
      acumulada: {
        valores: r.med_anc == null ? null : { med: r.med_anc, flo: r.flo_anc!, cei: r.cei_anc! },
        fechas: Number(r.fechas_anc),
      },
      pasada: { med: r.med_pasada, flo: r.flo_pasada, cei: r.cei_pasada },
    })
    const anclaOrigen: 'acumulada_fiable' | 'acumulada_mixta' | 'pasada' =
      ancla.origen !== 'acumulada' ? 'pasada' : r.corpus_fiable ? 'acumulada_fiable' : 'acumulada_mixta'
    const medGuestGlobal = ancla.valores.med
    // El "recomendado" se compone con los MISMOS dos factores que aplica cada fecha: si se
    // calculara aparte (como hacía el SQL) podría contradecir al precio que el motor escribe.
    const baseTargetGlobal = aBase(medGuestGlobal * demandFactor * qualityFactor)
    const floorBaseGlobal = aBase(ancla.valores.flo)
    const ceilBaseGlobal = aBase(ancla.valores.cei)
    const mesProp = mes.get(r.property_id)
    const fechaProp = fecha.get(r.property_id)

    // De dónde salió la ocupación que movió la palanca en cada fecha, y cuántas fechas se libraron
    // del descuento por no haber abierto aún su venta. Va al informe para poder distinguir «bajó
    // porque el mes está flojo» de «no se tocó porque todavía no se vende».
    const demFuentes: Record<DemandaFechaResult["fuente"], number> = { mes: 0, global: 0 }
    let demGateadas = 0
    // Fechas de evento cuyo salto se ancló al ancla GLOBAL por no haber bucket del mes. Va a la
    // respuesta a propósito: es el único camino que queda por el que la composición del barrido
    // puede mover un precio de golpe (ver `lib/sivra/pricing-base-evento.ts`), y un 0 aquí es la
    // prueba de que no ha pasado — distinto de «no se ha mirado».
    let saltosEventoSinMes = 0
    const ops: { dates: string[]; daily_price: number; min_length_of_stay?: number }[] = []
    // La procedencia del factor viaja hasta la fila persistida: sin ella, una pasada degradada al
    // factor global es indistinguible de una buena en cuanto la respuesta HTTP se pierde.
    const audit: {
      rate_date: string; old_price: number | null; new_price: number
      demanda_fuente: DemandaFechaResult["fuente"]; demanda_gateada: boolean
      antelacion_factor: number | null
      // De qué ancla salió ESTA noche. Sin esto, el seguimiento del serrucho solo puede medir el
      // agregado y no puede atribuir la mejora a la rama que se tocó (ver la migración
      // 2026-08-28_pricing_applied_ancla.sql).
      base_fuente: 'mes' | 'global'
    }[] = []
    // Fechas que la guarda «evento a ciegas» dejó sin bajar en esta pasada (van a la respuesta y
    // al aviso agrupado del final — una congelación muda sería un precio que nadie explica).
    const congeladas: { fecha: string; precio: number; factor: number }[] = []
    // Fechas que se llevaron premio por anticipación en esta pasada. En la respuesta a propósito:
    // una palanca que sube precios en vivo tiene que poder auditarse sin abrir la BD, y un 0 aquí
    // es la prueba de que no ha movido nada (distinto de «no se ha mirado» → `antelacion_k = 0`).
    const premiadas: { fecha: string; factor: number }[] = []
    // Fechas a las que la SEGUNDA llave (antigüedad o rumor caído) les ha quitado el veto de las
    // guardas en esta pasada. En la respuesta a propósito: una descongelación en masa tiene que
    // poder verse sin abrir la BD, y un 0 aquí es la prueba de que el candado no se ha tocado.
    const descongeladas: { fecha: string; motivo: string }[] = []
    // Fechas donde el techo de mercado medido recortó el objetivo (pricing-techo-mercado.ts). En
    // la respuesta a propósito: un precio que baja por el techo debe poder distinguirse de uno que
    // baja porque el mercado del mes se hundió.
    const techoAcotadas: { fecha: string; techo: number; origen: "fecha" | "mes" }[] = []
    // Fechas recortadas por el TECHO POR ADR PROPIO. Viajan a la respuesta a proposito: si
    // este rail muerde en fechas normales, la senal es que el ancla de mercado se ha vuelto a
    // ir de liga — no que el rail este haciendo bien su trabajo en silencio.
    const adrAcotadas: { fecha: string; techo: number; adr: number }[] = []
    const cur = new Date(today)
    let dayIndex = -1
    while (cur <= end) {
      const date = fmt(cur); cur.setDate(cur.getDate() + 1)
      dayIndex++
      const daysOut = dayIndex // 0 = hoy; días vista de la fecha (idea #2/#3)
      const info = plRates[date]
      if (!info || !info.available) continue
      const old = info.price != null ? Math.round(info.price) : null
      const ym = date.slice(0, 7)
      const mb = mesProp?.get(ym)
      // Ajuste demanda/calidad POR FECHA (ver pricing-demanda.ts, que decide las dos cosas a la vez):
      // la ocupación de SU MES manda cuando se puede juzgar si esa fecha ya se vende, y el descuento
      // se neutraliza en las fechas cuya ventana de venta aún no ha abierto (el boost sí se conserva).
      // El ajuste de calidad aplica siempre.
      const ant = antelacionDe(r.property_id, date)
      const dGate = factorDemandaFecha({
        factorDemanda: demandFactor,
        diasVista: daysOut,
        antelacionMediana: ant?.mediana ?? null,
        muestra: ant?.muestra ?? 0,
        ocupacionMes: ocupacionMes.get(`${r.property_id}|${ym}`) ?? null,
        demandaBaseline: Number(r.demand_baseline),
        demandaK: Number(r.demand_k),
      })
      demFuentes[dGate.fuente]++
      if (dGate.gateado) demGateadas++
      const dqDate = dGate.factor * qualityFactor
      const baseGlobalD = aBase(medGuestGlobal * dqDate)
      // El bucket del mes solo vale si hay comps SUFICIENTES y de VARIAS fechas: 10 anuncios del mismo
      // dia describen ese dia, no el mes (lección de junio 2027, ver la nota de la consulta).
      const useMonth = !!mb && mb.n >= MIN_BUCKET && mb.fechas >= MIN_FECHAS_MES
      const baseD = useMonth ? aBase(mb!.med * dqDate) : baseGlobalD
      const floorD = useMonth ? aBase(mb!.flo) : floorBaseGlobal
      const ceilD = useMonth ? aBase(mb!.cei) : ceilBaseGlobal
      const normalBase = baseD // "precio normal" del día (mes/global), referencia del outlier (idea #2)
      let target = clamp(baseD, floorD, ceilD)
      let eventTarget = 0
      let evFactor = 1
      if (r.events_enabled) {
        let ev = Math.max(eventFactor(date), autoEv.get(date) ?? 1)
        // R6 (auditoría 18/07/2026) — vísperas/resacas de evento FUERTE: la noche pegada a un
        // evento ≥2× hereda la MITAD del premio (Karol G 2,5 → víspera 1,75). Sin esto, el 9-10
        // jun-27 se trató como junio normal y el motor lo hundió a 112€ (la V que cazó la reserva
        // de 344€). Solo ±1 día y solo eventos fuertes: un puente normal no irradia.
        if (ev < 2) {
          const evPrev = fmt(new Date(new Date(date).getTime() - 86400000))
          const evNext = fmt(new Date(new Date(date).getTime() + 86400000))
          const vecino = Math.max(
            eventFactor(evPrev), autoEv.get(evPrev) ?? 1,
            eventFactor(evNext), autoEv.get(evNext) ?? 1)
          if (vecino >= 2) ev = Math.max(ev, 1 + (vecino - 1) * 0.5)
        }
        evFactor = ev
        if (ev > 1) {
          // Resolución por fecha en eventos, SIN doble conteo (fix auditoría 18/07/2026, tarde):
          // el factor de evento SOLO puede multiplicar una base que NO contenga ya el evento (la
          // global). La mediana de la FECHA exacta y la del MES en fechas barridas para el evento
          // YA SON precio-de-evento — multiplicarlas por ev otra vez infló Karol G hacia ~2.000€
          // (bug introducido en #985; la rampa 112→701 iba camino de eso). Prioridad:
          //   fecha exacta (n≥MIN_FECHA_BUCKET) → su mediana TAL CUAL (sin ×ev);
          //   si no                             → base normal del mes × ev.
          // En ambos casos compite por MAX con el target del mes (que tampoco se multiplica).
          //
          // 🚨 La base de ese `× ev` es el bucket del MES, NO el ancla global (fix del SERRUCHO,
          // 25/08/2026 — ver la cabecera de `lib/sivra/pricing-base-evento.ts`). El bucket del mes
          // EXCLUYE las fechas con evento, así que no hay el doble conteo que motivó elegir la
          // global en #985; y a diferencia de la global —que es el percentil del puñado de fechas
          // que el barrido de Booking muestreó esta mañana, y que saltaba 129€→205€→146€ en tres
          // días— no se mueve con la composición de la muestra. Como el salto de evento se salta
          // el raíl ±%/día a propósito, esa inestabilidad viajaba entera al precio en UNA pasada:
          // Duplex 16/09/2026 hizo 158€→289€ (+83%) el 24/08 y volvió a caer al día siguiente.
          const fb = fechaProp?.get(date)
          const useFecha = !!fb && fb.n >= MIN_FECHA_BUCKET
          const baseEv = baseSaltoEvento({
            baseMes: useMonth ? clamp(baseD, floorD, ceilD) : null,
            baseGlobal: clamp(baseGlobalD, floorBaseGlobal, ceilBaseGlobal),
          })
          if (baseEv.origen === "global") saltosEventoSinMes++
          const globalEvent = Math.round(baseEv.base * ev)
          const bestEvent = useFecha
            ? Math.max(globalEvent, aBase(fb!.med * dqDate))
            : globalEvent
          target = Math.max(target, bestEvent)
          eventTarget = bestEvent // capturado para saltar el raíl ±20% al ALZA (ver abajo)
        }
        // Premio de MERCADO por fecha exacta, INDEPENDIENTE del factor de evento del calendario: si
        // el mercado del propio día va ≥PREMIO_MERCADO_RATIO× su base normal, es premium aunque
        // Ticketmaster/websearch no lo hayan flagueado (el hueco por el que Karol G/Feria se vendieron
        // baratas). Ancla al mercado de ESA fecha TAL CUAL (helper puro, sin ×factor → sin doble
        // conteo). Coincide con la rama `useFecha` de arriba cuando también hay evento (MAX, idempotente).
        const fbMkt = fechaProp?.get(date)
        if (fbMkt) {
          const premio = premioMercadoFecha(
            { medFechaGuest: fbMkt.med, comps: fbMkt.n, normalBase, markup, fijoNoche, dqFactor: dqDate },
            { minComps: MIN_FECHA_BUCKET, ratio: PREMIO_MERCADO_RATIO },
          )
          if (premio > target) { target = premio; eventTarget = Math.max(eventTarget, premio) }
        }
      }
      // Prior estacional (histórico propio). SUELO en los meses fuertes y —desde el 06/08/2026,
      // decisión de Alberto— TECHO en los flojos: «a la baja sí, pero sin regalar precio». La
      // bajada solo mira el ADR, nunca las noches vendidas: en julio y sobre todo agosto Sevilla
      // está vacía y es NORMAL que no haya reservas — bajar por eso regala margen sin traer a
      // nadie. Y nunca perfora el suelo del piso. Reglas y tests en `lib/sivra/prior-estacional.ts`.
      const pIdx = priorIdx.get(r.property_id)?.[Number(ym.slice(5, 7)) - 1] ?? { alza: 1, baja: 1 }
      target = aplicarPrior({
        target, indice: pIdx, anclaGlobal: baseGlobalD, floor: floorD, hayBucketMes: useMonth,
      })
      // Ancla SUAVE al mercado de la FECHA exacta (el finde sin evento) — ver pricing-ancla-fecha.ts.
      // El bucket del MES mezcla entre semana y findes y el premio de evento exige ≥1,5×, así que un
      // sábado a 1,1-1,4× su mes era invisible (3 reservas vendidas un 36-43% bajo el p50 de su fecha).
      // Solo corpus FIABLE y ≥5 comps; solo SUBE y NO salta el raíl ±%/día (escala en 1-2 pasadas).
      let anclaF = 0
      {
        const fbA = fechaProp?.get(date)
        if (fbA) {
          anclaF = anclaMercadoFecha({
            medFechaGuest: fbA.med, comps: fbA.n, fuente: fbA.fuente, markup, fijoNoche, dqFactor: dqDate,
          })
          if (anclaF > target) target = anclaF
        }
      }
      // Velocidad de conversión: +10% con ≥2 reservas del mes en 7 días (+20% desde 4), sin
      // pasar del techo de mercado del mes. Se recalcula desde el mercado en cada pasada (no
      // compone) y el raíl ±% por pasada sigue limitando el movimiento.
      const vel = velocidad.get(r.property_id)?.get(ym) ?? 0
      if (vel >= 2) {
        const boosted = Math.round(target * (vel >= 4 ? 1.2 : 1.1))
        if (boosted > target) target = Math.min(boosted, Math.max(ceilD, target))
      }
      // Demanda por vuelos a SVQ (Fase 3): inerte si flight_demand_k=0 o sin dato de la fecha.
      if (Number(r.flight_demand_k) > 0) {
        const fi = flightIdx.get(date) ?? 1
        if (fi > 1) target = Math.round(target * (1 + Number(r.flight_demand_k) * (fi - 1)))
      }
      if (Number(r.gap_discount_pct) > 0) {
        const prevD = fmt(new Date(new Date(date).getTime() - 86400000))
        const nextD = fmt(new Date(new Date(date).getTime() + 86400000))
        const prevBooked = plRates[prevD] && !plRates[prevD].available
        const nextBooked = plRates[nextD] && !plRates[nextD].available
        if (prevBooked && nextBooked) target = Math.round(target * (1 - Number(r.gap_discount_pct)))
      }
      // ⏳ ANTICIPACIÓN. El espejo de la urgencia, y va justo antes que ella a propósito: las dos
      // son excluyentes por construcción (una actúa por debajo de la antelación mediana del mes y la
      // otra por encima), así que el orden no compone nada — pero deja el par junto y legible. Solo
      // propone SUBIR el objetivo, y todo lo que viene después —el raíl de ±%/día, los suelos, el
      // techo del propietario y el techo de mercado MEDIDO— sigue mandando. Inerte con
      // antelacion_k=0 y en las noches de evento (ver lib/sivra/pricing-antelacion.ts).
      const antic = factorAntelacion(
        {
          diasVista: daysOut,
          antelacionMediana: ant?.mediana ?? null,
          muestra: ant?.muestra ?? 0,
          factorEvento: evFactor,
        },
        { k: Number(r.antelacion_k) },
      )
      if (antic.factor > 1) {
        target = Math.round(target * antic.factor)
        premiadas.push({ fecha: date, factor: Number(antic.factor.toFixed(4)) })
      }

      // ⏳ URGENCIA (last-minute). Va AQUÍ a propósito: solo propone bajar el objetivo, y todo lo
      // que viene después —el raíl de ±%/día, el suelo de coste, el estacional y el techo— sigue
      // mandando. Inerte con lastminute_k=0 y en las noches de evento. La referencia de "cuándo
      // toca" es la antelación MEDIDA del piso, no un umbral inventado (ver pricing-lastminute.ts).
      // Antelación del piso PARA EL MES de esta fecha (`ant`, calculada arriba para el gate de
      // demanda): la global mezclaba Feria con noviembre y disparaba la urgencia meses antes de tiempo.
      const lm = factorLastMinute(
        {
          diasVista: daysOut,
          antelacionMediana: ant?.mediana ?? null,
          muestra: ant?.muestra ?? 0,
          factorEvento: evFactor,
        },
        { k: Number(r.lastminute_k) },
      )
      if (lm.factor < 1) target = Math.round(target * lm.factor)

      // Suelo del raíl del día: lo captura también el techo de mercado de más abajo, para que un
      // precio inflado DESCIENDA a velocidad de raíl (varias pasadas), nunca de golpe.
      let railLo: number | null = null
      if (old != null) {
        // Ancla del raíl = precio de AYER (ref24), no el de la pasada anterior de HOY: así el
        // tope ±max_change_pct es por DÍA aunque el cron corra 3 veces al día. Sin histórico
        // (fecha nueva/nunca escrita) cae al precio con el que la fecha EMPEZÓ el día, que
        // mantiene el tope diario igual; y solo en la 1ª pasada, al precio vivo.
        const ancla = anclaRail({
          ref24: ref24.get(`${r.property_id}|${date}`),
          primeroHoy: anclaHoy.get(`${r.property_id}|${date}`),
          actual: old,
        })
        const lo = Math.round(ancla * (1 - Number(r.max_change_pct)))
        const hi = Math.round(ancla * (1 + Number(r.max_change_pct)))
        railLo = lo
        target = clamp(target, lo, hi)
      }
      if (r.min_price != null) target = Math.max(target, r.min_price)
      // Suelo estacional: impide que una fecha de temporada alta (primavera/Navidad/eventos) se
      // deslice al suelo base cuando el mercado de ese mes caduca. Inerte si seasonal_floor_k=0.
      if (Number(r.seasonal_floor_k) > 0 && r.min_price != null) {
        // El suelo mira los eventos de AMBAS fuentes (calendario + `pricing_eventos_auto`), igual que
        // el precio: si no, un evento que solo conoce la tabla (Karol G) subía el objetivo pero dejaba
        // el suelo de un día normal.
        //
        // Y usa `autoEvSuelo`, no `autoEv`: aquí SÍ entran los eventos PREVISTOS (los que la prensa da
        // por hechos pero aún no tienen entradas — la final de Copa, un congreso recién anunciado).
        // Es la única puerta por la que se les deja pasar, y es deliberado: proteger el suelo de una
        // fecha que al final no era nada cuesta unas noches sin vender baratas; NO protegerla y que sí
        // fuera la final significa haberla vendido a precio de sábado corriente, y eso no se recupera.
        // El razonamiento completo está en `lib/sivra/eventos-estado.ts`.
        const evParaSuelo = r.events_enabled ? (autoEvSuelo.get(date) ?? 1) : 1
        const factor = 1 + (seasonalFloorFactor(date, evParaSuelo) - 1) * Number(r.seasonal_floor_k)
        let sf = Math.round(r.min_price * factor)
        if (r.max_price != null) sf = Math.min(sf, r.max_price)
        target = Math.max(target, sf)
      }
      // Salto de evento: una fecha de evento CONOCIDA (puente/Feria/S.Santa) sube a su precio de
      // GOLPE, sin esperar a la rampa de ±20%/día — un evento del calendario no es ruido. Solo al
      // ALZA (las bajadas siguen el raíl). Resuelve la malventa por antelación: quien reserva una
      // fecha de evento la ve ya a su precio aunque el apply no haya escalado día a día.
      if (eventTarget > target) target = eventTarget
      if (r.max_price != null) target = Math.min(target, r.max_price)
      // 🏷️ TECHO de mercado MEDIDO (25/08/2026, ver pricing-techo-mercado.ts). Todo lo de arriba
      // puede SUBIR el objetivo saltándose el raíl (salto de evento, premio de mercado) y las
      // guardas de abajo pueden impedir que baje — pero nada miraba lo que el mercado de ESA fecha
      // cobra de verdad. Medido el día del fix: 238 fechas listadas a >1,5× la mediana fiable de su
      // propia fecha (55 a >×3), congeladas por la guarda de outlier hasta 30 días del check-in.
      // Con la fecha medida (≥5 comps fiables) el huésped no puede ver más de 1,5× su mediana; sin
      // evento, tampoco más de 2,5× el mes fiable. El descenso respeta raíl y min_price, y
      // `liberaCongelacion` impide que las guardas retengan un precio por encima del techo.
      const fbT = fechaProp?.get(date)
      const tMkt = techoMercado({
        medFechaGuest: fbT?.med ?? null, compsFecha: fbT?.n ?? 0, fuenteFecha: fbT?.fuente ?? null,
        medMesGuest: useMonth ? mb!.med : null, fuenteMes: useMonth ? mb!.fuente : null,
        factorEvento: evFactor, markup, fijoNoche, dqFactor: dqDate,
      })
      const acote = acotarPorTecho({
        target, techo: tMkt.techo, old, railLo, minPrice: r.min_price,
      })
      target = acote.target
      // Los suelos del acote (raíl del día, min_price) no pueden re-subir por encima del techo
      // del PROPIETARIO: max_price manda siempre (hoy NULL en los cuatro, pero el orden importa).
      if (r.max_price != null) target = Math.min(target, r.max_price)
      if (acote.acotado) techoAcotadas.push({ fecha: date, techo: tMkt.techo, origen: tMkt.origen! })
      // 💶 TECHO por ADR PROPIO (03/09/2026, ver pricing-techo-adr.ts). El techo de arriba mira el
      // MERCADO; este mira los euros que este piso ha cobrado de verdad ese mes. Hacia falta porque
      // un ancla de mercado envenenada -comps fuera de nuestra liga- se propagaba entera hasta
      // Smoobu sin que nada la contrastara: los tres pisos que no se venden pedian x1,6-3,1 lo que
      // habian cobrado en su vida. NO toca las fechas de evento (el historico del mes no las
      // describe) y desciende por el mismo `acotarPorTecho`, o sea a velocidad de rail y sin
      // perforar min_price.
      //
      // Se DESCARTA su `liberaCongelacion`, y es correcto, no un olvido: las dos guardas que ese
      // flag desactiva (Karol G con evFactor >= 2, y «evento a ciegas» desde 1,15) solo actuan en
      // fechas de EVENTO, que son exactamente las que este techo no toca. Propagarlo solo podria
      // descongelar una fecha de evento por una via que nunca la ha juzgado.
      {
        const aq = adrMes.get(r.property_id)?.get(Number(ym.slice(5, 7)))
        const tAdr = aplicarTechoAdr({
          objetivo: target,
          adrBase: aq ? aBase(aq.adr) : null,
          nochesMuestra: aq?.nights ?? 0,
          factorEvento: evFactor,
          suelo: r.min_price,
        })
        if (tAdr.motivo === 'aplicado' && tAdr.techo != null) {
          const acA = acotarPorTecho({ target, techo: tAdr.techo, old, railLo, minPrice: r.min_price })
          if (acA.acotado) adrAcotadas.push({ fecha: date, techo: tAdr.techo, adr: Math.round(aBase(aq!.adr)) })
          target = acA.target
        }
      }
      const liberaTecho = acote.liberaCongelacion
      // 🔓 Segunda llave (27/08/2026). El techo solo abre donde hay mercado MEDIDO de la fecha, y
      // eso es una cuarta parte del calendario: 249 de 279 noches congeladas no podían salir nunca.
      // Ver la cabecera de `lib/sivra/pricing-descongelar.ts` para el caso completo.
      const desc = liberaTecho
        ? { libera: false, motivo: '' }   // el techo ya la abre: no hay nada que añadir
        : descongelar({
            // Sin la lectura de historial no se puede afirmar «nunca escrita»: se trata como
            // reciente (0 días) para que un fallo de consulta NO descongele por la puerta de atrás.
            diasSinEscribir: hayHistorialEscrituras
              ? (diasSinEscribir.get(`${r.property_id}|${date}`) ?? null)
              : 0,
            rumorCaido: rumorCaido.has(date),
          })
      const liberaGuardas = liberaTecho || desc.libera
      // Guarda de evento fuerte (lección Karol G, 15/07/2026): con factor ≥2 y SIN mercado del
      // mes (fallback global), el precio NUNCA baja — el bucket global (dominado por temporada
      // media/baja) arrastraría la noche de evento hacia abajo (788→283 en jun-2027) y el factor
      // solo multiplica esa base hundida. Se CONGELA el precio actual hasta tener comps del mes.
      // Excepción: si el techo del propietario (max_price) exige bajar, manda el techo.
      // `liberaTecho` la desactiva: la congelación existe para fechas SIN mercado con el que
      // juzgar, y el techo solo está definido cuando ese mercado SÍ está medido.
      if (evFactor >= 2 && !useMonth && old != null && target < old && !liberaTecho
          && (r.max_price == null || old <= r.max_price)) continue
      // 🧊 Guarda «evento a ciegas» (caso Bienal, 13/08/2026 — decisión Fable delegada por
      // Alberto): generaliza la de Karol G por FECHA en vez de por mes y desde factor 1,15. Un
      // evento CONFIRMADO cuya fecha no tiene comps fiables propios NO se baja: el ancla global
      // (dominada por fechas cercanas baratas) hundió la Bienal −20%/día tres horas DESPUÉS de
      // confirmarla. Subir sí puede (eventTarget/ancla siguen mandando); el descongelado es
      // automático — en cuanto la rutina de Booking mida la fecha, la condición deja de cumplirse
      // y el raíl deshace en 2-3 pasadas lo que estuviera inflado. Solo confirmados: los previstos
      // son apuestas y su premio ya va ponderado. `max_price` manda si obligara a bajar (hoy NULL).
      if (r.events_enabled && old != null && target < old && !liberaGuardas
          && (r.max_price == null || old <= r.max_price)) {
        const evConfirmado = Math.max(eventFactor(date), autoEvConfirmado.get(date) ?? 1)
        const ciegas = decidirEventoACiegas({
          factorEvento: evConfirmado,
          compsFiablesFecha: fiablesFecha.get(r.property_id)?.get(date) ?? 0,
        })
        if (ciegas.congelar) {
          congeladas.push({ fecha: date, precio: old, factor: evConfirmado })
          continue
        }
      }
      // Guarda de outlier por precio ACTUAL: si el precio de hoy supera en +40% la base normal
      // del mes/global, esa noche es especial (un puente/evento que el bucket del mes no ve).
      // Lejos de la fecha (>N días) NO la hundimos por debajo del actual a ciegas; cerca
      // dejamos que el last-minute suavice. El techo del propietario manda (si max_price
      // obliga a bajar, no congelamos).
      // `liberaTecho` la desactiva: «esa noche es especial» deja de ser una hipótesis defendible
      // cuando el mercado MEDIDO de la fecha dice que estamos por encima de su techo.
      if (old != null && normalBase > 0 && old > normalBase * OUTLIER_RATIO
          && target < old && daysOut > OUTLIER_HORIZON_DAYS && !liberaGuardas
          && (r.max_price == null || old <= r.max_price)) continue
      // Se anota DESPUÉS de las dos guardas y solo si la fecha va a escribirse de verdad: contar
      // aquí una llave que luego frena la banda muerta sería inflar el parte con trabajo que no se
      // hizo — el mismo error que este PR viene a corregir, por la otra punta.
      if (desc.libera && old != null && target < old) descongeladas.push({ fecha: date, motivo: desc.motivo })
      if (old != null && target === old) continue
      // 🔇 Banda muerta anti-churn (fix auditoría 18/07/2026): el motor escribía 3.400+ cambios
      // por semana para 2 pisos (media 4-6 reescrituras por fecha, 78% de fechas subiendo Y
      // bajando la misma semana) porque el objetivo fluctúa a diario (mercado/ocupación/velocity)
      // y cualquier ±1€ se escribía. Un cambio <3% no se escribe — salvo que el precio actual
      // esté por debajo del suelo del propietario (eso se corrige siempre).
      if (old != null && (r.min_price == null || old >= r.min_price)
          && Math.abs(target - old) / old < 0.03) continue
      // Idea #3 — min-stay en noches de evento fuerte y lejanas, salvo hueco suelto entre reservas
      // (que sería imposible de cubrir con 2-3 noches). Solo lo escribimos si ya vamos a tocar la
      // fecha; el gap-discount sigue tratando los huecos aparte.
      let minStay = 0
      if (MIN_STAY_EVENTOS && evFactor >= 1.8 && daysOut > 14) {
        const prevD = fmt(new Date(new Date(date).getTime() - 86400000))
        const nextD = fmt(new Date(new Date(date).getTime() + 86400000))
        const esHueco = !!plRates[prevD] && !plRates[prevD].available && !!plRates[nextD] && !plRates[nextD].available
        if (!esHueco) minStay = evFactor >= 2.5 ? 3 : 2
      }
      ops.push({ dates: [date], daily_price: target, ...(minStay > 0 ? { min_length_of_stay: minStay } : {}) })
      audit.push({
        rate_date: date, old_price: old, new_price: target,
        demanda_fuente: dGate.fuente, demanda_gateada: dGate.gateado,
        // NULL = la palanca no llegó a evaluarse (apagada, sin antelación medida o muestra corta).
        // 1.00 = evaluada y sin premio. La diferencia es lo que separa «no tocaba» de «no se miró».
        antelacion_factor: antic.evaluado ? Number(antic.factor.toFixed(4)) : null,
        // MISMO `useMonth` que eligió `baseD` doce lineas mas arriba: no se re-deriva aqui para que
        // no puedan divergir. 'global' es la rama que oscilaba antes del PR #1811.
        base_fuente: useMonth ? 'mes' : 'global',
      })
    }

    let written = false
    if (!dryRun && ops.length > 0) {
      try {
        const res = await fetch(`${BASE}/rates`, {
          method: "POST",
          headers: { "Api-Key": SMOOBU_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ apartments: [smoobuId], operations: ops }),
        })
        written = res.ok
        if (!res.ok) {
          results.push({ property: r.property_id, error: `Smoobu POST ${res.status}` })
          fallosSmoobu.push({ property: r.property_id, motivo: `Smoobu POST ${res.status}`, fechas: ops.length })
        }
      } catch (e) {
        results.push({ property: r.property_id, error: `Smoobu POST ${String(e).slice(0, 80)}` })
        fallosSmoobu.push({ property: r.property_id, motivo: `Smoobu POST ${String(e).slice(0, 60)}`, fechas: ops.length })
      }
    }
    if (written) fechasEscritas += ops.length

    // 🛑 Si Smoobu rechazó, NO se anota nada en `pricing_applied`. Escribirlo igual —que es lo que
    // se hacía hasta el 23/08/2026— tiene dos costes, y el segundo es el que muerde:
    //   1. La tabla de auditoría AFIRMA «481€ aplicado» con el canal en 534€. Nadie lo comprueba.
    //   2. `pricing_applied` es de donde sale `ref24`, el ancla del raíl de MAÑANA (ver la consulta
    //      de arriba). Un precio fantasma se convierte en el punto desde el que se mide el ±20%,
    //      así que el error no se queda quieto: se propaga y se compone.
    // En simulacro sí se anota, como siempre: `dry_run=true` ya lo distingue y `ref24` lo excluye.
    const anotable = dryRun || written || ops.length === 0
    if (audit.length > 0 && anotable) {
      try {
        const auditRows = audit.map(a =>
          Prisma.sql`(${r.property_id}, ${a.rate_date}::date, ${a.old_price}::int, ${a.new_price}::int, ${dryRun}, ${a.demanda_fuente}, ${a.demanda_gateada}, ${a.antelacion_factor}::numeric, ${anclaOrigen}, ${a.base_fuente})`)
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO pricing_applied (property_id, rate_date, old_price, new_price, dry_run, demanda_fuente, demanda_gateada, antelacion_factor, ancla_origen, base_fuente)
          VALUES ${Prisma.join(auditRows)}`)
      } catch { /* no crítico */ }
    }

    results.push({
      property: r.property_id,
      recommended_guest: Math.round(medGuestGlobal * demandFactor * qualityFactor),
      base_target: baseTargetGlobal,
      // De dónde sale el ancla global. Un `pasada` es el ancla VIEJA (oscilante) y hay que
      // poder verlo sin abrir la BD: significa que ese piso no reúne MIN_FECHAS_ANCLA fechas
      // en el corpus acumulado de 30 días.
      ancla_global: { origen: anclaOrigen, med: medGuestGlobal, fechas: Number(r.fechas_anc), min_fechas: MIN_FECHAS_ANCLA },
      meses_con_mercado: mesProp ? [...mesProp.entries()].filter(([, v]) => v.n >= MIN_BUCKET && v.fechas >= MIN_FECHAS_MES).map(([k]) => k) : [],
      // De QUÉ corpus sale el bucket de cada mes elegible. Un objetivo que no dice su procedencia es
      // indistinguible de uno medido: `mixto` avisa de que ahí todavía pesa el precio de anuncio.
      meses_bucket_fuente: mesProp
        ? Object.fromEntries([...mesProp.entries()]
            .filter(([, v]) => v.n >= MIN_BUCKET && v.fechas >= MIN_FECHAS_MES)
            .map(([k, v]) => [k, v.fuente]))
        : {},
      meses_calientes: [...(velocidad.get(r.property_id)?.entries() ?? [])].filter(([, n]) => n >= 2).map(([k, n]) => `${k}:${n}`),
      // Fechas de evento cuyo salto tuvo que anclarse al ancla GLOBAL (mes sin mercado medido). Es el
      // único resto del serrucho: el ancla global se mueve con lo que el barrido muestree hoy y el
      // salto de evento no pasa por el raíl. Un 0 aquí es una AFIRMACIÓN, no un silencio.
      saltos_evento_sin_mes: saltosEventoSinMes,
      bounds: { floor_base: floorBaseGlobal, ceil_base: ceilBaseGlobal, min: r.min_price, max: r.max_price },
      // Antelación MEDIDA del piso POR MES (mes → días de mediana). Sin ella la palanca de urgencia
      // queda inerte, así que conviene verla para distinguir «no hacía falta bajar» de «no lo sé».
      // Va por mes y no en un solo número porque ahí estaba el fallo que se corrigió el 01/08/2026:
      // la mediana global de Busto sale 108 días y la de su octubre, 3.
      antelacion_por_mes: Object.fromEntries(
        antelacionRows
          .filter(a => a.property_id === r.property_id)
          .map(a => [a.mes, { mediana: Number(a.mediana), muestra: Number(a.muestra) }]),
      ),
      lastminute_k: Number(r.lastminute_k),
      // La palanca de anticipación, auditable en la propia respuesta: intensidad, cuántas fechas se
      // llevaron premio y las 10 primeras con su factor. Con `antelacion_k = 0` esto es `{k:0, fechas:0}`,
      // que dice «apagada», no «no hizo falta» — la distinción que pide el medidor de resultados.
      antelacion: {
        k: Number(r.antelacion_k),
        fechas: premiadas.length,
        muestra: premiadas.slice(0, 10),
      },
      // La palanca de demanda, auditable: la ocupación ANUAL que veía el motor antes, la de cada mes
      // que ahora sí mira, cuántas fechas salieron de cada fuente y cuántas se libraron del descuento.
      demanda: {
        ocupacion_global: Number(r.occupancy_global),
        fuentes: demFuentes,
        fechas_sin_descuento: demGateadas,
        ocupacion_por_mes: Object.fromEntries(
          ocupacionMesRows
            .filter(o => o.property_id === r.property_id)
            .map(o => [o.ym, Number(Number(o.occ).toFixed(3))]),
        ),
      },
      dates_con_cambio: ops.length, written, sample: audit.slice(0, 3),
      // Fechas recortadas por el techo de mercado medido en esta pasada (y de dónde salió el techo).
      techo_mercado: techoAcotadas.length > 0
        ? { fechas: techoAcotadas.length, sample: techoAcotadas.slice(0, 5) }
        : undefined,
      // Fechas recortadas por el techo por ADR propio (03/09/2026). Ver `pricing-techo-adr.ts`.
      techo_adr: adrAcotadas.length > 0
        ? { fechas: adrAcotadas.length, sample: adrAcotadas.slice(0, 5) }
        : undefined,
      // Fechas de evento confirmado que NO se bajaron por falta de mercado fiable propio. Van en la
      // respuesta a propósito: un precio congelado que no se declara es indistinguible de uno olvidado.
      congeladas,
      // 🔓 Lo contrario: fechas a las que la segunda llave les quitó el veto y por fin vuelven a
      // moverse. `0` significa «el candado no ha tenido que abrirse», no «no hay candado».
      descongeladas: descongeladas.length > 0
        ? { fechas: descongeladas.length, sample: descongeladas.slice(0, 5) }
        : undefined,
    })
    for (const c of congeladas) congeladasGlobal.push({ property: r.property_id, ...c })
    for (const d of descongeladas) descongeladasGlobal.push({ property: r.property_id, ...d })
  }

  // 🧊 Aviso AGRUPADO de las fechas congeladas por «evento a ciegas», con dedupe de 7 días por
  // (piso, fecha) en la tabla `pricing_avisos` (2026-08-13_pricing_avisos.sql). El motor corre 3
  // veces al día y la congelación persiste hasta que la fecha se mida: sin dedupe serían 21
  // mensajes/semana por fecha y el canal acabaría ignorado (lección del guardián, 19/07). Es
  // informativo — la acción ya está tomada (no bajar) y la medición ya está pedida (cola de
  // Booking priorizada); no se le pide nada a Alberto.
  if (!dryRun && congeladasGlobal.length > 0) {
    try {
      const claves = congeladasGlobal.map(c =>
        Prisma.sql`(${`congelada:${c.property}:${c.fecha}`}, now())`)
      // INSERT … ON CONFLICT DO NOTHING + RETURNING: solo las claves NUEVAS (o caducadas y
      // purgadas) generan aviso. La purga de >7 días va delante para que una congelación LARGA
      // se recuerde una vez por semana, no una vez en la vida.
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM pricing_avisos WHERE enviado_at < now() - interval '7 days'`)
      const nuevas = await prisma.$queryRaw<{ clave: string }[]>(Prisma.sql`
        INSERT INTO pricing_avisos (clave, enviado_at) VALUES ${Prisma.join(claves)}
        ON CONFLICT (clave) DO NOTHING RETURNING clave`)
      if (nuevas.length > 0) {
        const nuevasSet = new Set(nuevas.map(n => n.clave))
        const lineas = congeladasGlobal
          .filter(c => nuevasSet.has(`congelada:${c.property}:${c.fecha}`))
          .slice(0, 10)
          .map(c => `• ${c.property.replace("prop_", "")} ${c.fecha}: ${eur(c.precio)} (evento x${c.factor})`)
        await tgAviso('pisos.pricing-aplicado', 
          `🧊 *Pricing: ${nuevas.length} noche(s) de evento congeladas (sin mercado fiable)*\n\n` +
          lineas.join("\n") +
          (nuevas.length > 10 ? `\n… y ${nuevas.length - 10} más` : "") +
          `\n\n_No bajan hasta que Booking mida esas fechas (ya priorizadas en la cola). Subir sí pueden._`,
        )
      }
    } catch { /* best-effort: la congelación en sí ya está aplicada y declarada en la respuesta */ }
  }

  // ⚠️ Aviso de los pisos que esta pasada NO ha tarificado. Dedupe por (piso, DÍA) sobre la misma
  // `pricing_avisos` que usan las congeladas: el motor corre 3 veces al día y un piso sin corpus lo
  // está las tres, así que sin dedupe serían 3 mensajes iguales; con él, uno al día mientras dure.
  // El aviso NO marca `ok:false`: los demás pisos sí se tarificaron y el vigía de latidos debe
  // seguir reservado para lo que invalida la pasada entera.
  const avisoSinTarifar = avisoPisosSinTarifar(sinTarifar, MIN_SAMPLE, MAX_MARKET_AGE_DAYS)
  if (!dryRun && avisoSinTarifar) {
    try {
      const hoyClave = new Date().toISOString().slice(0, 10)
      const claves = sinTarifar.map(p => Prisma.sql`(${`sin-tarifar:${p.property}:${hoyClave}`}, now())`)
      const nuevas = await prisma.$queryRaw<{ clave: string }[]>(Prisma.sql`
        INSERT INTO pricing_avisos (clave, enviado_at) VALUES ${Prisma.join(claves)}
        ON CONFLICT (clave) DO NOTHING RETURNING clave`)
      if (nuevas.length > 0) await tgAviso('pisos.pricing-aplicado', avisoSinTarifar)
    } catch { /* best-effort: el hueco ya va declarado en la respuesta */ }
  }

  // 🛑 Smoobu ha rechazado la escritura de algún piso: el motor decidió y el canal no lo aceptó.
  // SIN dedupe a propósito, al revés que el aviso de `sin-tarifar`: aquel se repite las 3 pasadas
  // porque el corpus tarda un día en rehacerse, y un mensaje al día basta. Éste es una avería viva
  // del canal — si sigue rota a las 14:30 y a las 20:30, hay que oírlo las tres veces.
  const avisoRechazo = avisoSmoobuRechaza(fallosSmoobu)
  if (avisoRechazo) {
    try {
      await tgAviso('pisos.pricing-aplicado', avisoRechazo)
    } catch { /* best-effort: el fallo ya va en la respuesta y en el latido de apply-auto */ }
  }

  // 🚨 Si no se pudieron leer los eventos, esta pasada tarificó Semana Santa como un martes de
  // febrero. Hasta el 01/08/2026 eso salía como `ok:true` y nadie se enteraba nunca: el `.catch`
  // devolvía un mapa vacío, que es indistinguible de «no hay eventos». Ahora la pasada se declara
  // degradada Y avisa, porque es de las averías más caras que puede tener el motor.
  if (eventosIlegibles) {
    try {
      await tgAviso('pisos.pricing-aplicado', 
        "🚨 *Pricing: la tabla de eventos no se pudo leer*\n\n" +
        "La pasada ha tarificado SIN eventos: si hay Feria, Semana Santa o un concierto grande en la " +
        "ventana, esas noches se han calculado como días normales. Los precios aplicados en esta " +
        "pasada NO son de fiar para fechas de evento.\n\n" +
        "Revisa `pricing_eventos_auto` en Supabase y vuelve a lanzar el motor.",
      )
    } catch { /* el aviso es best-effort; el flag de la respuesta manda */ }
  }

  // Hermano del anterior, un escalón menos grave: sin la ocupación por mes el motor no tarifica MAL,
  // tarifica como antes del PR #1323 (la palanca de demanda vuelve a mirar el año). Los precios son
  // defendibles, pero más bajos en los meses que se están llenando — y sin este aviso, nadie lo
  // sabría. NO se marca `ok:false` a propósito: el vigía de latidos debe seguir reservado para lo
  // que invalida la pasada; un vigía que grita por lo que no toca acaba ignorándose.
  if (ocupacionMesIlegible) {
    try {
      await tgAviso('pisos.pricing-aplicado', 
        "⚠️ *Pricing: la ocupación POR MES no se pudo leer*\n\n" +
        "La pasada ha tarificado con la ocupación ANUAL del piso, como antes del arreglo del 09/08: " +
        "los meses que ya se están llenando no han recibido su subida. Los precios no son erróneos, " +
        "pero sí más bajos de lo que tocaba.\n\n" +
        "Revisa `rate_snapshots` en Supabase y vuelve a lanzar el motor.",
      )
    } catch { /* el aviso es best-effort; el flag de la respuesta manda */ }
  }

  // 🟠 Lecturas auxiliares caídas (hallazgo 4, 24/08/2026): la pasada tarificó con fallback y los
  // precios PARECEN bien — exactamente por eso hay que decirlo. Sin dedupe, como el rechazo de
  // Smoobu: si la lectura sigue caída a las 14:30 y a las 20:30, hay que oírlo las tres veces.
  const avisoLecturas = avisoLecturasCaidas(lecturasCaidas)
  if (avisoLecturas) {
    try {
      await tgAviso('pisos.pricing-aplicado', avisoLecturas)
    } catch { /* best-effort: el campo de la respuesta y el latido de apply-auto mandan */ }
  }

  return NextResponse.json({
    // 🛑 Un rechazo de Smoobu invalida la pasada: el precio no ha llegado al huésped, que es lo
    // único que este endpoint existe para conseguir. Hasta el 23/08/2026 esto salía `ok:true`.
    ok: !eventosIlegibles && fallosSmoobu.length === 0 && lecturasCaidas.length === 0,
    // Escrituras rechazadas por el canal, con las noches que se quedaron sin aplicar. Las lee
    // `apply-auto` para teñir su latido; van en la respuesta para que el camino manual las vea igual.
    smoobu_rechazos: fallosSmoobu.length > 0 ? fallosSmoobu : undefined,
    // Noches que SÍ entraron. Un 0 aquí es «nada cruzó el umbral del 3%», no «no corrió»: eso
    // último lo dice la AUSENCIA de latido, no este número.
    fechas_escritas: fechasEscritas,
    degradado: eventosIlegibles ? "pricing_eventos_auto ilegible: tarificado SIN eventos" : undefined,
    // Degradación menor: no invalida la pasada, pero tiene que verse sin tener que deducirlo.
    demanda_degradada: ocupacionMesIlegible ? "ocupación por mes ilegible: tarificado con la anual" : undefined,
    // Lecturas auxiliares que fallaron (hallazgo 4): la pasada tarificó con fallback, pero ciega a
    // estas señales. Lo lee `apply-auto` para teñir su latido, igual que `degradado`.
    lecturas_degradadas: resumenLecturasCaidas(lecturasCaidas) ?? undefined,
    // Pisos que esta pasada dejó sin tarificar. En la respuesta a propósito: sus precios se quedan
    // como estaban, y eso NO es «el mercado dice que están bien» — es «no se ha podido mirar».
    sin_tarifar: sinTarifar.length > 0 ? sinTarifar : undefined,
    // 🔓 Parte de la segunda llave de los congeladores. Sale a nivel de pasada, no solo por piso,
    // porque el día que se estrene va a mover cientos de noches a la vez y eso debe verse de un
    // vistazo (ver `lib/sivra/pricing-descongelar.ts`).
    descongeladas: detalleDescongeladas(descongeladasGlobal) ?? undefined,
    dryRun, paused, days, properties: recs.length, results,
  })
}
