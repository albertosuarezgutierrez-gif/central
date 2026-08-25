import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { resumirBacktest, diasRestantesReferencia, GO_LIVE, PL_REFERENCIA_CADUCA, type FilaBacktest } from "@/lib/sivra/pricing-rentabilidad"

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

  const [backtestRaw, cohorte, hueco2025, gastosPl] = await Promise.all([
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

  const mesesVacios = hueco2025.filter((m) => m.n === 0).map((m) => m.mes)

  return NextResponse.json({
    ok: true,
    backtest,
    cohorte,
    hueco_2025: { reparado: mesesVacios.length === 0, meses_vacios: mesesVacios },
    gastos_pricelabs: gastosPl,
    referencia_pl: { caduca: PL_REFERENCIA_CADUCA, dias_restantes: diasRestantesReferencia(new Date()) },
    go_live: GO_LIVE,
    nota: 'Backtest = lista del motor vs lista de la curva PL congelada, SOLO en noches vendidas con ambas cifras. No dice cuántas noches habría vendido PL: eso lo dirá la ocupación al cierre de sept-nov.',
  })
}
