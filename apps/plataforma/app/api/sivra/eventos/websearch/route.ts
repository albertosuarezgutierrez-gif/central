import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"
import { buscarWeb, busquedaConfigurada } from "@/lib/websearch"
import { impactoEvento } from "@/lib/sivra/eventos-impacto"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import { tgSend } from "@central/core-telegram"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET /api/sivra/eventos/websearch  (cron semanal)
//
// Fase 2-B: complementa a Ticketmaster (/eventos/sync). Ticketmaster capta conciertos y
// deportes con venue, pero NO lista LaLiga (Sevilla FC / Betis), ferias locales, congresos
// ni festivos puntuales. Esta ruta los descubre por BÚSQUEDA WEB y los upserta en
// `pricing_eventos_auto` con `fuente='websearch'`. El motor (apply) ya combina TODAS las
// fuentes de la tabla por MAX(factor) → cero cambios en el motor. Mismo modelo de impacto
// por aforo que Ticketmaster.
//
// La búsqueda va por `lib/websearch.ts::buscarWeb` (13/07/2026): Gemini google_search
// (gratis) primero y, si está saturado (las rachas de 429 tenían este cron mudo desde junio),
// el plugin `web` de OpenRouter como suplente de pago (~0,02€/pasada, presupuesto diario de
// la pasarela). Ambos intentos quedan en `ai_usos` (endpoint='eventos'). Sin NINGUNA de las
// dos keys, no-op → se despliega seguro.

// El factor por aforo vive en `lib/sivra/eventos-impacto.ts` (puro y testeado). Estaba duplicado
// palabra por palabra aquí y en /eventos/sync, con un techo real de 1.60 que dejaba corto justo a
// los pelotazos, y sin distinguir un partido de liga (público local, no pernocta) de un concierto
// de estadio del mismo aforo. Ver el porqué en la cabecera de ese fichero.

// ─── 2ª pasada: ANTICIPARSE (01/08/2026, idea de Alberto) ───────────────────────────────────
// Esta ruta solo miraba eventos con entradas ya a la venta. Los que más dinero mueven se ANUNCIAN
// meses antes de existir como entrada: la sede de la final de la Copa del Rey, un congreso que
// firma con FIBES, una gira que publica ciudades antes que fechas. Ahí es donde queda margen para
// subir sin prisa; cuando salen las entradas, medio calendario ya se ha vendido.
//
// Lo que encuentra esta segunda pasada entra como `estado='previsto'`: NO mueve el precio (una
// noticia no es demanda comprada), pero protege el suelo, pide barrido de mercado y avisa a
// Alberto. La asimetría está razonada en `lib/sivra/eventos-estado.ts`.
const CONFIANZA_MIN = Number(process.env.SIVRA_EVENTOS_CONFIANZA_MIN ?? 0.6)

