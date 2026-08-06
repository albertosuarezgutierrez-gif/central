import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { EVENTS } from "@/lib/pricing-calendar"
import { ventanasDelBarrido, type EventoFecha } from "@/lib/sivra/mercado-ventanas"
import { ventanasQuePedir, FUENTES_FIABLES, type CoberturaVentana } from "@/lib/sivra/mercado-cobertura"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/mercado/plan?max=12
//
// QUÉ ventanas (fecha × aforo) debe medir la rutina de Booking en ESTA pasada, ya ordenadas por
// urgencia. Es el contrato entre el plan de fechas (que vive en el código, `ventanasDelBarrido`) y
// una sesión de Claude, que es quien tiene el conector de Booking.
//
// POR QUÉ EXISTE (06/08/2026). La alternativa era escribir las fechas en el prompt de la rutina, y
// eso divergiría del plan real en el primer cambio (ya pasó con las SQL desfasadas de la skill de
// ialimp). Aquí el plan se calcula UNA vez, con el mismo helper que usa el barrido, y la rutina
// solo lo consume. Además, al ordenar por antigüedad del corpus FIABLE, la rutina no necesita
// recordar por dónde iba: si una pasada se corta, la siguiente retoma lo más urgente sola.
//
// Auth de RUTINA (`isRoutineAuthorized`): `ALERTA_TOKEN` (header-only) o `CRON_SECRET` por compat.
// Es de solo LECTURA: no escribe nada, así que el radio de daño es nulo.
export async function GET(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const max = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("max") ?? 12)))
  const hoy = new Date().toISOString().slice(0, 10)
  const avisos: string[] = []

  // Aforos REALES por piso: el comparable de una casa de 12 plazas no es el de un apartamento de 4
  // (bug del 31/07/2026). Los pisos que comparten aforo comparten consulta.
  const filas = await prisma.$queryRaw<{ property_id: string; max_guests: number }[]>`
    SELECT property_id, COALESCE(max_guests, 4)::int AS max_guests FROM pricing_piso_zona`
  const aforos = new Map<number, string[]>()
  for (const f of filas) {
    const a = Number(f.max_guests) > 0 ? Number(f.max_guests) : 4
    aforos.set(a, [...(aforos.get(a) ?? []), f.property_id])
  }
  if (!aforos.size) {
    return NextResponse.json(
      { error: "pricing_piso_zona vacía: sin aforos no hay comparables fiables" },
      { status: 409 },
    )
  }

  // Fechas de evento de las dos fuentes que conoce el motor (calendario del repo + descubrimiento
  // de los crons). Si la tabla falla se barre la base mensual y SE DICE — no es «no había eventos».
  const eventos: EventoFecha[] = Object.entries(EVENTS).map(([fecha, factor]) => ({
    fecha, factor: Number(factor), nombre: "calendario",
  }))
  try {
    const ev = await prisma.$queryRaw<{ rate_date: Date; factor: number; nombre: string }[]>(Prisma.sql`
      SELECT rate_date, MAX(factor)::float AS factor, MIN(nombre) AS nombre
      FROM pricing_eventos_auto WHERE rate_date >= CURRENT_DATE GROUP BY rate_date`)
    for (const f of ev) {
      eventos.push({
        fecha: new Date(f.rate_date).toISOString().slice(0, 10),
        factor: Number(f.factor),
        nombre: String(f.nombre ?? "").slice(0, 60),
      })
    }
  } catch {
    avisos.push("pricing_eventos_auto ilegible: plan SIN las fechas de evento descubiertas por los crons")
  }

  const plan = ventanasDelBarrido(hoy, eventos, {
    mesesBase: Number(process.env.SIVRA_SWEEP_MESES ?? 8),
    maxEventos: Number(process.env.SIVRA_SWEEP_MAX_EVENTOS ?? 6),
    fechasPorMes: Number(process.env.SIVRA_SWEEP_FECHAS_MES ?? 3),
  })

  // Cobertura FIABLE ya existente. La ventana de 120 días es la misma que mira el motor
  // (`pricing/apply`): más atrás no le sirve a nadie. `fuente` excluye a Serper a propósito.
  let cobertura: CoberturaVentana[] = []
  try {
    const cov = await prisma.$queryRaw<{ checkin: Date; guests: number; ultima: Date; comps: number }[]>(Prisma.sql`
      SELECT checkin_date AS checkin, guests, MAX(search_date) AS ultima, COUNT(*)::int AS comps
      FROM market_rates
      WHERE fuente IN (${Prisma.join(FUENTES_FIABLES)})
        AND checkin_date >= CURRENT_DATE
        AND search_date >= CURRENT_DATE - 120
        AND price_night > 0
      GROUP BY checkin_date, guests`)
    cobertura = cov.map(c => ({
      checkin: new Date(c.checkin).toISOString().slice(0, 10),
      aforo: Number(c.guests),
      ultimaMedicion: new Date(c.ultima).toISOString().slice(0, 10),
      comps: Number(c.comps),
    }))
  } catch (e) {
    // 🚨 Sin cobertura NO se puede priorizar, pero sí se puede trabajar: se devuelve el plan como
    // si nada estuviera medido (conservador: se remide de más, nunca de menos) y se DICE.
    avisos.push(`cobertura ilegible (${String(e).slice(0, 80)}): el plan sale como si nada estuviera medido`)
  }

  const ventanas = ventanasQuePedir(plan, aforos, cobertura, hoy, max)

  return NextResponse.json({
    ok: true,
    hoy,
    // Cuántas ventanas tiene el plan COMPLETO frente a las que se piden ahora: así la rutina puede
    // decir en su parte «voy por 12 de 96» en vez de dar a entender que ha cubierto todo.
    plan_total: plan.length * aforos.size,
    pedidas: ventanas.length,
    sin_medir_nunca: ventanas.filter(v => v.diasSinMedir === null).length,
    ventanas,
    avisos,
  })
}
