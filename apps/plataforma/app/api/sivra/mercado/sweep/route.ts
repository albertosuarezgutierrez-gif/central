import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { chatConDirector } from "@/lib/pasarela"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { EVENTS } from "@/lib/pricing-calendar"
import { ventanasDelBarrido, consultasDeVentana, type EventoFecha } from "@/lib/sivra/mercado-ventanas"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import { barridoFiable, midioTemporada, detalleBarrido, type EstadoVentana, type VentanaMedida } from "@/lib/sivra/resumen-sweep"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/sivra/mercado/sweep  (cron semanal) — Fase 2-B (B1)
//
// El scraper normal (`mercado/cron`) solo mira el PRÓXIMO FINDE, así que el motor solo
// tiene mercado de "hoy" y los precios normales salen planos. Esto barre una ventana por
// mes (próximos 8 meses) y guarda los comps por `checkin_date` para los 4 pisos, de modo
// que el motor (en B2) podrá tarificar por TEMPORADA con datos reales.
//
// ADITIVO: solo INSERTA en market_rates. No toca el pricing (eso es B2). Coste acotado:
// 8 búsquedas Serper + 8 extracciones NIM por ejecución (los comps se reutilizan para los
// 4 pisos, que el motor ya diferencia por calidad/percentiles propios).
//
// 🚨 AMPLIADO 01/08/2026 — el barrido también mide las fechas de EVENTO. Hasta hoy solo miraba el
// primer viernes de cada mes, así que las noches que el motor tarifica al triple (Feria, Semana
// Santa, los tres días de Karol G) NUNCA tenían comps propios: se tarificaban a ciegas y, peor, los
// dos centinelas que las vigilan (#7 «evento sin respaldo» y #8 «el mercado sube y no sabemos por
// qué») se quedaban en `evaluado:false` para siempre por falta de muestra. Qué fechas entran lo
// decide el helper PURO `lib/sivra/mercado-ventanas.ts` (un bloque de evento = una ventana, los más
// cercanos primero, con tope). Ver el porqué completo en su cabecera.

const MONTHS_AHEAD = 8
// Ventanas EXTRA de evento por pasada. Cada una cuesta 1 búsqueda Serper + 1 extracción por aforo
// distinto (hoy 4), así que 6 ≈ +24 búsquedas sobre las 32 de la base. Sube esto solo mirando la
// duración real de la pasada: `maxDuration` es 300 s.
const MAX_VENTANAS_EVENTO = Number(process.env.SIVRA_SWEEP_MAX_EVENTOS ?? 6)

// Fechas de muestra por mes. 🚨 Por debajo de 3 el motor NO puede usar el bucket de mercado de ese
// mes (`MIN_FECHAS_MES` en `pricing/apply`) y lo tarifica con el ancla global — que sale del último
// barrido y está dominada por las fechas cercanas, más baratas. Con 1 sola ventana mensual, que es
// como estuvo hasta el 01/08/2026, ese umbral era inalcanzable POR DISEÑO: medido ese día, House no
// tenía bucket de octubre en adelante y Luxury no tenía el de noviembre — y el viernes 6-nov de
// Luxury se vendió a 122€ de base con comparables de ese mismo día entre 123€ y 212€.
//
// La cobertura se ACUMULA entre pasadas: `market_rates` guarda una fila por (fecha, comp, día de
// búsqueda) y el motor mira 120 días atrás, así que lo que una pasada no llega a barrer por
// presupuesto lo aporta la del día siguiente. Por eso truncar aquí es barato y morir en 504 no.
const FECHAS_POR_MES = Number(process.env.SIVRA_SWEEP_FECHAS_MES ?? 3)

// Tope de consultas de REFUERZO (todo lo que no sea la abierta primaria: la de mes en texto y la
// de `site:booking.com`) por pasada. Cada una es una búsqueda Serper de pago extra, así que se
// acota: con el tope agotado la ventana se queda con lo que dijo la primera — que es la verdad —
// en vez de gastar de más en silencio.
const MAX_CONSULTA_REFUERZO = Number(process.env.SIVRA_SWEEP_MAX_REFUERZO ?? 20)

