import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { esAnuncioPropio } from "@/lib/sivra/mercado-propios"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Fuentes que este endpoint acepta declarar. `serper` NO está: ese camino lo escribe el barrido
// automático, no una ingesta externa — permitirlo aquí solo serviría para etiquetar mal.
const FUENTES_INGESTA = ["booking_mcp", "manual"]

// POST /api/sivra/mercado/ingest
// Ingesta de comparables de mercado REALES (Booking, Trivago, Expedia…) obtenidos
// por un conector externo o un agente, sin depender del scraping de Google (Serper).
// Hace upsert en market_rates con la MISMA clave que usa el cron (search_date,
// portal, scenario, comp_name, checkin_date), así que es idempotente por día.
//
// Cuerpo esperado:
// {
//   "portal":   "booking",                // booking | trivago | expedia | tripadvisor | ...
//   "scenario": "prop_busto_reform",      // prop_<id> para comparables por piso, o normal/corpus
//   "checkin":  "2026-06-13",
//   "checkout": "2026-06-14",
//   "guests":   4,                          // opcional, def. 4
//   "currency": "EUR",                      // opcional, def. EUR
//   "apartments": [
//     { "name": "Singular Metropol", "price_night": 177, "price_total": 354,
//       "score": 8.7, "review_count": 1263, "location": "Centro" }
//   ]
// }
//
// `price_total` es el total de la VENTANA (el `price.book` del conector), no el de una noche.
//
// 🪞 Si entre los `apartments` viene NUESTRO propio anuncio (lo decide `esAnuncioPropio`, no el
// prompt de la rutina), no entra como comparable: se guarda en `pricing_escaparate` como una
// medición de la ventana entera —checkin, noches, aforo, total— y el servidor le añade la base de
// Smoobu de esas mismas noches. Es el dato con el que `/api/sivra/pricing/canal` calibra la
// conversión mercado→base del motor. La rutina lo pide explícitamente (bloque `escaparate` de
// `/api/sivra/mercado/plan`), ya no depende de que el portal lo devuelva por casualidad.
//
// Auth de RUTINA (`isRoutineAuthorized`): acepta el token DEDICADO de bajo privilegio
// `ALERTA_TOKEN` (header-only) o, por compatibilidad, el `CRON_SECRET` maestro.
//
// Por qué NO exige `CRON_SECRET`: quien llama aquí es la rutina de Claude Code del agente de
// pricing, una sesión efímera cuyo campo de variables de entorno es TEXTO PLANO VISIBLE — no un
// almacén de secretos (lo avisa la propia interfaz). Meter ahí la llave maestra va contra la regla
// de `apps/plataforma/CLAUDE.md` ("NO ponerla en prompts de rutinas"). El radio de daño de este
// endpoint es acotado: escribe comparables en `market_rates` (dato de entrada del motor), NO aplica
// precios — eso sigue pasando por los raíles de `/api/sivra/pricing/aplicar-propuesta`, que valida
// suelo de coste, tope ±%/día y circuit-breaker aunque los comps vinieran envenenados.
export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { portal, scenario, checkin, checkout } = body
  const guests   = Number(body.guests ?? 4)
  const currency = String(body.currency ?? "EUR")
  const apartments: any[] = Array.isArray(body.apartments) ? body.apartments : []

  // 🚨 `fuente` marca DE DÓNDE sale el precio, y es lo único que distingue un comparable medido
  // para ESA fecha de uno scrapeado de un anuncio sin fecha (los dos llegan con portal='booking').
  // Ver `prisma/sql/2026-08-06_market_rates_fuente.sql`. Default `booking_mcp` porque quien llama
  // aquí es la rutina del conector; un valor desconocido se RECHAZA en vez de colarse como fiable
  // (un centinela que acepta cualquier etiqueta no vigila nada).
  const fuente = String(body.fuente ?? "booking_mcp")
  if (!FUENTES_INGESTA.includes(fuente)) {
    return NextResponse.json(
      { error: `fuente inválida: ${fuente}. Válidas: ${FUENTES_INGESTA.join(", ")}` },
      { status: 400 },
    )
  }

  if (!portal || !scenario || !checkin || !checkout) {
    return NextResponse.json({ error: "Faltan campos: portal, scenario, checkin, checkout" }, { status: 400 })
  }
  if (apartments.length === 0) {
    return NextResponse.json({ error: "apartments vacío" }, { status: 400 })
  }

  let inserted = 0
  /** mediciones de NUESTRO propio escaparate guardadas en esta llamada (ver `pricing_escaparate`) */
  let escaparate = 0
  const skipped: string[] = []
  /**
   * Comparables descartados por ser NUESTROS propios anuncios. Van en una lista APARTE de `skipped`
   * (que es «no tenía precio utilizable») y se devuelven en la respuesta: un comparable que
   * desaparece en silencio es indistinguible de uno que el portal no devolvió. Ver
   * `lib/sivra/mercado-propios.ts`.
   */
  const propios: string[] = []

  // Noches de la ventana. Es un dato del CUERPO (checkin/checkout), no del apartamento, y hace
  // falta para el escaparate propio: con una cuota fija por estancia, un precio sin duración no se
  // puede interpretar (el mismo piso «mide» ×1,33 a 2 noches y ×1,18 a 3).
  const noches = Math.round(
    (new Date(`${checkout}T00:00:00Z`).getTime() - new Date(`${checkin}T00:00:00Z`).getTime()) / 86_400_000)
  if (!Number.isFinite(noches) || noches <= 0) {
    return NextResponse.json({ error: `checkout (${checkout}) no es posterior a checkin (${checkin})` }, { status: 400 })
  }

  for (const apt of apartments) {
    const name  = apt?.name
    // El precio por noche se DERIVA del total si no viene: el conector devuelve `price.book` (el
    // total de la ventana) y quien llama puede mandar solo eso. Antes, un item sin `price_night`
    // se descartaba en silencio — que en el escaparate propio significa perder la medición entera
    // y quedarse con los parámetros de canal viejos sin que nada lo delate.
    const totalCrudo = Number(apt?.price_total)
    const night = Number.isFinite(Number(apt?.price_night)) && Number(apt.price_night) > 0
      ? Number(apt.price_night)
      : (Number.isFinite(totalCrudo) && totalCrudo > 0 ? totalCrudo / noches : NaN)
    if (!name || !Number.isFinite(night) || night <= 0) { skipped.push(String(name ?? "?")); continue }
    // Total de la VENTANA. `price.book` del conector ya lo es. Si solo llega el precio por noche se
    // reconstruye multiplicando por las noches: el fallback anterior (`= price_night`) daba el
    // precio de UNA noche etiquetado como total, que en una ventana de 4 noches es un 75% menos.
    const totalVentana = Number.isFinite(totalCrudo) && totalCrudo > 0
      ? Math.round(totalCrudo)
      : Math.round(night * noches)
    // 🪞 Nuestro propio anuncio NO es mercado: escribirlo aquí ancla el ancla al precio que este
    // mismo motor acaba de poner. El raíl va en el endpoint, no solo en el prompt de la rutina.
    //
    // Pero tampoco es basura: es NUESTRO ESCAPARATE, el único sitio donde se puede ver lo que paga
    // de verdad el huésped por nuestra noche (18/08/2026). Cruzado con la base de Smoobu de ese día
    // da el markup REAL del canal, que hasta ahora el motor SUPONÍA (`channel_markup`). Se guarda
    // aparte, en `pricing_escaparate`, para que no pueda mezclarse nunca con los comparables.
    if (esAnuncioPropio(String(name))) {
      propios.push(String(name))
      if (String(scenario).startsWith("prop_")) {
        try {
          // 🚨 `base_total` lo calcula el SERVIDOR, no quien llama. Es la mitad del par: si la
          // rutina mandara el precio del portal Y la base que ella cree, un desfase entre las dos
          // (un snapshot viejo, otro piso) produciría una recta plausible y falsa, y esa recta
          // decide el precio de TODAS las fechas. Si falta el precio de alguna noche,
          // `base_total` queda NULL y el ajuste descarta la ventana: una base a medias no es una
          // base baja, es una base desconocida.
          //
          // 🚨 La base tiene que ser la VIVA en el momento de MEDIR, no la del último snapshot
          // (25/08/2026). La rutina mide a las ~03:40 UTC y el snapshot corre a las 07:00, así que
          // «el snapshot más reciente» es el de AYER a las 07:00 — anterior a las TRES pasadas de
          // `apply` de ayer (08:30/14:30/20:30, hasta ±20% de movimiento, y más si saltó un premio
          // de evento). El portal enseña la base nueva y aquí se apuntaba la vieja: la recta salía
          // con un sesgo sistemático del signo del movimiento del día (medido el 25/08: la ventana
          // 29/08-01/09 de Busto Reform con base_total=365€ y base viva 469€ → «+30% de error» que
          // era nuestra PROPIA subida intradía, no Booking). Con el motor subiendo, la validación
          // cantaba «el portal cobra MÁS de lo que predecimos» en los cuatro pisos y el calibrado
          // se corregía contra un fantasma. Por eso cada noche superpone el último precio APLICADO
          // (`pricing_applied`, dry_run=false) sobre el snapshot: el aplicado gana si es del mismo
          // día del snapshot o posterior (el snapshot corre a las 07:00 y las pasadas a las 08:30+,
          // así que «mismo día» significa «después del snapshot»); si es anterior, el snapshot ya
          // lo contiene y además caza los cambios hechos a mano en Smoobu.
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO pricing_escaparate
              (property_id, checkin, noches, guests, precio_total, base_total, portal, fuente)
            SELECT ${String(scenario)}, ${checkin}::date, ${noches}::integer, ${guests}::integer,
                   ${totalVentana}::integer, b.base_total, ${String(portal)}, ${fuente}
            FROM (
              SELECT CASE WHEN COUNT(n.precio) = ${noches}::integer THEN SUM(n.precio)::int END AS base_total
              FROM generate_series(${checkin}::date, ${checkin}::date + (${noches}::integer - 1), INTERVAL '1 day') AS d(dia)
              LEFT JOIN LATERAL (
                SELECT rs.price_live AS precio, rs.snapshot_date
                FROM rate_snapshots rs
                WHERE rs.property_id = ${String(scenario)} AND rs.rate_date = d.dia::date
                  AND rs.price_live IS NOT NULL AND rs.snapshot_date <= CURRENT_DATE
                ORDER BY rs.snapshot_date DESC LIMIT 1
              ) rs ON true
              LEFT JOIN LATERAL (
                SELECT pa.new_price AS precio
                FROM pricing_applied pa
                WHERE pa.property_id = ${String(scenario)} AND pa.rate_date = d.dia::date
                  AND pa.dry_run = false
                  AND (rs.snapshot_date IS NULL OR pa.applied_at::date >= rs.snapshot_date)
                ORDER BY pa.applied_at DESC LIMIT 1
              ) ap ON true
              LEFT JOIN LATERAL (SELECT COALESCE(ap.precio, rs.precio) AS precio) n ON true
            ) b
            ON CONFLICT (property_id, checkin, noches, guests, portal, medido_el)
            DO UPDATE SET precio_total = EXCLUDED.precio_total, base_total = EXCLUDED.base_total,
                          created_at = now()`)
          escaparate++
        } catch (e) {
          // Que no se pueda medir el escaparate NO puede tumbar la ingesta de comparables, pero
          // tampoco puede desaparecer en silencio: va en la respuesta de la pasada.
          skipped.push(`escaparate ${name}: ${String(e).slice(0, 60)}`)
        }
      }
      continue
    }
    const total  = totalVentana
    const score  = apt?.score != null && Number.isFinite(Number(apt.score)) ? Number(apt.score) : null
    const reviews = Number.isFinite(Number(apt?.review_count)) ? Number(apt.review_count) : 0
    const location = apt?.location != null ? String(apt.location) : ""

    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO market_rates
          (search_date, checkin_date, checkout_date, guests, portal, scenario,
           comp_name, price_night, price_total, score, review_count, location, currency, fuente)
        VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, ${guests},
          ${String(portal)}, ${String(scenario)}, ${String(name)},
          ${Math.round(night)}::integer, ${Math.round(total)}::integer,
          ${score}::numeric, ${reviews}::integer, ${location}, ${currency}, ${fuente})
        ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
        SET price_night=EXCLUDED.price_night, price_total=EXCLUDED.price_total,
            score=EXCLUDED.score, review_count=EXCLUDED.review_count,
            location=EXCLUDED.location, created_at=NOW(),
            -- La fuente MEJOR gana el desempate: si el barrido ya había escrito este comparable
            -- hoy con un precio de anuncio, la medición real de la fecha lo sustituye y además
            -- se queda marcada como fiable. Al revés no puede pasar (el sweep no llama aquí).
            fuente=EXCLUDED.fuente`)
      inserted++
    } catch (e) {
      skipped.push(`${name}: ${String(e).slice(0, 80)}`)
    }
  }

  return NextResponse.json({ ok: true, portal, fuente, scenario, checkin, checkout, inserted, skipped, propios, escaparate })
}