type EvWeb = { fecha?: string; nombre?: string; tipo?: string; aforo_estimado?: number }
type EvPrevisto = EvWeb & { confianza?: number; evidencia?: string; fecha_aproximada?: boolean }

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  if (!busquedaConfigurada()) {
    // 🚨 `ok:false`, NO `ok:true`. Un cron sin configurar está MUDO, y devolver 200 {ok:true} es
    // exactamente por lo que estuvo mudo junio y julio de 2026 sin que nadie se enterara: el vigía
    // no tenía forma de distinguir «no hay eventos nuevos» de «no estoy buscando nada».
    await registrarLatido(
      'sivra_eventos', false,
      'búsqueda web sin configurar (ni GEMINI_API_KEY ni OPENROUTER_API_KEY)',
    ).catch(() => {})
    return NextResponse.json({
      ok: false, configured: false,
      message: "Ni GEMINI_API_KEY ni OPENROUTER_API_KEY configuradas — eventos por web_search inactivos (complementa a Ticketmaster).",
    })
  }

  const hoy = new Date()
  const fin = new Date(hoy.getTime() + PRICING_HORIZON_DAYS * 86400000)
  const desde = hoy.toISOString().slice(0, 10)
  const hasta = fin.toISOString().slice(0, 10)

  // Para no repetir lo que ya hay (Ticketmaster u otra pasada), pásale a Gemini lo registrado.
  // Una fila por FECHA (no por fuente): Karol G estaba tres veces —ticketmaster, websearch y la mano
  // de Alberto— comiéndose tres huecos del listado. Y el nombre se recorta: lo que importa es que el
  // modelo reconozca el evento, no leerse la nota entera. Con el LIMIT 200 anterior y 365 días de
  // horizonte, en cuanto la tabla creciera el corte por fecha ascendente habría dejado los meses
  // lejanos sin protección de duplicados.
  const yaRows = await prisma.$queryRaw<{ rate_date: string; nombre: string }[]>(Prisma.sql`
    SELECT rate_date::text AS rate_date, MIN(left(nombre, 45)) AS nombre
    FROM pricing_eventos_auto
    WHERE rate_date >= CURRENT_DATE AND estado <> 'descartado'
    GROUP BY rate_date ORDER BY rate_date LIMIT 400
  `).catch(() => [])
  const yaResumen = yaRows.map(r => `${r.rate_date} ${r.nombre}`).join(" | ")

  const prompt = `Busca eventos CONFIRMADOS en Sevilla (España) entre ${desde} y ${hasta} que disparen la demanda de ALOJAMIENTO turístico: partidos de LaLiga del Sevilla FC y del Real Betis (local), conciertos en recintos de >1000 personas, ferias y congresos en FIBES, festivales, y festivos locales/puentes grandes (Semana Santa, Feria de Abril).

EVENTOS YA REGISTRADOS (NO repitas ni incluyas nada parecido a estos):
${yaResumen || "Ninguno aún"}

Incluye solo eventos con FECHA CONFIRMADA. Estima el aforo del recinto (estadio La Cartuja ~60000, Sánchez-Pizjuán ~43000, Benito Villamarín ~60000, FIBES ~7000, conciertos medianos ~3000, feria/festivo ciudad ~20000).

Responde SOLO con JSON válido sin markdown:
{"eventos":[{"fecha":"YYYY-MM-DD","nombre":"nombre corto","tipo":"deportes|concierto|feria|congreso|festivo","aforo_estimado":43000}]}
Si no hay nada nuevo: {"eventos":[]}`

  let evs: EvWeb[] = []
  let via = "websearch"
  const errors: string[] = []
  try {
    const res = await buscarWeb("", prompt, { app: "sivra", endpoint: "eventos", maxTokens: 2048, timeoutMs: 30_000 })
    via = `${res.proveedor}:${res.modelo}`
    try {
      evs = JSON.parse(res.text.replace(/```json|```/g, "").trim())?.eventos ?? []
    } catch { errors.push(`JSON de ${res.proveedor} no parseable`) }
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, errors: [String(e).slice(0, 200)] })
  }

  let upserted = 0, descartados = 0
  for (const ev of evs) {
    const rateDate = ev.fecha
    const nombre = (ev.nombre ?? "").trim()
    if (!rateDate || !/^\d{4}-\d{2}-\d{2}$/.test(rateDate) || !nombre) { descartados++; continue }
    if (rateDate < desde || rateDate > hasta) { descartados++; continue }
    const aforo = Math.max(0, Math.round(Number(ev.aforo_estimado ?? 3000)) || 3000)
    const tipo = (ev.tipo ?? "evento").toString().slice(0, 40)
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_eventos_auto (rate_date, nombre, fuente, tipo, aforo, factor, venue, raw, estado, updated_at)
        VALUES (${rateDate}::date, ${nombre}, 'websearch', ${tipo},
          ${aforo}::int, ${impactoEvento(aforo, tipo)}::numeric, NULL, ${JSON.stringify({ via })}::jsonb,
          'confirmado', now())
        ON CONFLICT (fuente, nombre, rate_date) DO UPDATE
          SET aforo = EXCLUDED.aforo, factor = EXCLUDED.factor, tipo = EXCLUDED.tipo,
              estado = 'confirmado', updated_at = now()
      `)
      upserted++
    } catch (e) {
      // Distinguir «la IA mandó basura» de «la BD falló» — antes ambos eran `descartados++` y una
      // caída de BD parecía una cosecha pobre.
      errors.push(`insert ${rateDate}: ${String(e).slice(0, 100)}`)
      descartados++
    }
  }

  // ─── 2ª pasada: ANTICIPACIÓN ────────────────────────────────────────────────────────────────
  const previstos = await buscarPrevistos(desde, hasta, yaResumen)
  errors.push(...previstos.errors)

  const okFinal = errors.length === 0 && (upserted > 0 || evs.length > 0 || previstos.guardados > 0)
  await registrarLatido(
    'sivra_eventos', okFinal,
    `web: ${evs.length} vistos / ${upserted} guardados · previstos: ${previstos.guardados}` +
    (errors.length ? ` · ${errors.length} fallos: ${errors[0]}` : ''),
  ).catch(() => {})

  if (previstos.guardados > 0) await avisarPrevistos().catch(() => {})

  return NextResponse.json({
    ok: errors.length === 0, configured: true, via,
    vistos: evs.length, upserted, descartados,
    previstos: previstos.guardados, previstosVistos: previstos.vistos,
    errors,
  })
}

// Busca lo que la prensa ya da por hecho pero todavía no tiene entradas. Devuelve cuántos guardó;
// nunca lanza (es una mejora, no puede tumbar el descubrimiento normal).
async function buscarPrevistos(desde: string, hasta: string, yaResumen: string): Promise<{
  vistos: number; guardados: number; errors: string[]
}> {
  const errors: string[] = []
  const prompt = `Eres un analista de demanda hotelera en Sevilla (España). Busca en NOTICIAS y fuentes oficiales eventos ANUNCIADOS O MUY PROBABLES en Sevilla entre ${desde} y ${hasta} que TODAVÍA NO tengan entradas a la venta ni fecha cerrada en las plataformas de venta.

Es exactamente lo contrario de una búsqueda de entradas: quiero lo que ya se ha DECIDIDO pero aún no se ha puesto a la venta. Ejemplos del tipo de cosa que busco:
- Sedes adjudicadas de finales o eliminatorias (final de la Copa del Rey en La Cartuja, finales europeas, Copa Davis, selección española).
- Congresos y ferias grandes cuya celebración en FIBES ya se ha anunciado, aunque no haya programa.
- Giras de artistas que han anunciado Sevilla como ciudad sin publicar aún la fecha exacta o las entradas.
- Grandes eventos culturales o deportivos con fecha estimada por convocatoria periódica ya anunciada.

NO incluyas: rumores sin fuente, especulación de aficionados, ni nada de esta lista de ya registrados:
${yaResumen || "Ninguno aún"}

Para cada uno estima la fecha más probable (si solo se sabe el mes, usa el día más probable e indícalo), el aforo del recinto, tu confianza de 0 a 1, y CITA la evidencia (medio + titular o fuente oficial). Sin evidencia citable, no lo incluyas.

Aforos de referencia: estadio La Cartuja ~60000, Sánchez-Pizjuán ~43000, Benito Villamarín ~60000, FIBES ~7000, conciertos medianos ~3000.

Responde SOLO con JSON válido sin markdown:
{"eventos":[{"fecha":"YYYY-MM-DD","fecha_aproximada":true,"nombre":"nombre corto","tipo":"deportes|concierto|feria|congreso|festivo","aforo_estimado":60000,"confianza":0.8,"evidencia":"Medio — titular o fuente"}]}
Si no encuentras nada sólido: {"eventos":[]}`

  let evs: EvPrevisto[] = []
  let via = 'previstos'
  try {
    const res = await buscarWeb("", prompt, { app: "sivra", endpoint: "eventos-previstos", maxTokens: 2048, timeoutMs: 30_000 })
    via = `${res.proveedor}:${res.modelo}`
    try {
      evs = JSON.parse(res.text.replace(/```json|```/g, "").trim())?.eventos ?? []
    } catch { errors.push("previstos: JSON no parseable") }
  } catch (e) {
    // Que falle la anticipación NO invalida la pasada normal: se anota y se sigue.
    errors.push(`previstos: ${String(e).slice(0, 150)}`)
    return { vistos: 0, guardados: 0, errors }
  }

  let guardados = 0
  for (const ev of evs) {
    const fecha = ev.fecha
    const nombre = (ev.nombre ?? "").trim()
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !nombre) continue
    if (fecha < desde || fecha > hasta) continue

    const confianza = Number(ev.confianza)
    // Sin confianza declarada NO se guarda: un previsto sin confianza no hace nada aguas abajo
    // (ver eventos-estado.ts), así que guardarlo solo sería ruido en la tabla.
    if (!Number.isFinite(confianza) || confianza < CONFIANZA_MIN) continue
    const evidencia = String(ev.evidencia ?? "").trim()
    if (!evidencia) continue

    const aforo = Math.max(0, Math.round(Number(ev.aforo_estimado ?? 3000)) || 3000)
    const tipo = String(ev.tipo ?? "evento").slice(0, 40)
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_eventos_auto
          (rate_date, nombre, fuente, tipo, aforo, factor, venue, raw, estado, confianza, evidencia, updated_at)
        VALUES (${fecha}::date, ${nombre}, 'prensa', ${tipo}, ${aforo}::int,
          ${impactoEvento(aforo, tipo)}::numeric, NULL,
          ${JSON.stringify({ via, fecha_aproximada: ev.fecha_aproximada === true })}::jsonb,
          'previsto', ${confianza}::numeric, ${evidencia.slice(0, 500)}, now())
        ON CONFLICT (fuente, nombre, rate_date) DO UPDATE
          SET aforo = EXCLUDED.aforo, factor = EXCLUDED.factor, confianza = EXCLUDED.confianza,
              evidencia = EXCLUDED.evidencia, updated_at = now()
          -- OJO: NO se pisa la columna estado. Si Alberto ya lo confirmo o lo descarto, su decision
          -- manda sobre lo que vuelva a encontrar la prensa manana.
      `)
      guardados++
    } catch (e) {
      errors.push(`previsto ${fecha}: ${String(e).slice(0, 100)}`)
    }
  }

  return { vistos: evs.length, guardados, errors }
}