// 🚨 El barrido busca por el AFORO REAL de cada piso, NO con "4 personas" para todos (bug hasta el
// 31/07/2026: guardaba los MISMOS comps de 4 plazas para los 4 pisos con `guests=4` fijo, así que
// House —12 plazas— se comparaba con apartamentos de 4 y salía a mitad de precio). Los pisos que
// comparten aforo comparten búsqueda, así que el coste es 1 búsqueda por AFORO DISTINTO y ventana
// (hoy 4: 2, 4, 5 y 12 plazas), no 1 por piso.
async function pisosPorAforo(): Promise<Map<number, string[]>> {
  const filas = await prisma.$queryRaw<{ property_id: string; max_guests: number }[]>`
    SELECT property_id, COALESCE(max_guests, 4)::int AS max_guests FROM pricing_piso_zona`
  const porAforo = new Map<number, string[]>()
  for (const f of filas) {
    const aforo = Number(f.max_guests) > 0 ? Number(f.max_guests) : 4
    porAforo.set(aforo, [...(porAforo.get(aforo) ?? []), f.property_id])
  }
  return porAforo
}

// Fechas de evento de las DOS fuentes que conoce el motor: el calendario del repo y lo que
// descubren los crons (Ticketmaster / búsqueda web). Si la tabla falla NO se cae la pasada: se
// barre la base mensual y se dice en la respuesta, que es distinto de «no había eventos».
async function fechasDeEvento(): Promise<{ eventos: EventoFecha[]; tablaOk: boolean }> {
  const eventos: EventoFecha[] = Object.entries(EVENTS).map(([fecha, factor]) => ({
    fecha, factor: Number(factor), nombre: 'calendario',
  }))
  try {
    const filas = await prisma.$queryRaw<{ rate_date: Date; factor: number; nombre: string }[]>(Prisma.sql`
      SELECT rate_date, MAX(factor)::float AS factor, MIN(nombre) AS nombre
      FROM pricing_eventos_auto
      WHERE rate_date >= CURRENT_DATE
      GROUP BY rate_date`)
    for (const f of filas) {
      eventos.push({
        fecha: new Date(f.rate_date).toISOString().slice(0, 10),
        factor: Number(f.factor),
        nombre: String(f.nombre ?? '').slice(0, 60),
      })
    }
    return { eventos, tablaOk: true }
  } catch {
    return { eventos, tablaOk: false }
  }
}

// 🚨 Devuelve TAMBIÉN cuántos resultados trajo la búsqueda. Sin ese número, un `organic: []`
// (Google no encontró nada) y un buzón de resultados lleno de anuncios sin precio acaban en el
// mismo string vacío → la IA responde `{"apartments":[]}` y la pasada dice «0 comps» como si
// hubiera mirado el mercado. Es el fallo del 02/08/2026: 44 búsquedas vacías se leyeron como
// «no hay mercado» (los prompts pesaban 149-278 tokens contra los 576-933 del scraper diario
// que sí trae comps). Ver `lib/sivra/resumen-sweep.ts`.
async function serperSearch(query: string): Promise<{ texto: string; resultados: number }> {
  const key = process.env.SERPER_API_KEY
  if (!key) throw new Error("SERPER_API_KEY no configurada")
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "es", hl: "es", num: 10 }),
    signal: AbortSignal.timeout(10_000),
  })
  // El body del error dice la CAUSA (p. ej. «Not enough credits», 22/08/2026): sin él, un
  // agotamiento de crédito y un payload roto son el mismo «Serper 400» en el latido.
  if (!res.ok) throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const data = await res.json()
  // Mismo aprovechamiento que `mercado/cron`, que es el que sí extrae comps a diario: el precio
  // suele venir en el answerBox o en los sitelinks, no en el snippet principal.
  const partes: string[] = []
  if (data.answerBox?.answer) partes.push(`Destacado: ${data.answerBox.answer}`)
  if (data.answerBox?.snippet) partes.push(`Fragmento destacado: ${data.answerBox.snippet}`)
  const organic: any[] = data.organic || []
  for (const r of organic.slice(0, 10)) {
    const sitelinks = (r.sitelinks || []).map((s: any) => s.snippet || "").filter(Boolean).join(" | ")
    partes.push(`${r.title} | ${r.snippet || ""}${sitelinks ? " | " + sitelinks : ""}`)
  }
  return { texto: partes.join("\n"), resultados: organic.length + (data.answerBox ? 1 : 0) }
}

