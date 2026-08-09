import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { eventFactor, seasonalFloorFactor, PRICING_HORIZON_DAYS, EVENTS } from "@/lib/pricing-calendar"
import { combinarEventosDeFecha, type EventoBruto } from "@/lib/sivra/eventos-estado"
import { factorLastMinute } from "@/lib/sivra/pricing-lastminute"
import { premioMercadoFecha } from "@/lib/sivra/pricing-premio-mercado"
import { anclaMercadoFecha } from "@/lib/sivra/pricing-ancla-fecha"
import { factorDemandaFecha, type DemandaFechaResult } from "@/lib/sivra/pricing-demanda"
import { elegirBucket } from "@/lib/sivra/pricing-bucket-fuente"
import { aplicarPrior, indicesPrior, type IndicePrior, type MesHistorico } from "@/lib/sivra/prior-estacional"
import { getSmoobuKey } from "@/lib/smoobu"
import { tgSend } from "@central/core-telegram"
import { eur } from "@/lib/dinero"

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

// Suelo PriceLabs: fracción del último precio conocido de PL por debajo de la cual el motor NO
// escribe mientras PL siga conectado como referencia (hasta ~ago-2026). 0 = desactivado. El
// aviso del tripwire salta a <70%; el suelo (85%) deja holgura para que el motor cotice algo por
// debajo de PL cuando su propia señal lo justifique, pero corta el desplome a ~64% de las minas.
const PL_FLOOR_RATIO: number = 0.85
// Idea #1: la referencia PL persistida (`pricing_pl_referencia`) actúa como suelo hasta N días
// tras la última captura, para que SOBREVIVA a la cancelación de PL (~ago-2026). Pasado ese
// plazo caduca sola y el suelo queda inerte (el motor ya se apoya en las ideas #2/#4).
const PL_REF_MAX_AGE_DAYS = 120
// Idea #2: si el precio ACTUAL supera en +40% la base "normal" del mes/global, esa noche es
// especial (alguien/mercado/PL la subió). Lejos de la fecha NO la hundimos a ciegas por debajo
// del actual; cerca (≤N días) dejamos que el last-minute suavice. Funciona SIN PriceLabs.
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
    property_id: string; recommended_guest: number; med_guest_global: number; floor_guest: number; ceil_guest: number
    demand_factor: number; quality_factor: number
    occupancy_global: number; demand_baseline: number; demand_k: number
    channel_markup: number; max_change_pct: number; min_price: number | null; max_price: number | null
    sample_n: number; market_age_days: number; events_enabled: boolean; gap_discount_pct: number
    flight_demand_k: number; seasonal_floor_k: number; lastminute_k: number
  }[]>(Prisma.sql`
    WITH latest AS (
      SELECT scenario, MAX(search_date) sd FROM market_rates
      WHERE scenario LIKE 'prop_%' AND price_night > 0 GROUP BY scenario
    ),
    -- Cada comparable se NORMALIZA al aforo del piso (pricing_factor_aforo) antes de entrar en el
    -- percentil. Sin esto, una casa de 12 plazas se tarificaba contra apartamentos de 4-8 y salia
    -- a mitad de precio (hallazgo 31/07/2026). Con comps del mismo aforo el factor es 1: no cambia nada.
    -- OJO: esta consulta va en un template literal de TS, aqui NO se pueden usar backticks ni $ { }.
    mkt AS (
      SELECT m.scenario,
        percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests))::numeric med,
        percentile_cont(s.floor_pctl)  WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests))::numeric flo,
        percentile_cont(s.ceil_pctl)   WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests))::numeric cei,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY m.score)::numeric mkt_score,
        COUNT(*)::int AS sample_n,
        (CURRENT_DATE - MAX(l.sd))::int AS market_age_days
      FROM market_rates m JOIN latest l ON l.scenario = m.scenario AND l.sd = m.search_date
      JOIN pricing_settings s ON s.property_id = m.scenario
      LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
      WHERE m.price_night > 0
      GROUP BY m.scenario, s.target_pctl, s.floor_pctl, s.ceil_pctl
    ),
    occ AS (
      SELECT property_id scenario, (1 - AVG(available))::numeric occupancy
      FROM rate_snapshots WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND rate_date >= CURRENT_DATE AND available IS NOT NULL GROUP BY property_id
    )
    SELECT
      mkt.scenario AS property_id,
      ROUND(mkt.med
        * GREATEST(LEAST(1 + (COALESCE(occ.occupancy,0.5) - s.demand_baseline) * s.demand_k, 1.10), 0.92)
        * GREATEST(LEAST(1 + (s.own_score - mkt.mkt_score) * s.quality_k, 1.10), 0.90))::int AS recommended_guest,
      ROUND(mkt.med)::int AS med_guest_global,
      -- Los dos factores del ajuste, POR SEPARADO: el de demanda se gatea por fecha segun la
      -- antelacion real del piso (ver pricing-demanda.ts) y el de calidad aplica siempre.
      GREATEST(LEAST(1 + (COALESCE(occ.occupancy,0.5) - s.demand_baseline) * s.demand_k, 1.10), 0.92)::float8 AS demand_factor,
      GREATEST(LEAST(1 + (s.own_score - mkt.mkt_score) * s.quality_k, 1.10), 0.90)::float8 AS quality_factor,
      -- Los ingredientes del factor de demanda, en crudo: hacen falta para RECALCULARLO con la
      -- ocupacion del MES de cada fecha (ver pricing-demanda.ts). El de arriba, con la
      -- ocupacion anual, queda de fallback para los meses sin snapshot.
      COALESCE(occ.occupancy, 0.5)::float8 AS occupancy_global,
      s.demand_baseline::float8 AS demand_baseline,
      s.demand_k::float8 AS demand_k,
      ROUND(mkt.flo)::int AS floor_guest, ROUND(mkt.cei)::int AS ceil_guest,
      COALESCE(s.channel_markup, 1.16)::float8 AS channel_markup,
      s.max_change_pct::float8 AS max_change_pct,
      s.min_price, s.max_price,
      mkt.sample_n, mkt.market_age_days,
      COALESCE(s.events_enabled, true) AS events_enabled,
      COALESCE(s.gap_discount_pct, 0)::float8 AS gap_discount_pct,
      COALESCE(s.flight_demand_k, 0)::float8 AS flight_demand_k,
      COALESCE(s.seasonal_floor_k, 0)::float8 AS seasonal_floor_k,
      COALESCE(s.lastminute_k, 0)::float8 AS lastminute_k
    FROM mkt
    JOIN pricing_settings s ON s.property_id = mkt.scenario
    LEFT JOIN occ ON occ.scenario = mkt.scenario
    WHERE s.apply_enabled = true
      AND (${onlyProp}::text IS NULL OR mkt.scenario = ${onlyProp})
  `)

  if (recs.length === 0) {
    return NextResponse.json({ ok: true, dryRun, applied: 0, message: "Ningún piso con apply_enabled=true (o filtro sin match)" })
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
  /** factor que puede mover el PRECIO: solo eventos confirmados */
  const autoEv = new Map<string, number>()
  /** factor que protege el SUELO: confirmados + la parte prudente de los previstos */
  const autoEvSuelo = new Map<string, number>()
  for (const [fecha, lista] of porFecha) {
    // Los previstos LEJANOS suben el precio ponderado por confianza (v2, decisión de Alberto
    // 09/08/2026); cerca de la fecha vuelven a solo-suelo. El contexto de distancia va aquí.
    const diasVista = Math.round((new Date(fecha).getTime() - today.getTime()) / 86400000)
    const ef = combinarEventosDeFecha(lista, { diasVista })
    if (ef.factorPrecio > 1) autoEv.set(fecha, ef.factorPrecio)
    if (ef.factorSuelo > 1) autoEvSuelo.set(fecha, ef.factorSuelo)
  }

  // Señal de demanda por vuelos a SVQ (Fase 3). Solo influye si flight_demand_k>0 por piso.
  const flightRows = await prisma.$queryRaw<{ rate_date: string; demand_index: number }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, demand_index::float8 AS demand_index
    FROM pricing_flight_demand WHERE rate_date >= CURRENT_DATE
  `).catch(() => [])
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
  `).catch(() => [])
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
  `).catch(() => [])
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
  `).catch(() => [])
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
      WHERE m.price_night > 0 AND m.scenario LIKE 'prop_%'
        AND m.checkin_date >= CURRENT_DATE
        AND m.search_date >= CURRENT_DATE - 120
        AND NOT m.corpus_clonado   -- mismo motivo que en el bucket del mes
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
  `).catch(() => [])
  const fecha = new Map<string, Map<string, { med: number; n: number; fuente: 'fiable' | 'mixto' }>>()
  for (const f of fechaRows) {
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
  `).catch(() => [])
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

  // ─── Velocidad de conversión por mes (17/07/2026, OK de Alberto) ───────────────────────
  // Si un mes futuro acumula ≥2 reservas entradas en los últimos 7 días, el precio está corto
  // (lección oct-26: 2 reservas en 4 días, una con el neto en el suelo). El objetivo de ese mes
  // sube un escalón automático; si la demanda para, la ventana de 7 días vacía el boost sola.
  const velRows = await prisma.$queryRaw<{ pid: string; ym: string; n: number }[]>(Prisma.sql`
    SELECT "propertyId" AS pid, to_char("checkIn", 'YYYY-MM') AS ym, COUNT(*)::int AS n
    FROM incomes
    WHERE "createdAt" >= CURRENT_DATE - 7 AND "checkIn" >= CURRENT_DATE
    GROUP BY 1, 2
  `).catch(() => [])
  const velocidad = new Map<string, Map<string, number>>()
  for (const v of velRows) {
    if (!velocidad.has(v.pid)) velocidad.set(v.pid, new Map())
    velocidad.get(v.pid)!.set(v.ym, Number(v.n))
  }

  // PriceLabs como referencia por FECHA, que el motor —anclado al mercado por MES— no reproduce en
  // las noches especiales (puente del Pilar, Todos los Santos, Feria, Karol G). Idea #1: en vez de
  // leer solo la última foto viva (que muere al cancelar PL), PERSISTIMOS su curva en
  // `pricing_pl_referencia` (upsert de la foto más reciente) para que sobreviva a la cancelación
  // (~ago-2026): el suelo sigue anclado a la última curva conocida hasta PL_REF_MAX_AGE_DAYS.
  // Usos del dato: (1) SUELO PL_FLOOR_RATIO×PL en el bucle; (2) tripwire de aviso a <70%.
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_pl_referencia (property_id, rate_date, pl_price, captured_at)
      SELECT property_id, rate_date, price_pricelabs::int, snapshot_date
      FROM rate_snapshots
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND snapshot_date >= CURRENT_DATE - 14
        AND rate_date >= CURRENT_DATE AND price_pricelabs > 0
      ON CONFLICT (property_id, rate_date) DO UPDATE
        SET pl_price = EXCLUDED.pl_price, captured_at = EXCLUDED.captured_at
        WHERE pricing_pl_referencia.captured_at <= EXCLUDED.captured_at`)
  } catch { /* sin tabla o sin foto fresca: el suelo simplemente queda inerte */ }
  const plRows = await prisma.$queryRaw<{ pid: string; rate_date: string; pl: number }[]>(Prisma.sql`
    SELECT property_id AS pid, rate_date::text AS rate_date, pl_price::float8 AS pl
    FROM pricing_pl_referencia
    WHERE rate_date >= CURRENT_DATE AND pl_price > 0
      AND captured_at >= CURRENT_DATE - ${PL_REF_MAX_AGE_DAYS}
  `).catch(() => [])
  const plPrice = new Map(plRows.map(x => [`${x.pid}|${x.rate_date}`, Number(x.pl)]))
  const plAvisos: string[] = []

  // ⏱️ Raíl por DÍA de verdad (fix auditoría 18/07/2026): `max_change_pct` está documentado como
  // tope "±/día", pero anclado al precio de la PASADA anterior con 3 crons/día era ±73%/día real
  // (1,2³) — la V de Karol G: 326→112 y 112→701 en pocos días, con reservas cazando los valles
  // (344€ una noche de mercado ~930€). Referencia del raíl = último precio aplicado ANTES de hoy;
  // las pasadas 2ª/3ª del día se mueven dentro del MISMO rango diario. Los saltos legítimos al
  // alza (evento de calendario, suelo PL, suelo estacional) siguen saltando el raíl como antes.
  const ref24Rows = await prisma.$queryRaw<{ pid: string; rate_date: string; p: number }[]>(Prisma.sql`
    SELECT DISTINCT ON (property_id, rate_date)
      property_id AS pid, rate_date::text AS rate_date, new_price AS p
    FROM pricing_applied
    WHERE dry_run = false AND rate_date >= CURRENT_DATE
      AND applied_at < CURRENT_DATE AND applied_at >= CURRENT_DATE - 7
    ORDER BY property_id, rate_date, applied_at DESC
  `).catch(() => [])
  const ref24 = new Map(ref24Rows.map(x => [`${x.pid}|${x.rate_date}`, Number(x.p)]))

  const results: any[] = []

  for (const r of recs) {
    const smoobuId = SMOOBU_ID[r.property_id]
    if (!smoobuId) { results.push({ property: r.property_id, error: "sin smoobuId" }); continue }

    if (!dryRun && (r.sample_n < MIN_SAMPLE || r.market_age_days > MAX_MARKET_AGE_DAYS)) {
      results.push({
        property: r.property_id, skipped: "datos_insuficientes",
        sample_n: r.sample_n, market_age_days: r.market_age_days,
        detail: `Necesita ≥${MIN_SAMPLE} comparables y mercado ≤${MAX_MARKET_AGE_DAYS}d`,
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

    // 🚨 `>= 1`, no `> 1`: el escaparate de Booking NO añade recargo sobre el precio de Smoobu
    // (medido 09/08/2026: 20 reservas con bruto/listado 0,66-1,08 y la del 06/11 a factor 1,004
    // exacto — el ÷1,16 era un −14% sistemático). Con la guarda vieja, poner 1.0 en settings se
    // ignoraba en silencio y caía al default.
    const markup = Number(r.channel_markup) >= 1 ? Number(r.channel_markup) : 1.16
    const demandFactor = Number(r.demand_factor) > 0 ? Number(r.demand_factor) : 1
    const qualityFactor = Number(r.quality_factor) > 0 ? Number(r.quality_factor) : 1
    const baseTargetGlobal = Math.round(r.recommended_guest / markup)
    const floorBaseGlobal = Math.round(r.floor_guest / markup)
    const ceilBaseGlobal = Math.round(r.ceil_guest / markup)
    const mesProp = mes.get(r.property_id)
    const fechaProp = fecha.get(r.property_id)

    // De dónde salió la ocupación que movió la palanca en cada fecha, y cuántas fechas se libraron
    // del descuento por no haber abierto aún su venta. Va al informe para poder distinguir «bajó
    // porque el mes está flojo» de «no se tocó porque todavía no se vende».
    const demFuentes: Record<DemandaFechaResult["fuente"], number> = { mes: 0, global: 0 }
    let demGateadas = 0
    const ops: { dates: string[]; daily_price: number; min_length_of_stay?: number }[] = []
    const audit: { rate_date: string; old_price: number | null; new_price: number }[] = []
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
      const baseGlobalD = Math.round((r.med_guest_global * dqDate) / markup)
      // El bucket del mes solo vale si hay comps SUFICIENTES y de VARIAS fechas: 10 anuncios del mismo
      // dia describen ese dia, no el mes (lección de junio 2027, ver la nota de la consulta).
      const useMonth = !!mb && mb.n >= MIN_BUCKET && mb.fechas >= MIN_FECHAS_MES
      const baseD = useMonth ? Math.round((mb!.med * dqDate) / markup) : baseGlobalD
      const floorD = useMonth ? Math.round(mb!.flo / markup) : floorBaseGlobal
      const ceilD = useMonth ? Math.round(mb!.cei / markup) : ceilBaseGlobal
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
          //   si no                             → global×ev (comportamiento pre-#985).
          // En ambos casos compite por MAX con el target del mes (que tampoco se multiplica).
          const fb = fechaProp?.get(date)
          const useFecha = !!fb && fb.n >= MIN_FECHA_BUCKET
          const globalEvent = Math.round(clamp(baseGlobalD, floorBaseGlobal, ceilBaseGlobal) * ev)
          const bestEvent = useFecha
            ? Math.max(globalEvent, Math.round((fb!.med * dqDate) / markup))
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
            { medFechaGuest: fbMkt.med, comps: fbMkt.n, normalBase, markup, dqFactor: dqDate },
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
      {
        const fbA = fechaProp?.get(date)
        if (fbA) {
          const ancla = anclaMercadoFecha({
            medFechaGuest: fbA.med, comps: fbA.n, fuente: fbA.fuente, markup, dqFactor: dqDate,
          })
          if (ancla > target) target = ancla
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

      if (old != null) {
        // Ancla del raíl = precio de AYER (ref24), no el de la pasada anterior de HOY: así el
        // tope ±max_change_pct es por DÍA aunque el cron corra 3 veces al día. Sin histórico
        // (fecha nueva/nunca escrita) el ancla es el precio actual, como siempre.
        const ancla = ref24.get(`${r.property_id}|${date}`) ?? old
        const lo = Math.round(ancla * (1 - Number(r.max_change_pct)))
        const hi = Math.round(ancla * (1 + Number(r.max_change_pct)))
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
      // 🛡️ Suelo PriceLabs (raíl, no solo aviso): mientras PL siga conectado, NO deshacer sus
      // precios altos por debajo de PL_FLOOR_RATIO×PL. Las noches-mina (puente del Pilar, Todos
      // los Santos, Feria, Karol G) valen mucho más que el bucket del MES —que las promedia— y su
      // premio de evento se ancla a la base global baja, así que el objetivo se queda muy por
      // debajo y el raíl ±%/día va hundiendo el precio (392→314→… a 0,64×PL en oct-26). PL tiene
      // resolución por fecha y sí las ve. Solo SUBE (nunca baja), respeta el techo del propietario,
      // y se auto-jubila: al cancelar PL el snapshot caduca (>14d) y plPrice queda vacío → inerte.
      // Actúa CON o SIN bucket del mes (a diferencia de la guarda Karol G, solo !useMonth): el
      // fallo del Pilar ocurrió teniendo bucket de octubre.
      if (PL_FLOOR_RATIO > 0) {
        const plRef = plPrice.get(`${r.property_id}|${date}`)
        if (plRef && plRef > 0) {
          let plFloor = Math.round(plRef * PL_FLOOR_RATIO)
          if (r.max_price != null) plFloor = Math.min(plFloor, r.max_price)
          if (plFloor > target) target = plFloor
        }
      }
      if (r.max_price != null) target = Math.min(target, r.max_price)
      // Guarda de evento fuerte (lección Karol G, 15/07/2026): con factor ≥2 y SIN mercado del
      // mes (fallback global), el precio NUNCA baja — el bucket global (dominado por temporada
      // media/baja) arrastraría la noche de evento hacia abajo (788→283 en jun-2027) y el factor
      // solo multiplica esa base hundida. Se CONGELA el precio actual hasta tener comps del mes.
      // Excepción: si el techo del propietario (max_price) exige bajar, manda el techo.
      if (evFactor >= 2 && !useMonth && old != null && target < old
          && (r.max_price == null || old <= r.max_price)) continue
      // Idea #2 — guarda de outlier por precio ACTUAL (funciona SIN PriceLabs, es la red para
      // cuando PL se cancele): si el precio de hoy supera en +40% la base normal del mes/global,
      // esa noche es especial (un puente/evento que el bucket del mes no ve). Lejos de la fecha
      // (>N días) NO la hundimos por debajo del actual a ciegas; cerca dejamos que el last-minute
      // suavice. El techo del propietario manda (si max_price obliga a bajar, no congelamos).
      if (old != null && normalBase > 0 && old > normalBase * OUTLIER_RATIO
          && target < old && daysOut > OUTLIER_HORIZON_DAYS
          && (r.max_price == null || old <= r.max_price)) continue
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
      audit.push({ rate_date: date, old_price: old, new_price: target })
      const pl = plPrice.get(`${r.property_id}|${date}`)
      if (!dryRun && pl && target < pl * 0.7) {
        plAvisos.push(`${r.property_id.replace("prop_", "")} ${date}: ${eur(target)} vs PL ${eur(Math.round(pl))}`)
      }
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
        if (!res.ok) results.push({ property: r.property_id, error: `Smoobu POST ${res.status}` })
      } catch (e) {
        results.push({ property: r.property_id, error: `Smoobu POST ${String(e).slice(0, 80)}` })
      }
    }

    if (audit.length > 0) {
      try {
        const auditRows = audit.map(a =>
          Prisma.sql`(${r.property_id}, ${a.rate_date}::date, ${a.old_price}::int, ${a.new_price}::int, ${dryRun})`)
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO pricing_applied (property_id, rate_date, old_price, new_price, dry_run)
          VALUES ${Prisma.join(auditRows)}`)
      } catch { /* no crítico */ }
    }

    results.push({
      property: r.property_id,
      recommended_guest: r.recommended_guest, base_target: baseTargetGlobal,
      meses_con_mercado: mesProp ? [...mesProp.entries()].filter(([, v]) => v.n >= MIN_BUCKET && v.fechas >= MIN_FECHAS_MES).map(([k]) => k) : [],
      // De QUÉ corpus sale el bucket de cada mes elegible. Un objetivo que no dice su procedencia es
      // indistinguible de uno medido: `mixto` avisa de que ahí todavía pesa el precio de anuncio.
      meses_bucket_fuente: mesProp
        ? Object.fromEntries([...mesProp.entries()]
            .filter(([, v]) => v.n >= MIN_BUCKET && v.fechas >= MIN_FECHAS_MES)
            .map(([k, v]) => [k, v.fuente]))
        : {},
      meses_calientes: [...(velocidad.get(r.property_id)?.entries() ?? [])].filter(([, n]) => n >= 2).map(([k, n]) => `${k}:${n}`),
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
    })
  }

  if (plAvisos.length > 0) {
    try {
      await tgSend(
        `⚠️ Pricing: ${plAvisos.length} fecha(s) escritas por debajo del 70% de PriceLabs\n` +
        plAvisos.slice(0, 8).join("\n") +
        (plAvisos.length > 8 ? `\n… y ${plAvisos.length - 8} más` : ""),
      )
    } catch { /* no crítico */ }
  }

  // 🚨 Si no se pudieron leer los eventos, esta pasada tarificó Semana Santa como un martes de
  // febrero. Hasta el 01/08/2026 eso salía como `ok:true` y nadie se enteraba nunca: el `.catch`
  // devolvía un mapa vacío, que es indistinguible de «no hay eventos». Ahora la pasada se declara
  // degradada Y avisa, porque es de las averías más caras que puede tener el motor.
  if (eventosIlegibles) {
    try {
      await tgSend(
        "🚨 *Pricing: la tabla de eventos no se pudo leer*\n\n" +
        "La pasada ha tarificado SIN eventos: si hay Feria, Semana Santa o un concierto grande en la " +
        "ventana, esas noches se han calculado como días normales. Los precios aplicados en esta " +
        "pasada NO son de fiar para fechas de evento.\n\n" +
        "Revisa `pricing_eventos_auto` en Supabase y vuelve a lanzar el motor.",
      )
    } catch { /* el aviso es best-effort; el flag de la respuesta manda */ }
  }

  return NextResponse.json({
    ok: !eventosIlegibles,
    degradado: eventosIlegibles ? "pricing_eventos_auto ilegible: tarificado SIN eventos" : undefined,
    dryRun, paused, days, properties: recs.length, results, pl_avisos: plAvisos.length,
  })
}
