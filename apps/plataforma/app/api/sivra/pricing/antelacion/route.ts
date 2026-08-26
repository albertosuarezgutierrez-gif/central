import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { evaluarAntelacion } from "@/lib/sivra/antelacion-resultado"

export const dynamic = "force-dynamic"

// GET /api/sivra/pricing/antelacion
//
// Medidor de resultados de la palanca de ANTICIPACIÓN (ver lib/sivra/pricing-antelacion.ts):
// ¿cobrar más a quien reserva con mucha antelación sale a cuenta, o espanta reservas?
//
// El veredicto lo decide `lib/sivra/antelacion-resultado.ts` (puro y testeado); aquí solo se reúnen
// los agregados. Tres recuentos separados a propósito —pendientes / sin dato / resueltas— porque al
// principio TODAS las noches premiadas están en el futuro y contarlas como vacías mataría la palanca
// antes de poder juzgarla.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })

  // 1) Noches con premio: la ÚLTIMA fila aplicada de cada (piso, fecha), cruzada con si se vendió.
  //    `antelacion_factor > 1` excluye por sí solo el NULL («no se midió») y el 1.00 («sin premio»).
  const porPiso = await prisma.$queryRaw<{
    property_id: string; noches_con_premio: number; premio_medio: number
    pendientes: number; resueltas: number; vendidas: number; sin_dato: number
    extra_eur: number | null; meses: string[]
  }[]>(Prisma.sql`
    WITH prem AS (
      SELECT DISTINCT ON (property_id, rate_date)
        property_id, rate_date, new_price, antelacion_factor
      FROM pricing_applied
      WHERE dry_run = false AND antelacion_factor > 1
      ORDER BY property_id, rate_date, applied_at DESC
    ),
    booked AS (
      SELECT DISTINCT ON (property_id, rate_date)
        property_id, rate_date, was_booked
      FROM rate_snapshots
      WHERE was_booked IS NOT NULL
      ORDER BY property_id, rate_date, snapshot_date DESC
    )
    SELECT
      p.property_id,
      COUNT(*)::int AS noches_con_premio,
      AVG(p.antelacion_factor - 1)::float8 AS premio_medio,
      COUNT(*) FILTER (WHERE p.rate_date >= CURRENT_DATE)::int AS pendientes,
      COUNT(*) FILTER (WHERE p.rate_date < CURRENT_DATE AND b.was_booked IS NOT NULL)::int AS resueltas,
      COUNT(*) FILTER (WHERE p.rate_date < CURRENT_DATE AND b.was_booked)::int AS vendidas,
      COUNT(*) FILTER (WHERE p.rate_date < CURRENT_DATE AND b.was_booked IS NULL)::int AS sin_dato,
      COALESCE(SUM(p.new_price - ROUND(p.new_price / p.antelacion_factor))
        FILTER (WHERE p.rate_date < CURRENT_DATE AND b.was_booked), 0)::int AS extra_eur,
      COALESCE(ARRAY_AGG(DISTINCT TO_CHAR(p.rate_date, 'MM'))
        FILTER (WHERE p.rate_date < CURRENT_DATE AND b.was_booked IS NOT NULL), '{}') AS meses
    FROM prem p
    LEFT JOIN booked b USING (property_id, rate_date)
    GROUP BY p.property_id
    ORDER BY p.property_id
  `)

  // 2) Referencia: ocupación de ESE piso en los MISMOS MESES de años anteriores, de `incomes` (que
  //    arranca en 2020, mientras `rate_snapshots` solo cubre desde mayo-2026). Una noche ocupada es
  //    cada día de estancia, no cada reserva: por eso el generate_series.
  //
  //    🚨 Y se respeta `pricing_settings.historico_desde`, por el mismo motivo que la antelación
  //    mediana: un piso puede haber cambiado de PRODUCTO. House Sevillana se alquiló como dos pisos
  //    independientes hasta 2024; su enero de 2022 (20 noches ocupadas de 31) es la ocupación de otro
  //    negocio y usarla de referencia haría parecer que el premio hunde la ocupación.
  //    OJO: SQL dentro de un template literal de TS — aquí NO se pueden usar backticks ni $ { }.
  const ocupRows = await prisma.$queryRaw<{
    property_id: string; mes: string; anio: number; ocupadas: number; dias: number
  }[]>(Prisma.sql`
    WITH noches AS (
      SELECT i."propertyId" AS property_id, d::date AS dia
      FROM incomes i
      LEFT JOIN pricing_settings ps ON ps.property_id = i."propertyId"
      CROSS JOIN LATERAL generate_series(i."checkIn"::date, i."checkOut"::date - 1, interval '1 day') d
      WHERE i."checkIn" IS NOT NULL AND i."checkOut" IS NOT NULL
        AND i."checkOut"::date > i."checkIn"::date
        AND i."checkIn" < CURRENT_DATE
        AND (ps.historico_desde IS NULL OR i."checkIn"::date >= ps.historico_desde)
    )
    SELECT property_id,
           TO_CHAR(dia, 'MM') AS mes,
           EXTRACT(YEAR FROM dia)::int AS anio,
           COUNT(*)::int AS ocupadas,
           EXTRACT(DAY FROM (DATE_TRUNC('month', dia) + interval '1 month - 1 day'))::int AS dias
    FROM noches
    WHERE dia < DATE_TRUNC('year', CURRENT_DATE)
    GROUP BY property_id, TO_CHAR(dia, 'MM'), EXTRACT(YEAR FROM dia), DATE_TRUNC('month', dia)
  `)

  const resultados = porPiso.map(p => {
    // Referencia: solo los meses del año que de verdad tienen noches premiadas RESUELTAS.
    const mesesRef = new Set(p.meses ?? [])
    const filas = ocupRows.filter(o => o.property_id === p.property_id && mesesRef.has(o.mes))
    const dias = filas.reduce((s, o) => s + o.dias, 0)
    const ocupadas = filas.reduce((s, o) => s + o.ocupadas, 0)
    // Sin años anteriores de esos meses NO hay referencia. `null`, nunca 0: un 0 diría «entonces
    // estaba vacío», que es justo la afirmación que no se puede hacer.
    const ocupacionReferencia = dias > 0 ? ocupadas / dias : null

    const veredicto = evaluarAntelacion({
      nochesConPremio: p.noches_con_premio,
      premioMedio: Number(p.premio_medio) || 0,
      pendientes: p.pendientes,
      resueltas: p.resueltas,
      vendidas: p.vendidas,
      sinDato: p.sin_dato,
      extraEur: Number(p.extra_eur) || 0,
      ocupacionReferencia,
    })

    return {
      property_id: p.property_id,
      noches_con_premio: p.noches_con_premio,
      premio_medio_pct: Math.round((Number(p.premio_medio) || 0) * 1000) / 10,
      pendientes: p.pendientes,
      resueltas: p.resueltas,
      vendidas: p.vendidas,
      sin_dato: p.sin_dato,
      extra_eur: Number(p.extra_eur) || 0,
      meses_medidos: p.meses ?? [],
      ocupacion_referencia: ocupacionReferencia,
      dias_referencia: dias,
      veredicto,
    }
  })

  return NextResponse.json({
    ok: true,
    resultados,
    nota:
      "Los € de más suponen que las reservas que entraron se habrían hecho igual sin premio (el " +
      "contrafactual no existe: quien no reservó no deja fila). Por eso el veredicto exige además " +
      "que la ocupación de esas noches no caiga contra los mismos meses de años anteriores. " +
      "Noches pendientes = todavía en el futuro, NO vacías.",
  })
}
