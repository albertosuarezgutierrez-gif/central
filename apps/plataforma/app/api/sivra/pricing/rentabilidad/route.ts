import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { resumirBacktest, resumirMercado, diasRestantesReferencia, GO_LIVE, PL_REFERENCIA_CADUCA, type FilaBacktest, type FilaMercado } from "@/lib/sivra/pricing-rentabilidad"
import { MIN_EUR_PLAZA_COMP } from "@/lib/sivra/pricing-comps-plausibles"
import { compararAnual, cortePrevio, totalizar, type FilaMesPiso } from "@/lib/sivra/rentabilidad-anual"

export const dynamic = "force-dynamic"

// GET /api/sivra/pricing/rentabilidad — estudio «Motor vs PriceLabs».
//
// Tres piezas, cada una con su estado explícito (nunca un 0 que parezca resultado):
//  1. BACKTEST lista-vs-lista: noches VENDIDAS bajo el motor valoradas al precio que el motor
//     tenía aplicado al reservarse, contra el que pedía la curva PL congelada esa noche.
//     Solo Dúplex/House tienen curva genuina; Busto/Luxury salen como 'sin_referencia'.
//  2. VENTAS por cohorte de RESERVA (reserved_at) desde el go-live de cada piso — lo que el
//     motor vendió de verdad, mes a mes. La facturación por mes de ESTANCIA llega tarde
//     (antelación mediana 3-39 días según piso) y no mide al motor.
//  3. COSTE: la serie real de cargos de PriceLabs en `gastos` (64,96€/mes → 49,97€ en agosto
//     tras la baja). El ahorro no se extrapola: se enseña la serie y punto.
//
// 🚨 El hueco de 2025 (cero reservas con entrada jun-jul 2025 por los backfills por ventanas)
// se COMPRUEBA en cada carga y bloquea la comparación interanual hasta estar reparado.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  const goLiveValues = Prisma.join(
    Object.entries(GO_LIVE).map(([pid, f]) => Prisma.sql`(${pid}, ${f}::date)`),
  )

  const hoyISO = new Date().toISOString().slice(0, 10)
  const anioActual = Number(hoyISO.slice(0, 4))
  const corteActual = hoyISO
  const cortePrev = cortePrevio(hoyISO)

  const [backtestRaw, mercadoRaw, cohorte, hueco2025, gastosPl, anualRaw] = await Promise.all([
    // 1) Backtest: cada noche vendida (reserva >= go-live del piso) con referencia PL de su
    // fecha, y el último precio del motor aplicado (no dry-run) ANTES de esa reserva.
    prisma.$queryRaw<{
      property_id: string; noches_vendidas: number; con_precio_motor: number
      motor_lista: number | null; pl_lista: number | null
    }[]>(Prisma.sql`
      WITH go_live(property_id, desde) AS (VALUES ${goLiveValues}),
      noches AS (
        SELECT i."propertyId" AS property_id, i.reserved_at, gs::date AS noche
        FROM incomes i
        JOIN go_live g ON g.property_id = i."propertyId"
        CROSS JOIN LATERAL generate_series(i."checkIn"::date, i."checkOut"::date - 1, interval '1 day') gs
        WHERE i.reserved_at >= g.desde
      ),
      con_ref AS (
        SELECT n.*, p.pl_price,
          (SELECT pa.new_price FROM pricing_applied pa
            WHERE pa.property_id = n.property_id AND pa.rate_date = n.noche
              AND pa.dry_run = false AND pa.applied_at <= n.reserved_at
            ORDER BY pa.applied_at DESC LIMIT 1) AS precio_motor
        FROM noches n
        JOIN pricing_pl_referencia p ON p.property_id = n.property_id AND p.rate_date = n.noche
      )
      SELECT property_id,
        COUNT(*)::int AS noches_vendidas,
        COUNT(precio_motor)::int AS con_precio_motor,
        SUM(precio_motor) FILTER (WHERE precio_motor IS NOT NULL)::float AS motor_lista,
        SUM(pl_price) FILTER (WHERE precio_motor IS NOT NULL)::float AS pl_lista
      FROM con_ref GROUP BY property_id
    `),
    // 1-bis) Motor vs MERCADO REAL: las mismas noches vendidas, contra el p50 de los
    // comparables FIABLES (booking_mcp/manual, plausibles por €/plaza, normalizados por
    // aforo — mismos filtros que el motor y el guardián) de ESA noche, medidos a ±10 días
    // de la reserva (lo que un huésped comparaba al reservar). ≥5 comps o no se juzga.
    // Este contrafactual NO caduca — releva a la curva PL cuando muera el 06/12/2026.
    // SQL ejecutado contra la BD real antes de commitear (25/08/2026).
    prisma.$queryRaw<FilaMercado[]>(Prisma.sql`
      WITH go_live(property_id, desde) AS (VALUES ${goLiveValues}),
      noches AS (
        SELECT i."propertyId" AS property_id, i.reserved_at, gs::date AS noche
        FROM incomes i
        JOIN go_live g ON g.property_id = i."propertyId"
        CROSS JOIN LATERAL generate_series(i."checkIn"::date, i."checkOut"::date - 1, interval '1 day') gs
        WHERE i.reserved_at >= g.desde
      ),
      con_motor AS (
        SELECT n.*,
          (SELECT pa.new_price FROM pricing_applied pa
            WHERE pa.property_id = n.property_id AND pa.rate_date = n.noche
              AND pa.dry_run = false AND pa.applied_at <= n.reserved_at
            ORDER BY pa.applied_at DESC LIMIT 1) AS precio_motor
        FROM noches n
      ),
      con_mkt AS (
        SELECT c.*, mk.p50, mk.comps
        FROM con_motor c
        LEFT JOIN LATERAL (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY m.price_night * pricing_factor_aforo(z.max_guests, m.guests))::float AS p50,
                 COUNT(*)::int AS comps
          FROM market_rates m
          LEFT JOIN pricing_piso_zona z ON z.property_id = m.scenario
          WHERE m.scenario = c.property_id
            AND m.checkin_date = c.noche
            AND m.fuente IN ('booking_mcp', 'manual')
            AND m.price_night > 0
            AND (m.guests IS NULL OR m.guests <= 0 OR m.price_night >= ${MIN_EUR_PLAZA_COMP} * m.guests)
            AND m.search_date BETWEEN c.reserved_at::date - 10 AND c.reserved_at::date + 10
        ) mk ON true
      )
      SELECT property_id,
        COUNT(*)::int AS noches_vendidas,
        COUNT(precio_motor)::int AS con_precio_motor,
        COUNT(*) FILTER (WHERE precio_motor IS NOT NULL AND comps >= 5)::int AS con_mercado,
        SUM(precio_motor) FILTER (WHERE precio_motor IS NOT NULL AND comps >= 5)::float AS motor_lista,
        SUM(p50) FILTER (WHERE precio_motor IS NOT NULL AND comps >= 5)::float AS mercado_p50
      FROM con_mkt GROUP BY property_id
    `),
    // 2) Cohorte de venta mensual bajo el motor.
    prisma.$queryRaw<{
      property_id: string; mes: string; reservas: number; noches: number
      bruto: number | null; neto: number | null
    }[]>(Prisma.sql`
      WITH go_live(property_id, desde) AS (VALUES ${goLiveValues})
      SELECT i."propertyId" AS property_id, to_char(i.reserved_at, 'YYYY-MM') AS mes,
        COUNT(*)::int AS reservas,
        SUM(i."checkOut"::date - i."checkIn"::date)::int AS noches,
        SUM(i.amount_gross)::float AS bruto, SUM(i.amount)::float AS neto
      FROM incomes i JOIN go_live g ON g.property_id = i."propertyId"
      WHERE i.reserved_at >= g.desde
      GROUP BY 1, 2 ORDER BY 2, 1
    `),
    // 3) ¿Sigue el hueco de 2025? (jun-jul 2025 sin UNA SOLA entrada es hueco de datos, no mercado)
    prisma.$queryRaw<{ mes: string; n: number }[]>(Prisma.sql`
      SELECT to_char(gs, 'YYYY-MM') AS mes,
        (SELECT COUNT(*) FROM incomes i WHERE i."checkIn" >= gs AND i."checkIn" < gs + interval '1 month')::int AS n
      FROM generate_series('2025-05-01'::date, '2025-08-01'::date, interval '1 month') gs
    `),
    // 4) Serie real de cargos de PriceLabs.
    prisma.$queryRaw<{ fecha: string; total: number }[]>(Prisma.sql`
      SELECT fecha::date::text AS fecha, total::float AS total
      FROM gastos
      WHERE proveedor ILIKE '%pricelab%' OR concepto ILIKE '%pricelab%'
      ORDER BY fecha DESC LIMIT 24
    `),
    // 5) FACTURACIÓN mes a mes, este año contra el anterior — petición de Alberto (26/08/2026).
    // El corte por año es lo que hace justa la comparación: una reserva cuenta en el mes M del
    // año Y solo si se reservó ANTES del corte de ese año (hoy, o el mismo día del año pasado).
    // Así los meses ya pasados comparan estancias consumidas, el mes en curso compara «lo que va
    // del mes» contra «lo que iba a la misma altura», y los futuros comparan CARTERA contra
    // CARTERA — el ritmo de venta, que es lo único que dice si vas por delante.
    // `reserved_at` está informado al 100% desde 2024 (verificado en BD), así que el corte es exacto.
    // SQL ejecutado contra la BD real antes de commitear (26/08/2026).
    prisma.$queryRaw<{ property_id: string; mes: string; bruto: number; noches: number; reservas: number }[]>(Prisma.sql`
      WITH cortes(anio, corte) AS (
        VALUES (${anioActual}::int, ${corteActual}::date), (${anioActual - 1}::int, ${cortePrev}::date)
      )
      SELECT i."propertyId" AS property_id,
        to_char(i."checkIn", 'YYYY-MM') AS mes,
        SUM(i.amount_gross)::float AS bruto,
        SUM(i.nights)::int AS noches,
        COUNT(*)::int AS reservas
      FROM incomes i
      JOIN cortes c ON c.anio = EXTRACT(YEAR FROM i."checkIn")::int
      WHERE i.nights > 0 AND i.amount_gross > 0
        AND i.reserved_at IS NOT NULL AND i.reserved_at::date <= c.corte
      GROUP BY 1, 2
    `),
  ])

  const porId = new Map(backtestRaw.map((r) => [r.property_id, r]))
  const backtest = Object.keys(GO_LIVE).map((pid) => {
    const r = porId.get(pid)
    const fila: FilaBacktest = {
      property_id: pid,
      noches_vendidas: r?.noches_vendidas ?? 0,
      con_precio_motor: r?.con_precio_motor ?? 0,
      motor_lista: r?.motor_lista ?? null,
      pl_lista: r?.pl_lista ?? null,
      // Solo Dúplex/House conservan curva PL genuina (Busto/Luxury borrados el 15/08/2026:
      // su «curva PL» era el eco del propio motor).
      tiene_referencia: pid === 'prop_duplex_center' || pid === 'prop_house_sevillana',
    }
    return { ...resumirBacktest(fila), noches_vendidas: fila.noches_vendidas }
  })

  const porIdMercado = new Map(mercadoRaw.map((r) => [r.property_id, r]))
  const mercado = Object.keys(GO_LIVE).map((pid) => {
    const r = porIdMercado.get(pid)
    const fila: FilaMercado = {
      property_id: pid,
      noches_vendidas: r?.noches_vendidas ?? 0,
      con_precio_motor: r?.con_precio_motor ?? 0,
      con_mercado: r?.con_mercado ?? 0,
      motor_lista: r?.motor_lista ?? null,
      mercado_p50: r?.mercado_p50 ?? null,
    }
    return { ...resumirMercado(fila), noches_vendidas: fila.noches_vendidas, con_precio_motor: fila.con_precio_motor }
  })

  const mesesVacios = hueco2025.filter((m) => m.n === 0).map((m) => m.mes)

  const pisos = Object.keys(GO_LIVE)
  const anualSerie = compararAnual(anualRaw as FilaMesPiso[], { hoyISO, goLive: GO_LIVE, pisos })
  const anual = {
    anio: anioActual,
    corte_actual: corteActual,
    corte_previo: cortePrev,
    serie: anualSerie,
    total: totalizar(anualSerie),
    // El total de lo que YA se consumió (meses cerrados + el mes en curso), que es la cifra
    // comparable «a día de hoy»; los meses de cartera van aparte porque miden otra cosa.
    total_consumido: totalizar(anualSerie.filter((s) => s.regimen !== 'cartera')),
    total_cartera: totalizar(anualSerie.filter((s) => s.regimen === 'cartera')),
  }

  return NextResponse.json({
    ok: true,
    backtest,
    mercado,
    cohorte,
    hueco_2025: { reparado: mesesVacios.length === 0, meses_vacios: mesesVacios },
    gastos_pricelabs: gastosPl,
    referencia_pl: { caduca: PL_REFERENCIA_CADUCA, dias_restantes: diasRestantesReferencia(new Date()) },
    go_live: GO_LIVE,
    anual,
    nota: 'Backtest = lista del motor vs lista de la curva PL congelada, SOLO en noches vendidas con ambas cifras. No dice cuántas noches habría vendido PL: eso lo dirá la ocupación al cierre de sept-nov. El bloque Mercado compara las mismas noches contra el p50 de los comparables fiables de Booking medidos al reservarse — no caduca.',
  })
}