// `estado` separa «la IA leyó y no había precios» (ausencia real) de «la IA no pudo leer» (fallo
// técnico: ningún modelo respondió o el JSON vino roto). Antes ambos caían en el mismo `[]`.
async function extractPrices(
  snippets: string, checkin: string, checkout: string,
): Promise<{ apartments: any[]; estado: 'ok' | 'sin_leer' }> {
  const system = `Eres experto en turismo en Sevilla. Extrae precios de apartamentos de resultados de búsqueda.
Devuelve SOLO JSON sin markdown:
{"apartments":[{"name":"nombre","price_night":precio_numerico,"score":puntuacion_0_10,"location":"zona"}]}
Reglas: extrae cualquier cifra que parezca precio por noche (€, EUR, "por noche", "la noche"). Si hay un rango usa el extremo inferior. Si el precio parece total de la estancia y hay fechas, divídelo entre las noches. Si no hay ninguna cifra monetaria, {"apartments":[]}.`
  const prompt = `Portal: booking | Check-in: ${checkin} | Check-out: ${checkout}\nResultados:\n${snippets}\nExtrae apartamentos con precio/noche en euros. SOLO JSON.`
  try {
    const txt = (await chatConDirector([{ role: "user", content: prompt }], { app: "plataforma", endpoint: "mercado-sweep", system, maxTokens: 600, temperature: 0.1 })).text
    const clean = txt.replace(/```json|```/g, "").trim()
    const s = clean.indexOf("{"); const e = clean.lastIndexOf("}")
    return { apartments: JSON.parse(clean.slice(s, e + 1)).apartments ?? [], estado: 'ok' }
  } catch (e) {
    console.error('[mercado/sweep] extracción ilegible:', e)
    return { apartments: [], estado: 'sin_leer' }
  }
}

// El orden y el porqué de las consultas de cada ventana viven con ellas en
// `lib/sivra/mercado-ventanas.ts::consultasDeVentana` (abierta con fecha → mes en texto, solo
// base → `site:booking.com`), donde se pueden testear.

