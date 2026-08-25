import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { tgAlert } from "@/lib/telegram"
import { decidirSubMercado, decidirReservaBaja } from "@/lib/sivra/pricing-guardia"
import {
  decidirEventoSinRespaldo, decidirEventoNoCatalogado, decidirPrecioPorPlaza,
  decidirCompsDeOtroAforo,
} from "@/lib/sivra/pricing-centinelas"
import { eventFactor } from "@/lib/pricing-calendar"
import { MIN_EUR_PLAZA_COMP } from "@/lib/sivra/pricing-comps-plausibles"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import {
  clasificarNoche, reservaDesdeSmoobu, agruparRangos, ventanaConsulta,
  type NocheClasificada,
} from "@/lib/sivra/noches-sin-income"
import { listarReservasVentana, runSync } from "@/lib/sivra/smoobu-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/pricing/guard
//
// Red de seguridad "no puede fallar". Corre tras el snapshot diario (cron 07:30) y AVISA A ALBERTO
// POR TELEGRAM (antes solo dejaba las alertas en la tabla y nadie se enteraba — por eso una reserva
// de Luxury entró a ~110€ con el mercado a ~185€ sin que saltara nada, 20/07/2026).
//
// Chequeos:
//   #1 Reversión: el precio BASE en Smoobu ya no coincide con lo último que aplicó el motor → algo
//      lo pisó (una edición a mano en Smoobu, otra integración…). PriceLabs, que era el
//      sospechoso habitual, está de baja desde el 09/08/2026: ya no puede ser la causa.
//   #3 Suelo de coste: el motor fija el mínimo en ≥3 fechas → margen justo.
//   #4 Sub-mercado (NUEVO): el precio VIVO del piso va sistemáticamente por debajo de su MERCADO REAL
//      por piso (`market_rates.scenario = property_id`, datos de conector), casando fecha a fecha.
//      Ojo: NO se compara contra el escenario 'normal' (Serper, barato) — ese era el fallo que dejaba
//      a Luxury "aparentemente bien" a 128€ cuando su mercado real era ~185€.
//   #5 Reserva por debajo de mercado (NUEVO): una reserva recién entrada con ADR bruto muy por debajo
//      del p50 real del piso PARA SU FECHA (no el blended de todas las fechas — así una reserva de
//      evento cara "en absoluto" pero barata para su día, p.ej. Karol G, se detecta; ver #5 abajo).
//   #6 €/plaza (31/07): un piso GRANDE vendiéndose a precio de hostal por persona. Vino de Alberto
//      ("Socorro son 12 plazas, a 165€ salen 13,75€ por persona"): el total engaña, el reparto no.
//   #7 Evento declarado que el mercado NO respalda (31/07): la Feria de Abril 2027 llevaba meses en
//      el calendario con las fechas de OTRA semana y nadie lo vio. Ahora el mercado lo desmiente solo.
//   #8 Mercado disparado SIN evento catalogado (31/07): el espejo del #7 — busca lo que NO sabemos
//      (septiembre 2026, con la Bienal dentro, no tenía un solo evento en ninguna de las dos fuentes).
//   #9 Comps de OTRO aforo (01/08): el mercado de un piso leído de pisos de otro tamaño. Lo levantó
//      Alberto ("House Sevillana aún está como dúplex"): los 30 comps vivos de una casa de 12 plazas
//      eran apartamentos de 8. El ancla no era falsa, era EXTRAPOLADA — y nada lo decía.
//   #10 Noche bloqueada SIN income (24/08): el calendario dice «vendida» y ningún income la cubre.
//      Vino de Busto Feria 2027: una reserva Airbnb que el sync incremental se saltó estuvo TRES
//      ciclos como misterio. Contrasta contra Smoobu en vivo, REPARA re-lanzando el sync sobre la
//      ventana de llegada, y solo avisa de lo que de verdad es un fallo (una reserva sin sync o una
//      noche que nada explica) — un bloqueo manual del dueño es normal y no suena.
//
// ⚠️ #4 y #5 comparan contra el mercado NORMALIZADO por aforo (`pricing_factor_aforo`), igual que el
// motor. Iban sin normalizar hasta el 01/08/2026, así que en el único piso donde importaba —House,
// 12 plazas con comps de 8— medían contra un mercado un 36% más barato y no podían disparar.
// Crea alertas en pricing_alerts (dedup: no recrea mientras el mismo aviso siga abierto) y manda UN
// Telegram con lo nuevo sin avisar (avisado_at).
//
// Los tres centinelas nuevos viven en `lib/sivra/pricing-centinelas.ts` (puros, testeados) y comparten
// una regla: cuando no hay muestra devuelven "no evaluado", NUNCA un "todo bien" — que es lo que dejó
// pasar los tres fallos de arriba durante meses.

const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