// Avisa UNA vez por evento previsto (dedupe por `avisado_at`). Alberto es quien confirma o descarta.
async function avisarPrevistos(): Promise<void> {
  const filas = await prisma.$queryRaw<{
    id: bigint; rate_date: string; nombre: string; factor: number; confianza: number; evidencia: string
  }[]>(Prisma.sql`
    SELECT id, rate_date::text AS rate_date, nombre, factor::float AS factor,
           confianza::float AS confianza, COALESCE(evidencia, '') AS evidencia
    FROM pricing_eventos_auto
    WHERE estado = 'previsto' AND avisado_at IS NULL AND rate_date >= CURRENT_DATE
    ORDER BY rate_date LIMIT 10`)
  if (!filas.length) return

  const lineas = filas.map(f =>
    `• *${f.rate_date}* — ${f.nombre}\n  x${f.factor} · confianza ${Math.round(f.confianza * 100)}%\n  _${f.evidencia.slice(0, 160)}_`
  )
  await tgSend(
    `🔮 *Eventos PREVISTOS en Sevilla* (aún sin entradas a la venta)\n\n${lineas.join('\n\n')}\n\n` +
    `De momento *NO suben el precio* — solo protegen el suelo de esas noches y piden barrido de mercado. ` +
    `Si confirmas alguno, pásalo a \`confirmado\` y ya tarifica.`,
  )

  await prisma.$executeRaw(Prisma.sql`
    UPDATE pricing_eventos_auto SET avisado_at = now()
    WHERE id IN (${Prisma.join(filas.map(f => f.id))})`)
}