function mediana(valores: number[]): number | null {
  if (!valores.length) return null
  const orden = [...valores].sort((a, b) => a - b)
  const m = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[m] : Math.round((orden[m - 1] + orden[m]) / 2)
}

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET o sesión válida
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const secretOk = !!secret && bearer === secret
  if (!secretOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let upserted = 0
  const ventanas: (VentanaMedida & { motivo: string; etiqueta?: string; via?: string })[] = []
  const errors: string[] = []

  const porAforo = await pisosPorAforo()
  if (!porAforo.size) {
    return NextResponse.json({ error: "pricing_piso_zona vacía: sin aforos no hay comparables fiables" }, { status: 409 })
  }

  const { eventos, tablaOk } = await fechasDeEvento()
  if (!tablaOk) errors.push("pricing_eventos_auto ilegible: se barre la base mensual, pero SIN las fechas de evento descubiertas por los crons")

  const plan = ventanasDelBarrido(new Date().toISOString().slice(0, 10), eventos, {
    mesesBase: MONTHS_AHEAD,
    maxEventos: MAX_VENTANAS_EVENTO,
    fechasPorMes: FECHAS_POR_MES,
  })

  // ⏱️ Presupuesto de tiempo EXPLÍCITO. Con 3 fechas por mes el plan pasa de ~14 ventanas a ~30, y
  // cada una cuesta 1 búsqueda + 1 extracción POR AFORO (hoy 4): subir `maxDuration` solo movería la
  // pared. Lo que garantiza que la pasada VUELVE —y deja dicho por dónde iba— es cortar a tiempo.
  // Misma lección que el 504 de `facturas-scan` del 31/07/2026. El plan viene ordenado por rondas,
  // así que lo que se cae al final es profundidad de bucket, nunca la temporada ni los eventos.
  const deadline = Date.now() + 240_000
  let truncado = 0
  let rondaBaseCompleta = true
  let refuerzos = 0

  for (const { checkin, checkout, motivo, etiqueta, ronda } of plan) {
    if (Date.now() > deadline) {
      truncado++
      if (ronda === 0) rondaBaseCompleta = false
      continue
    }
    // 🚨 Los aforos de una MISMA fecha se miden EN PARALELO (05/08/2026). En serie no cabía el
    // calendario: en cuanto la consulta abierta empezó a devolver resultados, cada ventana pasó a
    // pagar su extracción por IA y en los 240 s solo entraron 28 de las 120 ventanas — ni siquiera
    // la ronda base (8 meses × 4 aforos = 32), así que 6 meses se quedaron sin medir y el latido
    // salió (correctamente) en rojo. Las 4 búsquedas de una fecha son independientes entre sí, así
    // que van juntas: el paralelismo está acotado al nº de aforos distintos (hoy 4), que es un
    // techo natural y bajo — ni Serper ni la pasarela ven más de 4 peticiones a la vez.
    await Promise.all([...porAforo].map(async ([aforo, pisos]) => {
      try {
        // Se prueba la consulta abierta y, solo si vuelve vacía, las de refuerzo (con tope, que
        // cada intento extra es una búsqueda Serper de pago).
        let comps: any[] = []
        let estado: EstadoVentana = 'sin_resultados'
        let via: string | undefined
        for (const consulta of consultasDeVentana(checkin, checkout, aforo, motivo)) {
          if (consulta.via !== 'abierta') {
            if (refuerzos >= MAX_CONSULTA_REFUERZO) break
            refuerzos++
          }
          const { texto, resultados } = await serperSearch(consulta.q)
          if (!resultados) { estado = 'sin_resultados'; continue }
          const ext = await extractPrices(texto, checkin, checkout)
          if (ext.estado === 'sin_leer') { estado = 'sin_leer'; continue }
          if (!ext.apartments.length) { estado = 'sin_precios'; continue }
          comps = ext.apartments; estado = 'comps'; via = consulta.via
          break
        }

        let n = 0
        const nombres: string[] = []
        const precios: number[] = []
        for (const apt of comps) {
          const night = Number(apt?.price_night)
          if (!apt?.name || !Number.isFinite(night) || night <= 0) continue
          const score = apt?.score != null && Number.isFinite(Number(apt.score)) ? Number(apt.score) : null
          // Estos comps son del aforo de ESTOS pisos: se guardan con su `guests` real para que el
          // motor sepa contra qué está comparando (y aplique `factorAforo` si algún día no cuadra).
          for (const scenario of pisos) {
            try {
              await prisma.$executeRaw(Prisma.sql`
                INSERT INTO market_rates
                  (search_date, checkin_date, checkout_date, guests, portal, scenario,
                   comp_name, price_night, price_total, score, review_count, location, currency)
                VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, ${aforo}::int, 'booking', ${scenario},
                  ${String(apt.name)}, ${Math.round(night)}::int, ${Math.round(night) * 2}::int,
                  ${score}::numeric, 0, ${String(apt.location || "")}, 'EUR')
                ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
                SET price_night=EXCLUDED.price_night, guests=EXCLUDED.guests, score=EXCLUDED.score, created_at=NOW()`)
              upserted++
              if (scenario === pisos[0]) { n++; nombres.push(String(apt.name)); precios.push(Math.round(night)) }
            } catch { /* dup */ }
          }
        }
        ventanas.push({
          checkin, aforo, ronda, motivo, etiqueta, via,
          comps: n, nombres, mediana: mediana(precios),
          // Si la extracción devolvió apartamentos pero ninguno traía precio usable, se ha leído y
          // no había cifra: es una ausencia REAL, no un hueco de medición.
          estado: n > 0 ? 'comps' : estado === 'comps' ? 'sin_precios' : estado,
        })
      } catch (e) {
        errors.push(`${checkin} (${aforo}p): ${String(e).slice(0, 80)}`)
      }
    }))
  }

  // 🚨 El latido avisa a un HUMANO; esto FRENA AL MOTOR (06/08/2026). Cuando la guardia dice que
  // el corpus no distingue la fecha —los mismos precios repartidos entre fechas distintas—, sus
  // filas se marcan para que el bucket de temporada de `pricing/apply` no las use. Sin esto, la
  // pasada de hoy metía 339 comps con 22 medianas para 30 fechas y el motor tarificaba una
  // estacionalidad inventada mientras el parte decía, correctamente, que no se fiaba.
  // Se marca DESPUÉS de insertar (el veredicto necesita la pasada entera) y solo la `search_date`
  // de hoy: las históricas no se tocan.
  //
  // 🚨 Y SOLO LAS FILAS DE ESTE BARRIDO (07/08/2026). El `WHERE search_date = CURRENT_DATE` a secas
  // arrastraba también las del scraper diario (`mercado/cron`, `scenario='normal'`), que barre UNA
  // fecha por pasada y por eso NO puede clonar nada: es justo la fuente que sí mide temporada. En
  // producción se llevó por delante 16 comps buenos. El barrido escribe con `scenario` = id de piso,
  // así que se acota a los suyos.
  const clonado = !midioTemporada(ventanas)
  const mios = [...new Set([...porAforo.values()].flat())]
  if (clonado && mios.length) {
    // `IN (...)` con `Prisma.join` y no `= ANY($1::text[])`: los arrays de Prisma han dado guerra
    // por el pooler en este repo (landmine del acotado de `mapa_arquitectura`), y aquí no compensa
    // arriesgarse — son 4 valores.
    await prisma.$executeRaw(Prisma.sql`
      UPDATE market_rates SET corpus_clonado = true
      WHERE search_date = CURRENT_DATE AND scenario IN (${Prisma.join(mios)})
    `).catch((e) => { errors.push(`marcar corpus clonado: ${String(e).slice(0, 60)}`) })
  }

  // Huella para el vigía. Qué cuenta como pasada BUENA lo decide el helper puro `resumen-sweep.ts`:
  // no basta con volver sin excepciones — hay que haber MEDIDO. Una búsqueda vacía o una extracción
  // ilegible son «no lo sé», y un «no lo sé» pintado de verde deja al motor tarificando con el ancla
  // global sin que nadie se entere. (Que el corpus no distinga la fecha NO apaga el latido: eso lo
  // frena la marca `corpus_clonado` de arriba — ver la cabecera de `barridoFiable`.)
  //
  // 🚨 VA DESPUÉS DE MARCAR EL CORPUS a propósito (08/08/2026): si el UPDATE que protege al motor
  // falla, el fallo tiene que entrar en el parte. Cuando el latido se escribía antes, ese error se
  // añadía a `errors` cuando ya nadie lo iba a leer — el motor se comía el corpus clonado y el
  // vigía decía verde. Es la misma clase de silencio que este módulo entero viene a cerrar.
  const eventosBarridos = plan.filter(v => v.motivo === 'evento').length
  const resumen = {
    comps: upserted, ventanas, eventos: eventosBarridos,
    truncadas: truncado, baseCompleta: rondaBaseCompleta, errores: errors,
  }
  const ok = barridoFiable(resumen)
  await registrarLatido('sivra_mercado_sweep', ok, detalleBarrido(resumen)).catch(() => {})

  // `truncado` NO es un error: es «me quedé sin tiempo». Se publica para que no haya que deducirlo
  // del número de ventanas, que es justo la clase de silencio que esconde los problemas.
  return NextResponse.json({
    ok, upserted, ventanas, eventosBarridos, truncado,
    base_completa: rondaBaseCompleta, corpus_clonado: clonado, detalle: detalleBarrido(resumen),
    consultas_refuerzo: refuerzos, errors,
  })
}