const SUB_UMBRAL = 0.80 // el vivo por debajo del 80% del p50 de mercado de ese día cuenta como "por debajo"

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  // #1 Reversiones: último precio real aplicado por (piso, fecha) vs base actual de Smoobu.
  const reversions = await prisma.$queryRaw<{
    property_id: string; rate_date: string; new_price: number; base_now: number
  }[]>(Prisma.sql`
    WITH last_applied AS (
      SELECT DISTINCT ON (property_id, rate_date)
        property_id, rate_date, new_price
      FROM pricing_applied
      WHERE dry_run = false
      ORDER BY property_id, rate_date, applied_at DESC
    ),
    snap AS (
      SELECT property_id, rate_date, price_live
      FROM rate_snapshots
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND price_live IS NOT NULL
    )
    SELECT la.property_id, la.rate_date::text, la.new_price, snap.price_live AS base_now
    FROM last_applied la
    JOIN snap USING (property_id, rate_date)
    WHERE la.rate_date >= CURRENT_DATE
      AND snap.price_live <> la.new_price
    ORDER BY la.property_id, la.rate_date
  `)

  // #3 Suelo de coste: pisos con ≥3 fechas futuras aplicadas al mínimo.
  const floorHits = await prisma.$queryRaw<{ property_id: string; dias: number; min_price: number }[]>(Prisma.sql`
    WITH last_applied AS (
      SELECT DISTINCT ON (property_id, rate_date) property_id, rate_date, new_price
      FROM pricing_applied WHERE dry_run = false
      ORDER BY property_id, rate_date, applied_at DESC
    )
    SELECT la.property_id, COUNT(*)::int AS dias, s.min_price
    FROM last_applied la
    JOIN pricing_settings s ON s.property_id = la.property_id
    WHERE la.rate_date >= CURRENT_DATE AND s.min_price IS NOT NULL AND la.new_price = s.min_price
    GROUP BY la.property_id, s.min_price
    HAVING COUNT(*) >= 3
  `)

  // Pisos habilitados (donde el motor escribe de verdad): son los que vigilamos para sub-mercado.
  const enabled = await prisma.$queryRaw<{ property_id: string }[]>(Prisma.sql`
    SELECT property_id FROM pricing_settings WHERE COALESCE(apply_enabled, false) = true`)

  // #4 Sub-mercado: por cada piso habilitado, casa el precio vivo (rate_snapshots) con el mercado
  // real por piso (market_rates.scenario = property_id) FECHA A FECHA y mira cuántas van por debajo.
  type SubHit = { property_id: string; matched: number; sub: number; avg_live: number; avg_p50: number; diffPct: number }
  const subHits: SubHit[] = []
  for (const { property_id } of enabled) {
    const rows = await prisma.$queryRaw<{ matched: number; sub: number; avg_live: number; avg_p50: number }[]>(Prisma.sql`
      WITH mkt AS (
        -- price_night NORMALIZADO al aforo del piso, igual que hace el motor en apply/route.ts.
        -- Sin esto el guardian comparaba el precio vivo de una casa de 12 plazas contra comps de 8
        -- (01/08/2026: p50 de 314€ en vez de ~490€), asi que House salia "por encima de mercado"
        -- justo cuando estaba por debajo: el centinela de sub-mercado no podia disparar nunca.
        SELECT m.checkin_date,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests)) AS p50,
               COUNT(*) AS n
        FROM market_rates m
        LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
        WHERE m.scenario = ${property_id}
          AND m.search_date >= CURRENT_DATE - INTERVAL '21 days'
          AND m.price_night > 0
          -- Plausibilidad €/plaza, igual que el motor (17/08/2026): una habitación vestida de piso
          -- entero no es mercado (ver pricing-comps-plausibles.ts). El guardián filtra LO MISMO que
          -- el apply o su silencio no vale nada (lección del 01/08 con la normalización por aforo).
          AND (m.guests IS NULL OR m.guests <= 0 OR m.price_night >= ${MIN_EUR_PLAZA_COMP} * m.guests)
        GROUP BY m.checkin_date
        HAVING COUNT(*) >= 8
      ),
      live AS (
        SELECT rate_date, price_live AS live
        FROM rate_snapshots
        WHERE property_id = ${property_id}
          AND snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots WHERE property_id = ${property_id})
          AND available = 1 AND price_live IS NOT NULL
          AND rate_date >= CURRENT_DATE
      )
      SELECT COUNT(*)::int AS matched,
             COUNT(*) FILTER (WHERE live.live < ${SUB_UMBRAL} * mkt.p50)::int AS sub,
             COALESCE(AVG(live.live), 0)::float8 AS avg_live,
             COALESCE(AVG(mkt.p50), 0)::float8 AS avg_p50
      FROM live JOIN mkt ON mkt.checkin_date = live.rate_date
    `)
    const r = rows[0]
    if (!r) continue
    const d = decidirSubMercado({ datesMatched: Number(r.matched), datesSub: Number(r.sub), avgLive: Number(r.avg_live), avgP50: Number(r.avg_p50) })
    if (d.alerta) subHits.push({ property_id, matched: Number(r.matched), sub: Number(r.sub), avg_live: Number(r.avg_live), avg_p50: Number(r.avg_p50), diffPct: d.diffPct })
  }

  // #5 Reservas recién entradas (≤2 días) para fechas futuras con ADR bruto muy por debajo del mercado.
  // Se compara contra el p50 de mercado de LA FECHA EXACTA de la reserva (`mkt_date`, ≥8 comps, igual bar
  // que #4) y solo si esa fecha no tiene comps se cae al p50 BLENDED del piso (`mkt_blend`, todas las
  // fechas). Motivo (22/07/2026): el blended aplanaba a ~186€ TODAS las fechas, así que una reserva de
  // Karol G a 344€ (mercado real de ESE día ~931€) salía "por encima del mercado" y NO se detectaba, y
  // la de Feria a 140€ (mercado ~424€) se quedaba a 0,3% del umbral. Con p50 por fecha ambas disparan.
  const nuevasReservas = await prisma.$queryRaw<{
    property_id: string; guest: string; checkin: string; nights: number; adr: number; p50: number; comps: number; date_specific: boolean
  }[]>(Prisma.sql`
    -- Los dos p50 van NORMALIZADOS por aforo (misma razon que en #4): el ADR de una reserva se
    -- compara contra el mercado del piso que se reservo, no contra el de uno mas pequeno.
    WITH mkt_blend AS (
      SELECT m.scenario,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests)) AS p50,
             COUNT(*) AS comps
      FROM market_rates m
      LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
      WHERE m.search_date >= CURRENT_DATE - INTERVAL '21 days'
        AND m.price_night > 0 AND m.scenario LIKE 'prop_%'
        AND (m.guests IS NULL OR m.guests <= 0 OR m.price_night >= ${MIN_EUR_PLAZA_COMP} * m.guests)
      GROUP BY m.scenario
    ),
    mkt_date AS (
      SELECT m.scenario, m.checkin_date,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests)) AS p50,
             COUNT(*) AS comps
      FROM market_rates m
      LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
      WHERE m.search_date >= CURRENT_DATE - INTERVAL '21 days'
        AND m.price_night > 0 AND m.scenario LIKE 'prop_%'
        AND (m.guests IS NULL OR m.guests <= 0 OR m.price_night >= ${MIN_EUR_PLAZA_COMP} * m.guests)
      GROUP BY m.scenario, m.checkin_date
      HAVING COUNT(*) >= 8
    )
    SELECT i."propertyId" AS property_id, COALESCE(i."guestName", '') AS guest,
           i."checkIn"::date::text AS checkin, i.nights::int AS nights,
           (i.amount_gross / NULLIF(i.nights, 0))::float8 AS adr,
           COALESCE(md.p50, mb.p50)::float8 AS p50,
           COALESCE(md.comps, mb.comps)::int AS comps,
           (md.p50 IS NOT NULL) AS date_specific
    FROM incomes i
    JOIN mkt_blend mb ON mb.scenario = i."propertyId"
    LEFT JOIN mkt_date md ON md.scenario = i."propertyId" AND md.checkin_date = i."checkIn"::date
    WHERE i."createdAt" >= now() - INTERVAL '2 days'
      AND i."checkIn"::date >= CURRENT_DATE
      AND i.amount_gross > 0 AND i.nights > 0
  `)
  const reservasBajas = nuevasReservas
    .map(r => ({
      ...r,
      ev: decidirReservaBaja(
        { adr: Number(r.adr), marketP50: Number(r.p50), comps: Number(r.comps) },
        // El p50 por fecha exacta ya exige ≥8 comps (mismo bar que #4); al blended, que agrega muchas
        // fechas, le mantenemos el mínimo alto por defecto (25) para no fiarnos de una muestra floja.
        { minComps: r.date_specific ? 8 : 25 },
      ),
    }))
    .filter(r => r.ev.alerta)

  // #6 €/plaza: precio VIVO más barato de cada piso repartido entre sus plazas. Solo se juzgan los
  // pisos grandes (el centinela descarta solo los pequeños: ver la nota de pricing-centinelas.ts).
  // OJO: SQL dentro de un template literal de TS — aquí NO se pueden usar backticks ni $ { }.
  const porPlaza = await prisma.$queryRaw<{
    property_id: string; plazas: number | null; min_price: number | null
    vivo: number | null; fecha: string | null
  }[]>(Prisma.sql`
    WITH ult AS (
      SELECT property_id, MAX(snapshot_date) AS sd FROM rate_snapshots GROUP BY property_id
    ),
    barato AS (
      SELECT DISTINCT ON (r.property_id)
        r.property_id, r.price_live::float8 AS vivo, r.rate_date::text AS fecha
      FROM rate_snapshots r
      JOIN ult ON ult.property_id = r.property_id AND ult.sd = r.snapshot_date
      WHERE r.rate_date >= CURRENT_DATE AND r.available = 1 AND r.price_live IS NOT NULL
      ORDER BY r.property_id, r.price_live ASC, r.rate_date
    )
    SELECT s.property_id, z.max_guests::int AS plazas, s.min_price::float8 AS min_price,
           b.vivo, b.fecha
    FROM pricing_settings s
    LEFT JOIN pricing_piso_zona z ON z.property_id = s.property_id
    LEFT JOIN barato b ON b.property_id = s.property_id
  `).catch(() => [])

  const plazaHits = porPlaza
    .map(p => ({
      ...p,
      vivoEv: decidirPrecioPorPlaza({ precio: Number(p.vivo ?? 0), plazas: p.plazas }),
      sueloEv: decidirPrecioPorPlaza({ precio: Number(p.min_price ?? 0), plazas: p.plazas }),
    }))
    .filter(p => p.vivoEv.alerta || p.sueloEv.alerta)

  // #9 Comps de OTRO aforo (01/08/2026). Los dos arreglos de arriba —barrido por aforo real y
  // normalización— hacen lo correcto y ninguno avisa de que TODOS los comps de un piso sean de otro
  // tamaño: el ancla deja de estar medida y pasa a estar extrapolada, sin que se note. Se mira SOLO
  // la búsqueda más reciente de cada piso, que es la que manda en el motor.
  const aforoComps = await prisma.$queryRaw<{
    property_id: string; plazas: number | null; guests: number; n: number
  }[]>(Prisma.sql`
    WITH latest AS (
      SELECT scenario, MAX(search_date) AS sd
      FROM market_rates
      WHERE scenario LIKE 'prop_%' AND price_night > 0
      GROUP BY scenario
    )
    SELECT m.scenario AS property_id, z.max_guests::int AS plazas,
           m.guests::int AS guests, COUNT(*)::int AS n
    FROM market_rates m
    JOIN latest l ON l.scenario = m.scenario AND l.sd = m.search_date
    LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
    WHERE m.price_night > 0
      -- Sin este filtro, una habitación etiquetada guests=12 contaría como "comp del aforo propio"
      -- y taparía justo la extrapolación que este centinela vigila.
      AND (m.guests IS NULL OR m.guests <= 0 OR m.price_night >= ${MIN_EUR_PLAZA_COMP} * m.guests)
    GROUP BY m.scenario, z.max_guests, m.guests
  `).catch(() => [])

  const compsPorPiso = new Map<string, { plazas: number | null; comps: { plazas: number; n: number }[] }>()
  for (const r of aforoComps) {
    const e = compsPorPiso.get(r.property_id) ?? { plazas: r.plazas, comps: [] }
    e.comps.push({ plazas: Number(r.guests), n: Number(r.n) })
    compsPorPiso.set(r.property_id, e)
  }
  const aforoHits = [...compsPorPiso.entries()]
    .map(([property_id, e]) => ({
      property_id,
      plazas: e.plazas,
      ev: decidirCompsDeOtroAforo({ plazasPiso: e.plazas, comps: e.comps }),
    }))
    .filter(a => a.ev.alerta)

  // #10 Noche bloqueada SIN income (24/08/2026). El calendario dice «no disponible» y ningún
  // income cubre la noche. Caso fundacional: Busto 15-17 abr 2027 (Feria) — una reserva de Airbnb
  // que el sync incremental se saltó estuvo TRES ciclos del agente apareciendo «vendida a 103€ sin
  // income», sin que nada avisara. El check contrasta contra Smoobu EN VIVO (solo si hay noches que
  // explicar — los días normales no pagan la llamada) y clasifica: reserva viva sin income →
  // REPARA re-lanzando runSync sobre la ventana de llegada + alerta alta · bloqueo manual del dueño
  // → normal, sin alerta · solo una cancelación → el calendario se refresca solo · nada → alerta
  // media (bloqueo a nivel de tarifa u otra cosa: a mirar).
  // 🚨 La cobertura compara "checkIn"::date, no el timestamptz: hay incomes con checkIn a las
  // 12:00 UTC y sin el cast la noche del propio check-in sale como «sin income» (falsos positivos
  // medidos el 24/08: 4 noches con reserva real).
  let fantasmasIlegibles: string | null = null
  const fantasmas = await prisma.$queryRaw<{ property_id: string; rate_date: string }[]>(Prisma.sql`
    WITH ult AS (
      SELECT property_id, MAX(snapshot_date) AS sd FROM rate_snapshots GROUP BY property_id
    )
    SELECT r.property_id, r.rate_date::text
    FROM rate_snapshots r
    JOIN ult u ON u.property_id = r.property_id AND u.sd = r.snapshot_date
    WHERE r.available = 0 AND r.rate_date > CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM incomes i
        WHERE i."propertyId" = r.property_id
          AND i."checkIn"::date <= r.rate_date AND i."checkOut"::date > r.rate_date
      )
    ORDER BY r.property_id, r.rate_date
  `).catch(() => { fantasmasIlegibles = "rate_snapshots/incomes ilegibles"; return [] })

  const fantasmaCnt = { reserva_sin_income: 0, bloqueo_manual: 0, cancelada: 0, sin_explicar: 0 }
  /** por piso: noches con reserva viva sin income / noches sin explicar (para las alertas) */
  const fantasmaSinIncome = new Map<string, NocheClasificada[]>()
  const fantasmaSinExplicar = new Map<string, string[]>()
  let syncReparadas = 0

  if (fantasmas.length > 0 && !fantasmasIlegibles) {
    try {
      const ventana = ventanaConsulta(fantasmas.map(f => f.rate_date))!
      const crudas = (await listarReservasVentana(ventana.desde, ventana.hasta)).map(reservaDesdeSmoobu)
      // Mismo emparejamiento nombre→piso que el sync (exacto y por inclusión, en minúsculas).
      const propRows = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
        SELECT id, name FROM properties`)
      const nombreDe = new Map(propRows.map(p => [p.id, p.name.toLowerCase().trim()]))
      const reservasDe = (pid: string) => {
        const nombre = nombreDe.get(pid) ?? ""
        return crudas.filter(r => {
          const k = (r.apartmentName ?? "").toLowerCase().trim()
          return k && nombre && (k === nombre || k.includes(nombre) || nombre.includes(k))
        })
      }
      for (const f of fantasmas) {
        const c = clasificarNoche(f.rate_date, reservasDe(f.property_id))
        fantasmaCnt[c.tipo]++
        if (c.tipo === "reserva_sin_income") {
          const l = fantasmaSinIncome.get(f.property_id) ?? []
          l.push(c)
          fantasmaSinIncome.set(f.property_id, l)
        } else if (c.tipo === "sin_explicar") {
          const l = fantasmaSinExplicar.get(f.property_id) ?? []
          l.push(f.rate_date)
          fantasmaSinExplicar.set(f.property_id, l)
        }
      }
      // REPARACIÓN: re-lanza el sync completo (idempotente) sobre la ventana de llegada de las
      // noches con reserva viva sin income, con modifiedFrom muy atrás — es el mismo camino
      // probado de siempre (inserta/actualiza/cancela), no una inserción paralela que divergiría.
      if (fantasmaSinIncome.size > 0) {
        const noches = [...fantasmaSinIncome.values()].flat().map(c => c.fecha)
        const v = ventanaConsulta(noches)!
        const res = await runSync(800, 20, v.desde, v.hasta).catch(() => null)
        syncReparadas = res?.new ?? 0
      }
    } catch (e) {
      // Sin poder mirar Smoobu NO se clasifica ni se avisa de «sin explicar»: un veredicto a
      // ciegas vale menos que ninguno. La pasada queda marcada como degradada (latido + respuesta).
      fantasmasIlegibles = `Smoobu ilegible: ${String(e).slice(0, 120)}`
    }
  }

  // #7/#8 Calendario contra mercado. El p50 de la fecha y el del mes se calculan SOBRE LOS MISMOS
  // pisos-escenario (el JOIN restringe el mes a los escenarios que barrieron esa fecha): si un día
  // solo se barrió para la casa de 12 plazas, su mes también sale de la casa, no de la media de
  // todos. Sin ese control, un barrido desigual dispararía "evento desconocido" cada semana.
  const mercadoDia = await prisma.$queryRaw<{
    fecha: string; comps: number; p50_fecha: number; p50_mes: number
  }[]>(Prisma.sql`
    WITH base AS (
      SELECT scenario, checkin_date, price_night
      FROM market_rates
      WHERE search_date >= CURRENT_DATE - INTERVAL '30 days'
        AND price_night > 0 AND scenario LIKE 'prop_%' AND checkin_date >= CURRENT_DATE
        AND (guests IS NULL OR guests <= 0 OR price_night >= ${MIN_EUR_PLAZA_COMP} * guests)
    ),
    por_fecha AS (
      SELECT scenario, checkin_date,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night) AS p50, COUNT(*) AS n
      FROM base GROUP BY scenario, checkin_date
    ),
    por_mes AS (
      SELECT scenario, date_trunc('month', checkin_date) AS mes,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night) AS p50, COUNT(*) AS n
      FROM base GROUP BY scenario, date_trunc('month', checkin_date)
    )
    SELECT f.checkin_date::text AS fecha,
           SUM(f.n)::int AS comps,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY f.p50)::float8 AS p50_fecha,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY m.p50)::float8 AS p50_mes
    FROM por_fecha f
    JOIN por_mes m ON m.scenario = f.scenario AND m.mes = date_trunc('month', f.checkin_date)
    WHERE m.p50 > 0 AND m.n >= 20
    GROUP BY f.checkin_date
  `).catch(() => [])

  // Factor de evento tal y como lo ve el motor: el MAYOR entre el calendario del repo y la tabla que
  // llenan los agentes de eventos. Si una fuente conoce la fecha, la otra no cuenta como "no había".
  //
  // 🚨 Si esta consulta falla, el centinela #8 («el mercado sube y no sabemos por qué») marcaría como
  // NO CATALOGADAS todas las fechas de evento del calendario automático — un aluvión de falsos
  // positivos indistinguible de un hallazgo real. Antes se tragaba con un mapa vacío; ahora se anota
  // y los dos centinelas de evento se desactivan en esta pasada en vez de mentir.
  // Se traen los dos estados por separado porque los dos centinelas necesitan cosas distintas:
  //   · #7 «evento sin respaldo de mercado» pregunta «este precio alto, ¿lo sostiene el mercado?» →
  //     solo tiene sentido sobre CONFIRMADOS, que son los únicos que mueven el precio.
  //   · #8 «el mercado sube y no sabemos por qué» pregunta «¿conocemos esta fecha?» → un PREVISTO
  //     cuenta como conocida. Sin esto, las noches de la Bienal (previstas) saldrían como «evento no
  //     catalogado» en cuanto el mercado subiera — avisando de algo que ya está en la tabla.
  let eventosIlegibles = false
  const autoEvRows = await prisma.$queryRaw<{ rate_date: string; factor: number; estado: string }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, MAX(factor)::float8 AS factor, estado
    FROM pricing_eventos_auto
    WHERE rate_date >= CURRENT_DATE AND estado <> 'descartado'
    GROUP BY rate_date, estado
  `).catch(() => { eventosIlegibles = true; return [] })

  /** factor de los CONFIRMADOS: lo que de verdad mueve el precio (centinela #7) */
  const autoEv = new Map<string, number>()
  /** factor de CUALQUIER estado vivo: «esta fecha la conocemos» (centinela #8) */
  const autoEvConocido = new Map<string, number>()
  for (const r of autoEvRows) {
    const f = Number(r.factor)
    if (r.estado === 'confirmado') autoEv.set(r.rate_date, Math.max(autoEv.get(r.rate_date) ?? 1, f))
    autoEvConocido.set(r.rate_date, Math.max(autoEvConocido.get(r.rate_date) ?? 1, f))
  }

  type EventoHit = { fecha: string; factor: number; p50Fecha: number; p50Mes: number; motivo: string }
  const sinRespaldo: EventoHit[] = []
  const noCatalogados: EventoHit[] = []
  // Sin la tabla de eventos NO se evalúan estos dos centinelas: la mitad de su entrada falta, y un
  // veredicto con datos a medias vale menos que ninguno. `fechas_evaluadas` sale a 0 en la respuesta,
  // que es lo honesto — el denominador dice cuántas se miraron de verdad.
  for (const d of eventosIlegibles ? [] : mercadoDia) {
    const base = {
      p50Fecha: Number(d.p50_fecha),
      p50Mes: Number(d.p50_mes),
      compsFecha: Number(d.comps),
    }
    // #7: solo lo confirmado (es lo único que sube el precio y por tanto lo único que hay que
    // justificar contra el mercado).
    const factor = Math.max(eventFactor(d.fecha), autoEv.get(d.fecha) ?? 1)
    const a = decidirEventoSinRespaldo({ ...base, factorEvento: factor })
    if (a.alerta) sinRespaldo.push({ fecha: d.fecha, factor, ...base, motivo: a.motivo })

    // #8: cuenta TODO lo vivo — previstos incluidos. La pregunta es «¿conocemos esta fecha?», y un
    // previsto ya está catalogado aunque todavía no tarifique.
    const factorConocido = Math.max(eventFactor(d.fecha), autoEvConocido.get(d.fecha) ?? 1)
    const b = decidirEventoNoCatalogado({ ...base, factorEvento: factorConocido })
    if (b.alerta) noCatalogados.push({ fecha: d.fecha, factor: factorConocido, ...base, motivo: b.motivo })
  }

  // Inserta alerta si no hay ya una IGUAL sin resolver (sin límite de tiempo). Antes la ventana era
  // "últimas 24h": como el cron corre a diario a la misma hora, cada pasada quedaba justo fuera de esa
  // ventana y creaba una fila NUEVA por día → el mismo aviso (p.ej. "tocando el precio mínimo") se
  // apilaba y salía DUPLICADO en el Telegram (5 avisos con repetidos, 22/07/2026). Mientras el aviso
  // siga abierto no se recrea; si Alberto lo resuelve y el problema persiste, la siguiente pasada crea
  // uno nuevo y vuelve a avisar (avisado_at se reinicia con la fila nueva).
  async function pushAlert(a: {
    tipo: string; prioridad: string; property_id: string; titulo: string; detalle: string
    dato_actual?: number; dato_mercado?: number; diferencia_pct?: number; fecha_ref?: string
  }): Promise<boolean> {
    const ex = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM pricing_alerts
      WHERE tipo = ${a.tipo} AND property_id = ${a.property_id} AND resuelta = false
        AND (${a.fecha_ref ?? null}::date IS NULL OR fecha_ref = ${a.fecha_ref ?? null}::date)
      LIMIT 1`)
    if (ex.length) return false
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_alerts (tipo, prioridad, property_id, titulo, detalle, dato_actual, dato_mercado, diferencia_pct, scenario, fecha_ref)
      VALUES (${a.tipo}, ${a.prioridad}, ${a.property_id}, ${a.titulo}, ${a.detalle},
        ${a.dato_actual ?? null}, ${a.dato_mercado ?? null}, ${a.diferencia_pct ?? null}, 'normal', ${a.fecha_ref ?? null}::date)`)
    return true
  }

  let created = 0
  const newReversions: typeof reversions = []
  for (const r of reversions) {
    const ok = await pushAlert({
      tipo: "precio_revertido", prioridad: "alta", property_id: r.property_id,
      titulo: `${PROP_NAMES[r.property_id] ?? r.property_id}: precio revertido el ${r.rate_date}`,
      detalle: `Fijamos ${r.new_price}€ base y ahora hay ${r.base_now}€ en Smoobu. Alguien o algo lo ha pisado en Smoobu.`,
      dato_actual: r.new_price, dato_mercado: r.base_now, fecha_ref: r.rate_date,
    })
    if (ok) { created++; newReversions.push(r) }
  }
  for (const f of floorHits) {
    const ok = await pushAlert({
      tipo: "suelo_coste", prioridad: "media", property_id: f.property_id,
      titulo: `${PROP_NAMES[f.property_id] ?? f.property_id}: tocando el precio mínimo`,
      detalle: `El motor fija el suelo de coste (${f.min_price}€) en ${f.dias} fechas. A precio de mercado este piso va justo de margen; revisa costes/calidad.`,
      dato_actual: f.min_price,
    })
    if (ok) created++
  }
  for (const s of subHits) {
    const ok = await pushAlert({
      tipo: "precio_sub_mercado", prioridad: "alta", property_id: s.property_id,
      titulo: `${PROP_NAMES[s.property_id] ?? s.property_id}: precio ${Math.abs(Math.round(s.diffPct))}% por debajo de su mercado real`,
      detalle: `El precio vivo va por debajo del mercado del piso en ${s.sub}/${s.matched} fechas (media ${Math.round(s.avg_live)}€ vs ${Math.round(s.avg_p50)}€). Rampa hacia mercado — probablemente sigue anclado a un precio viejo.`,
      dato_actual: Math.round(s.avg_live), dato_mercado: Math.round(s.avg_p50), diferencia_pct: Math.round(s.diffPct),
    })
    if (ok) created++
  }
  for (const r of reservasBajas) {
    const nombre = r.guest ? ` (${r.guest.slice(0, 24)})` : ""
    const ok = await pushAlert({
      tipo: "reserva_bajo_mercado", prioridad: "alta", property_id: r.property_id,
      titulo: `${PROP_NAMES[r.property_id] ?? r.property_id}: reserva ${Math.abs(Math.round(r.ev.diffPct))}% por debajo de mercado`,
      detalle: `Entró una reserva${nombre} el ${r.checkin} a ${Math.round(r.adr)}€/noche brutos (mercado real de esa fecha ~${Math.round(r.p50)}€). Revisa que el precio de esas fechas no siga bajo.`,
      dato_actual: Math.round(r.adr), dato_mercado: Math.round(r.p50), diferencia_pct: Math.round(r.ev.diffPct), fecha_ref: r.checkin,
    })
    if (ok) created++
  }

  for (const p of plazaHits) {
    const nombre = PROP_NAMES[p.property_id] ?? p.property_id
    if (p.vivoEv.alerta) {
      const ok = await pushAlert({
        tipo: "precio_por_plaza", prioridad: "alta", property_id: p.property_id,
        titulo: `${nombre}: a ${Math.round(Number(p.vivo))}€ salen menos de 18€ por plaza`,
        detalle: `${p.vivoEv.motivo} La noche más barata publicada es el ${p.fecha}. Con ${p.plazas} plazas ese total es precio de hostal por persona: sube el suelo o revisa de dónde sale ese precio.`,
        dato_actual: Math.round(Number(p.vivo)), fecha_ref: p.fecha ?? undefined,
      })
      if (ok) created++
    }
    if (p.sueloEv.alerta) {
      const ok = await pushAlert({
        tipo: "suelo_por_plaza", prioridad: "media", property_id: p.property_id,
        titulo: `${nombre}: el suelo de ${Math.round(Number(p.min_price))}€ deja el € por plaza demasiado bajo`,
        detalle: `${p.sueloEv.motivo} El suelo es lo más barato a lo que este piso puede llegar a venderse: con ${p.plazas} plazas conviene subirlo.`,
        dato_actual: Math.round(Number(p.min_price)),
      })
      if (ok) created++
    }
  }
  for (const a of aforoHits) {
    const ok = await pushAlert({
      tipo: "comps_otro_aforo", prioridad: "alta", property_id: a.property_id,
      titulo: `${PROP_NAMES[a.property_id] ?? a.property_id}: su mercado se está leyendo de pisos de otro tamaño`,
      detalle: `${a.ev.motivo} Mientras siga así, NO bajes el precio de este piso con el dato de mercado: revisa que la rutina de Booking (mercado-booking) esté midiendo su aforo y vuelve a mirarlo.`,
    })
    if (ok) created++
  }
  for (const e of sinRespaldo) {
    const ok = await pushAlert({
      tipo: "evento_sin_respaldo", prioridad: "media", property_id: "_calendario",
      titulo: `Evento del ${e.fecha} (x${e.factor}) sin respaldo en el mercado`,
      detalle: `${e.motivo} Comprueba las fechas en el calendario de eventos: así estuvo la Feria de Abril 2027, una semana desplazada, desde que se metió.`,
      dato_actual: Math.round(e.p50Fecha), dato_mercado: Math.round(e.p50Mes), fecha_ref: e.fecha,
    })
    if (ok) created++
  }
  for (const e of noCatalogados) {
    const ok = await pushAlert({
      tipo: "evento_no_catalogado", prioridad: "media", property_id: "_calendario",
      titulo: `El mercado del ${e.fecha} se dispara y no tenemos evento`,
      detalle: `${e.motivo} Mira qué hay en Sevilla ese día y añádelo al calendario: si el mercado sube y nosotros no, regalamos la noche.`,
      dato_actual: Math.round(e.p50Fecha), dato_mercado: Math.round(e.p50Mes), fecha_ref: e.fecha,
    })
    if (ok) created++
  }
  // #10: reserva viva en Smoobu que NO está en incomes (el sync se la saltó). Alerta ALTA aunque
  // la reparación haya funcionado: Alberto debe saber que el sync tuvo un hueco, y la alerta
  // queda de registro (dedupe por piso+primera fecha mientras siga abierta).
  for (const [pid, noches] of fantasmaSinIncome) {
    const rangos = agruparRangos(noches.map(n => n.fecha)).map(r => r.desde === r.hasta ? r.desde : `${r.desde}→${r.hasta}`).join(", ")
    const quien = noches[0].reserva
    const ok = await pushAlert({
      tipo: "noche_sin_income", prioridad: "alta", property_id: pid,
      titulo: `${PROP_NAMES[pid] ?? pid}: ${noches.length} noche(s) bloqueadas por una reserva que NO está en incomes`,
      detalle: `Smoobu tiene una reserva viva (${quien?.guestName ?? "?"}, id ${quien?.id ?? "?"}) cubriendo ${rangos} y el sync no la tenía. ` +
        (syncReparadas > 0
          ? `Reparado en esta pasada: el sync re-lanzado recuperó ${syncReparadas} reserva(s).`
          : `La reparación automática (re-sync de la ventana) NO recuperó nada — revisa el sync a mano.`),
      fecha_ref: noches[0].fecha,
    })
    if (ok) created++
  }
  // #10: bloqueada en el calendario y Smoobu no devuelve NADA que la cubra (probable bloqueo a
  // nivel de tarifa). No es dinero perdido seguro, pero nadie lo ha decidido conscientemente hoy.
  for (const [pid, fechas] of fantasmaSinExplicar) {
    const rangos = agruparRangos(fechas).map(r => r.desde === r.hasta ? r.desde : `${r.desde}→${r.hasta}`).join(", ")
    const ok = await pushAlert({
      tipo: "noche_bloqueada_sin_explicar", prioridad: "media", property_id: pid,
      titulo: `${PROP_NAMES[pid] ?? pid}: ${fechas.length} noche(s) bloqueadas sin reserva ni bloqueo en Smoobu`,
      detalle: `El calendario tiene ${rangos} en no disponible y Smoobu no devuelve ninguna reserva, bloqueo ni cancelación que lo explique. Mira el calendario de Smoobu: puede ser un bloqueo a nivel de tarifa que nadie recuerda.`,
      fecha_ref: fechas[0],
    })
    if (ok) created++
  }

  // ── AVISO A ALBERTO POR TELEGRAM ──────────────────────────────────────────────
  // Manda UN mensaje con las alertas alta/media aún NO avisadas (cubre también las que crea
  // mercado/cron, p.ej. precio_bajo). Se marca `avisado_at` para no repetir el mismo aviso.
  //
  // 🚨 SIN VENTANA DE TIEMPO, y no es un descuido (01/08/2026). Antes esto exigía además
  // `created_at >= now() - INTERVAL '3 days'`, y esa condición se combinaba fatal con el dedup de
  // `pushAlert` (que NO recrea un aviso mientras siga abierto): una alerta que no se enviara en sus
  // primeros 3 días —una pasada perdida, un fallo de Telegram— se quedaba abierta PARA SIEMPRE sin
  // avisar nunca, porque nunca volvía a tener un `created_at` fresco. Cazado en la auditoría: 5
  // alertas abiertas con `avisado_at` NULL, dos de prioridad ALTA sobre Luxury por debajo de
  // mercado (22 y 25 de julio) que Alberto no llegó a ver — y eran exactamente el problema que
  // acabó costando la reserva del 6 de noviembre.
  // `avisado_at` ya es el antirrepetición; la ventana solo añadía una forma de perder avisos.
  let avisadas = 0
  try {
    const pend = await prisma.$queryRaw<{
      id: string; tipo: string; prioridad: string; titulo: string; detalle: string
    }[]>(Prisma.sql`
      SELECT id, tipo, prioridad, titulo, detalle
      FROM pricing_alerts
      WHERE resuelta = false AND avisado_at IS NULL
        AND prioridad IN ('alta', 'media')
      ORDER BY (prioridad = 'alta') DESC, created_at DESC
      LIMIT 12`)
    if (pend.length > 0) {
      const hayAlta = pend.some(p => p.prioridad === "alta")
      const lineas = pend.map(p => `• ${p.titulo}`).join("\n")
      await tgAlert(
        `🏷️ <b>Guardián de precios</b> — ${pend.length} aviso(s) sin ver:\n${lineas}\n\nDetalle y resolver: /sivra/pricing-auto`,
        hayAlta ? "critico" : "aviso",
      )
      // OJO: `id` es uuid y Prisma manda los params como text → `id IN (…)` lanza
      // `operator does not exist: uuid = text` (42883). Ese throw caía en el catch de abajo,
      // así que desde el 20/07 el Telegram SÍ salía pero avisado_at nunca se marcaba → el mismo
      // aviso se re-enviaba a diario hasta caducar la ventana de 3 días (duplicados del 22/07).
      // El cast a text mantiene el dedup sin pelearse con el tipado de parámetros.
      await prisma.$executeRaw(Prisma.sql`
        UPDATE pricing_alerts SET avisado_at = now()
        WHERE id::text IN (${Prisma.join(pend.map(p => p.id))})`)
      avisadas = pend.length
    }
  } catch (e) {
    console.error("[sivra/pricing/guard] aviso Telegram:", e)
  }

  // 💓 Huella para el vigía. El guardián es la red de seguridad de TODO el pricing y hasta hoy era
  // el único agente sin vigilante: si dejaba de correr, su silencio era indistinguible de un «no hay
  // nada que avisar». Se registra al final a propósito —lo que importa es que la pasada COMPLETÓ— y
  // una tabla de eventos ilegible cuenta como pasada mala: con los centinelas #7/#8 apagados, media
  // vigilancia no es vigilancia.
  await registrarLatido('sivra_pricing_guard', !eventosIlegibles && !fantasmasIlegibles, [
    `${reversions.length + floorHits.length + subHits.length + reservasBajas.length + plazaHits.length + aforoHits.length} hallazgos`,
    `${created} alertas nuevas, ${avisadas} avisadas`,
    `${mercadoDia.length} fechas con mercado evaluable`,
    fantasmas.length
      ? `${fantasmas.length} noche(s) bloqueadas sin income (${fantasmaCnt.reserva_sin_income} reserva sin sync` +
        `${syncReparadas ? `, ${syncReparadas} reparadas` : ''}, ${fantasmaCnt.bloqueo_manual} bloqueo manual, ` +
        `${fantasmaCnt.cancelada} cancelación pendiente, ${fantasmaCnt.sin_explicar} sin explicar)`
      : '',
    eventosIlegibles ? 'pricing_eventos_auto ILEGIBLE: #7 y #8 sin evaluar' : '',
    fantasmasIlegibles ? `check #10 SIN evaluar (${fantasmasIlegibles})` : '',
  ].filter(Boolean).join(' · ')).catch(() => {})

  return NextResponse.json({
    ok: !eventosIlegibles && !fantasmasIlegibles,
    degradado: [
      eventosIlegibles
        ? "pricing_eventos_auto ilegible: los centinelas de evento (#7 y #8) NO se han evaluado en esta pasada"
        : null,
      fantasmasIlegibles
        ? `check #10 (noches sin income) SIN evaluar: ${fantasmasIlegibles}`
        : null,
    ].filter(Boolean).join(" · ") || undefined,
    reversions: reversions.length,
    floor_hits: floorHits.length,
    sub_mercado: subHits.length,
    reservas_bajas: reservasBajas.length,
    por_plaza: plazaHits.length,
    comps_otro_aforo: aforoHits.length,
    // `fechas_evaluadas` es el denominador honesto de #7/#8: si sale bajo, el barrido de mercado
    // cubre pocas fechas y el silencio de los centinelas NO significa que el calendario esté bien.
    fechas_evaluadas: eventosIlegibles ? 0 : mercadoDia.length,
    eventos_sin_respaldo: sinRespaldo.length,
    eventos_no_catalogados: noCatalogados.length,
    // #10: siempre los cuatro estados, para que «0 sin income» no tape «no se pudo mirar»
    // (fantasmasIlegibles ya lo declara arriba) ni «hay bloqueos manuales» (que son normales).
    noches_fantasma: fantasmas.length,
    noches_sin_income: fantasmaCnt.reserva_sin_income,
    noches_bloqueo_manual: fantasmaCnt.bloqueo_manual,
    noches_cancelada_pendiente: fantasmaCnt.cancelada,
    noches_sin_explicar: fantasmaCnt.sin_explicar,
    sync_reparadas: syncReparadas,
    alerts_created: created,
    avisadas,
  })
}
