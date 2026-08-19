import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { EVENTS } from "@/lib/pricing-calendar"
import { ventanasDelBarrido, ventanasDeConfirmadosPorFecha, type EventoFecha } from "@/lib/sivra/mercado-ventanas"
import {
  planDeVentanas, parsearParametrosPlan, FUENTES_FIABLES,
  type CoberturaVentana,
} from "@/lib/sivra/mercado-cobertura"
import { NOMBRE_PORTAL } from "@/lib/sivra/mercado-propios"
import {
  planEscaparate, type CandidataEscaparate, type PisoEscaparate,
} from "@/lib/sivra/escaparate-plan"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Duraciones con las que se propone medir el escaparate propio. Hay que variarlas a propósito: la
 * cuota fija del canal es POR ESTANCIA, así que solo se hace visible comparando ventanas de
 * distinta duración (el mismo piso «mide» ×1,33 a 2 noches y ×1,18 a 3 sin haber cambiado nada).
 */
const NOCHES_ESCAPARATE = [2, 3, 4]
/** Ventanas propias que se piden por piso y pasada. Cada una es una consulta al conector. */
const ESCAPARATE_POR_PISO = 2

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
// Devuelve DOS listas, y las dos son trabajo de la misma pasada:
//   · `ventanas` — el mercado (comparables de la competencia) que hay que medir;
//   · `escaparate` — NUESTRO propio anuncio, ventana a ventana (19/08/2026). Hasta hoy esto pasaba
//     por casualidad —el piso propio aparecía a veces en una búsqueda de comparables— y por eso el
//     motor llevaba tres días convirtiendo mercado→base con un ×1,20 que nadie había medido. Ver
//     `lib/sivra/escaparate-plan.ts`: elige las fechas que dan RECORRIDO de precio, que es lo único
//     que permite separar el multiplicador del canal de su cuota fija.
//
// Auth de RUTINA (`isRoutineAuthorized`): `ALERTA_TOKEN` (header-only) o `CRON_SECRET` por compat.
// Es de solo LECTURA: no escribe nada, así que el radio de daño es nulo.
export async function GET(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  // Parseo de `max`/`rondas`/`desde`/`hasta` en un helper PURO y testeado: el handler no se puede
  // ejercitar con `node --test` (necesita Prisma y el alias `@/`), y ahí es donde se escondió un
  // fallo mudo real — `?max=abc` devolvía CERO ventanas en silencio. Ver `parsearParametrosPlan`.
  const parseo = parsearParametrosPlan(new URL(req.url).searchParams)
  if (!parseo.ok) return NextResponse.json({ error: parseo.error }, { status: 400 })
  const { max, filtro } = parseo.valor

  const hoy = new Date().toISOString().slice(0, 10)
  const avisos: string[] = [...parseo.avisos]

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
  // El calendario del repo es curado a mano: cuenta como CONFIRMADO (el flag decide la prioridad
  // de la cola — una fecha de evento confirmado sin medir está CONGELADA por el motor, 13/08/2026).
  const eventos: EventoFecha[] = Object.entries(EVENTS).map(([fecha, factor]) => ({
    fecha, factor: Number(factor), nombre: "calendario", confirmado: true,
  }))
  try {
    // Los `descartado` quedan FUERA: ya no cuentan para el motor (eventos-estado.ts) y pedir
    // barrido para ellos era gastar ventanas en fechas juzgadas falsas. `confirmado` sigue la
    // misma normalización que `normalizarEstado`: NULL/vacío = confirmado (histórico pre-columna).
    const ev = await prisma.$queryRaw<{ rate_date: Date; factor: number; nombre: string; confirmado: boolean }[]>(Prisma.sql`
      SELECT rate_date, MAX(factor)::float AS factor, MIN(nombre) AS nombre,
             bool_or(COALESCE(estado, '') NOT IN ('previsto', 'descartado')) AS confirmado
      FROM pricing_eventos_auto
      WHERE rate_date >= CURRENT_DATE AND COALESCE(estado, '') <> 'descartado'
      GROUP BY rate_date`)
    for (const f of ev) {
      eventos.push({
        fecha: new Date(f.rate_date).toISOString().slice(0, 10),
        factor: Number(f.factor),
        nombre: String(f.nombre ?? "").slice(0, 60),
        confirmado: Boolean(f.confirmado),
      })
    }
  } catch {
    avisos.push("pricing_eventos_auto ilegible: plan SIN las fechas de evento descubiertas por los crons")
  }

  const planBase = ventanasDelBarrido(hoy, eventos, {
    mesesBase: Number(process.env.SIVRA_SWEEP_MESES ?? 8),
    maxEventos: Number(process.env.SIVRA_SWEEP_MAX_EVENTOS ?? 6),
    fechasPorMes: Number(process.env.SIVRA_SWEEP_FECHAS_MES ?? 3),
  })
  // 🧊 Los eventos CONFIRMADOS entran además POR FECHA, sin colapsar bloques (14/08/2026): la
  // congelación del motor es por fecha exacta, y con el colapso las noches no-representantes de
  // un bloque (18/19-sep de la Bienal tras medirse el 20-sep) se quedaban congeladas para
  // siempre. Solo en ESTE plan (Booking): el sweep de Serper mantiene el colapso — allí cada
  // ventana es una búsqueda de pago y su corpus ni siquiera cuenta para descongelar.
  const plan = [...planBase, ...ventanasDeConfirmadosPorFecha(hoy, eventos, planBase)]

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

  const { ventanas, candidatas, recortadas } = planDeVentanas(plan, aforos, cobertura, hoy, max, filtro)

  // ── Plan del ESCAPARATE propio ───────────────────────────────────────────────────────────────
  // Mismas fechas del calendario, pero midiendo NUESTRO anuncio. La base de cada ventana se calcula
  // aquí (suma de `rate_snapshots.price_pricelabs` de sus noches, que PESE AL NOMBRE es el precio
  // vivo de Smoobu): sin base conocida la ventana no se propone — medir el portal para una noche
  // que no se puede cruzar con nada no aporta al ajuste.
  let escaparate: ReturnType<typeof planEscaparate> = { peticiones: [], huecos: [] }
  try {
    const aforoPorPiso = new Map<string, number>()
    for (const f of filas) aforoPorPiso.set(f.property_id, Number(f.max_guests) > 0 ? Number(f.max_guests) : 4)

    const base = await prisma.$queryRaw<{ property_id: string; rate_date: Date; precio: number }[]>(Prisma.sql`
      SELECT property_id, rate_date, price_pricelabs AS precio
      FROM rate_snapshots
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND rate_date >= CURRENT_DATE AND price_pricelabs IS NOT NULL`)
    const precioNoche = new Map<string, number>()
    for (const b of base) {
      precioNoche.set(`${b.property_id}|${new Date(b.rate_date).toISOString().slice(0, 10)}`, Number(b.precio))
    }

    const medidas = await prisma.$queryRaw<
      { property_id: string; checkin: Date; noches: number; guests: number; base_total: number | null; medido_el: Date }[]
    >(Prisma.sql`
      SELECT property_id, checkin, noches, guests, base_total, medido_el
      FROM pricing_escaparate WHERE medido_el >= CURRENT_DATE - 120`)

    const checkins = [...new Set(plan.map(v => v.checkin))].sort()
    const pisosEsc: PisoEscaparate[] = [...aforoPorPiso.entries()].map(([propertyId, aforo]) => {
      const candidatasPiso: CandidataEscaparate[] = []
      for (const checkin of checkins) {
        for (const noches of NOCHES_ESCAPARATE) {
          let total = 0
          let completa = true
          for (let i = 0; i < noches; i++) {
            const dia = new Date(new Date(`${checkin}T00:00:00Z`).getTime() + i * 86_400_000)
              .toISOString().slice(0, 10)
            const precio = precioNoche.get(`${propertyId}|${dia}`)
            if (precio == null) { completa = false; break }
            total += precio
          }
          candidatasPiso.push({ checkin, noches, baseTotal: completa ? total : null })
        }
      }
      return {
        propertyId,
        aforo,
        nombrePortal: NOMBRE_PORTAL[propertyId] ?? null,
        candidatas: candidatasPiso,
        medidas: medidas
          .filter(m => m.property_id === propertyId)
          .map(m => ({
            checkin: new Date(m.checkin).toISOString().slice(0, 10),
            noches: Number(m.noches),
            guests: Number(m.guests),
            baseTotal: m.base_total != null ? Number(m.base_total) : null,
            medidoEl: new Date(m.medido_el).toISOString().slice(0, 10),
          })),
      }
    })
    escaparate = planEscaparate(pisosEsc, hoy, { porPiso: ESCAPARATE_POR_PISO })
    for (const h of escaparate.huecos) avisos.push(`escaparate ${h.property_id}: ${h.motivo}`)
  } catch (e) {
    // 🚨 Un plan de escaparate vacío por avería se lee EXACTAMENTE igual que «ya está todo medido»,
    // y de esa confusión salió el ×1,20 sin contrastar. Se declara.
    avisos.push(`plan de escaparate ilegible (${String(e).slice(0, 80)}): esta pasada NO mide nuestro propio anuncio`)
  }

  // Un recorte MUDO se lee como «esto era todo lo que había». Se dice, para que el parte de la
  // rutina pueda distinguir «cubierto» de «cubierto hasta donde cabía en la pasada».
  if (recortadas > 0) {
    avisos.push(`el tope (max=${max}) dejó fuera ${recortadas} ventanas que casaban el filtro: la pasada NO agota lo pedido`)
  }
  const hayFiltro = Boolean(filtro.rondas || filtro.desde || filtro.hasta)

  return NextResponse.json({
    ok: true,
    hoy,
    // Cuántas ventanas tiene el plan COMPLETO frente a las que se piden ahora: así la rutina puede
    // decir en su parte «voy por 12 de 96» en vez de dar a entender que ha cubierto todo.
    plan_total: plan.length * aforos.size,
    // Con filtro, `plan_total` ya no es el denominador honesto de la pasada: `candidatas` sí.
    filtro: hayFiltro ? filtro : null,
    candidatas,
    recortadas,
    pedidas: ventanas.length,
    sin_medir_nunca: ventanas.filter(v => v.diasSinMedir === null).length,
    ventanas,
    // NUESTRO propio anuncio: `hotel_names` + fechas exactas. Alimenta `pricing_escaparate` y con
    // ello el calibrado del canal (`/api/sivra/pricing/canal`), que es quien decide con qué números
    // el motor convierte mercado→base.
    escaparate: escaparate.peticiones,
    escaparate_huecos: escaparate.huecos,
    avisos,
  })
}
