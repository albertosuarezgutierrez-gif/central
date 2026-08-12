import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"
import { buscarWeb, busquedaConfigurada } from "@/lib/websearch"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import { tgSend } from "@central/core-telegram"
import {
  decidirVerificacion, nombresParecidos, senalMercado,
  detalleVerificacion, verificacionFiable, DIAS_CADUCIDAD,
  type SenalPrensa, type VeredictoPrensa, type FilaMercado, type ResumenVerificacion,
} from "@/lib/sivra/eventos-verificacion"

export const dynamic = "force-dynamic"
// 300, no 60: la lección de `facturas-scan`, que moría en 504 a mitad del trabajo y ni siquiera
// llegaba a escribir su huella. El techo alto NO basta — abajo hay presupuesto de tiempo real.
export const maxDuration = 300

// GET /api/sivra/eventos/verificar  (cron diario, 05:30 UTC — detrás de sync y websearch)
//
// POR QUÉ (12/08/2026). Un evento `previsto` esperaba a que Alberto lo pasara a `confirmado`
// desde un Telegram. Su respuesta al primer aviso: «esto tiene q ser automático, yo no sé de
// esta información». Y es verdad: saber si un festival anunciado en prensa se celebrará es
// rastreo, no algo que sepa el dueño de cuatro pisos. Peor: un previsto atascado NO es neutro —
// protege el suelo de esa noche y, desde la v2 del 09/08, sube el precio ponderado si la fecha
// está lejos. Nadie lo retiraba.
//
// Esta ruta hace ese trabajo: por cada previsto vivo reúne TRES señales independientes y decide
// (`lib/sivra/eventos-verificacion.ts`, puro y testeado). La regla que gobierna todo: «dato que
// no hay ≠ dato que no se ha mirado». Con la búsqueda caída no se descarta NADA — se anota, se
// reintenta mañana y el latido se pone en rojo.

/** Cuántos previstos se verifican por pasada (cada uno = una búsqueda de pago, ~0,02 €). */
const MAX_POR_PASADA = Math.max(1, Number(process.env.SIVRA_EVENTOS_VERIFICAR_MAX ?? 6) || 6)
/** Cada cuánto se re-verifica un previsto que está lejos de su fecha. */
const REVERIFICAR_DIAS = Math.max(1, Number(process.env.SIVRA_EVENTOS_REVERIFICAR_DIAS ?? 7) || 7)
/** Factor a partir del cual una auto-confirmación se canta por Telegram (pelotazo). */
const PELOTAZO = Number(process.env.SIVRA_EVENTOS_PELOTAZO ?? 1.4) || 1.4
/** Presupuesto de tiempo de la pasada: se corta y se vuelve con lo hecho. */
const PRESUPUESTO_MS = 240_000

type FilaPrevisto = {
  id: bigint
  rate_date: string
  nombre: string
  fuente: string
  tipo: string | null
  aforo: number | null
  factor: number
  confianza: number | null
  evidencia: string | null
  verificaciones: number
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const t0 = Date.now()
  const quedaTiempo = () => Date.now() - t0 < PRESUPUESTO_MS

  if (!busquedaConfigurada()) {
    // `ok:false` a propósito: sin búsqueda no hay verificación, y un 200 alegre dejaría los
    // previstos eternos exactamente igual que antes, pero sin que nadie se enterara.
    await registrarLatido(
      'sivra_eventos_verificar', false,
      'búsqueda web sin configurar (ni GEMINI_API_KEY ni OPENROUTER_API_KEY): NADA se verifica',
    ).catch(() => {})
    return NextResponse.json({
      ok: false, configured: false,
      message: "Sin búsqueda web configurada — los previstos no se pueden verificar solos.",
    })
  }

  // Latido de INTENTO: si la ruta muere a mitad, la huella dice que se intentó (y `ultimo_ok_at`
  // se queda atrás), en vez de parecer que el cron no se dispara.
  await registrarLatido('sivra_eventos_verificar', false, 'pasada en curso…').catch(() => {})

  const hoy = new Date()
  const fin = new Date(hoy.getTime() + PRICING_HORIZON_DAYS * 86400000)
  const desde = hoy.toISOString().slice(0, 10)
  const hasta = fin.toISOString().slice(0, 10)

  const resumen: ResumenVerificacion = {
    revisados: 0, confirmados: 0, descartados: 0, reubicados: 0, sinVerificar: 0, errores: [],
  }
  const decisiones: { fecha: string; nombre: string; veredicto: string; motivo: string }[] = []
  const pelotazos: string[] = []

  // ── Cola: previstos vigentes que NO haya decidido Alberto a mano ────────────────────────────
  // Orden: primero los nunca verificados, luego los más antiguos. Los que están en zona de
  // caducidad (≤21 días) entran a diario; el resto, cada `REVERIFICAR_DIAS`.
  let cola: FilaPrevisto[] = []
  try {
    cola = await prisma.$queryRaw<FilaPrevisto[]>(Prisma.sql`
      SELECT id, rate_date::text AS rate_date, nombre, fuente, tipo, aforo::int AS aforo,
             factor::float8 AS factor, confianza::float8 AS confianza, evidencia,
             COALESCE(verificaciones, 0)::int AS verificaciones
      FROM pricing_eventos_auto
      WHERE estado = 'previsto'
        AND rate_date >= CURRENT_DATE
        AND COALESCE(decidido_por, '') <> 'alberto'
        AND (
          verificado_at IS NULL
          OR rate_date <= CURRENT_DATE + (${DIAS_CADUCIDAD}::int * INTERVAL '1 day')
          OR verificado_at < now() - (${REVERIFICAR_DIAS}::int * INTERVAL '1 day')
        )
      ORDER BY verificado_at ASC NULLS FIRST, rate_date ASC
      LIMIT ${MAX_POR_PASADA}
    `)
  } catch (e) {
    resumen.errores.push(`cola: ${String(e).slice(0, 140)}`)
  }

  if (!cola.length) {
    const detalle = detalleVerificacion(resumen)
    await registrarLatido('sivra_eventos_verificar', verificacionFiable(resumen), detalle).catch(() => {})
    return NextResponse.json({ ok: resumen.errores.length === 0, configured: true, ...resumen })
  }

  const fechas = [...new Set(cola.map(f => f.rate_date))]
  const [confirmadosPorFecha, mercadoPorFecha] = await Promise.all([
    leerConfirmadosDeEsasFechas(fechas, resumen),
    leerMercadoDeEsasFechas(fechas, resumen),
  ])

  for (const ev of cola) {
    resumen.revisados++

    // 1. Fuente DURA: ¿hay ya una fila confirmada del MISMO evento en esa fecha?
    const hermanos = confirmadosPorFecha.get(ev.rate_date) ?? []
    const hermano = hermanos.find(h => nombresParecidos(ev.nombre, h.nombre))

    // 2. PRENSA: solo si hace falta (si ya hay fuente dura, no se gasta una búsqueda) y si queda
    //    presupuesto de tiempo.
    let prensa: SenalPrensa = { veredicto: 'no_verificable' }
    if (!hermano) {
      prensa = quedaTiempo()
        ? await preguntarPrensa(ev, resumen)
        : { veredicto: 'no_verificable' }
    }

    // 3. MERCADO: lo que ya cotiza esa noche.
    const mercado = senalMercado(mercadoPorFecha.get(ev.rate_date) ?? [])

    const diasVista = Math.round(
      (new Date(ev.rate_date + 'T00:00:00Z').getTime() - new Date(desde + 'T00:00:00Z').getTime()) / 86400000,
    )
    const d = decidirVerificacion(
      { corrobora: Boolean(hermano), fuente: hermano?.fuente },
      prensa,
      mercado,
      { diasVista, verificacionesPrevias: ev.verificaciones, fecha: ev.rate_date, desde, hasta },
    )

    if (!d.util) resumen.sinVerificar++
    try {
      await guardarDecision(ev, d)
      if (d.estado === 'confirmado') {
        resumen.confirmados++
        if (Number(ev.factor) >= PELOTAZO) {
          pelotazos.push(`• *${ev.rate_date}* — ${ev.nombre} (x${ev.factor})\n  _${d.motivo}_`)
        }
      }
      if (d.estado === 'descartado') resumen.descartados++
      if (d.reubicarA) {
        await reubicar(ev, d.reubicarA, d.reubicarComo ?? 'previsto', prensa)
        resumen.reubicados++
      }
      if (d.estado) decisiones.push({ fecha: ev.rate_date, nombre: ev.nombre, veredicto: d.veredicto, motivo: d.motivo })
    } catch (e) {
      resumen.errores.push(`guardar ${ev.rate_date}: ${String(e).slice(0, 120)}`)
    }

    if (!quedaTiempo()) break
  }

  const detalle = detalleVerificacion(resumen)
  await registrarLatido('sivra_eventos_verificar', verificacionFiable(resumen), detalle).catch(() => {})

  // Telegram SOLO para el pelotazo auto-confirmado (decisión de Alberto: silencio salvo
  // problema). Lo demás vive en la BD y en el latido; no hay nada que él tenga que hacer.
  if (pelotazos.length) {
    await tgSend(
      `🎯 *Evento confirmado solo* (ya tarifica al factor pleno)\n\n${pelotazos.join('\n\n')}\n\n` +
      `_No tienes que hacer nada: lo ha verificado el sistema contra fuentes independientes._`,
    ).catch(() => {})
  }

  return NextResponse.json({
    ok: resumen.errores.length === 0, configured: true, ...resumen, decisiones, detalle,
  })
}

// ── Señal 1: otras filas ya CONFIRMADAS en la misma fecha ─────────────────────────────────────
async function leerConfirmadosDeEsasFechas(
  fechas: string[], resumen: ResumenVerificacion,
): Promise<Map<string, { nombre: string; fuente: string }[]>> {
  const mapa = new Map<string, { nombre: string; fuente: string }[]>()
  if (!fechas.length) return mapa
  try {
    const filas = await prisma.$queryRaw<{ rate_date: string; nombre: string; fuente: string }[]>(Prisma.sql`
      SELECT rate_date::text AS rate_date, nombre, fuente
      FROM pricing_eventos_auto
      WHERE estado = 'confirmado'
        AND rate_date IN (${Prisma.join(fechas.map(f => Prisma.sql`${f}::date`))})
    `)
    for (const f of filas) {
      const lista = mapa.get(f.rate_date) ?? []
      lista.push({ nombre: f.nombre, fuente: f.fuente })
      mapa.set(f.rate_date, lista)
    }
  } catch (e) {
    // Que falle NO puede leerse como «no hay confirmados»: se anota y la pasada queda marcada.
    resumen.errores.push(`fuente dura ilegible: ${String(e).slice(0, 120)}`)
  }
  return mapa
}

// ── Señal 3: ¿el mercado ya cotiza esa noche por encima de su mes? ────────────────────────────
//
// Solo comps FIABLES (`booking_mcp`/`manual`): los de Serper son precios de anuncio SIN fecha, así
// que compararlos entre fechas mide ruido, no temporada (landmine del 06/08/2026). La línea del
// mes excluye las noches con evento conocido — si no, un evento se compararía consigo mismo.
async function leerMercadoDeEsasFechas(
  fechas: string[], resumen: ResumenVerificacion,
): Promise<Map<string, FilaMercado[]>> {
  const mapa = new Map<string, FilaMercado[]>()
  if (!fechas.length) return mapa
  try {
    const filas = await prisma.$queryRaw<{
      fecha: string; scenario: string; p50_fecha: number; comps_fecha: number
      p50_base: number | null; fechas_base: number
    }[]>(Prisma.sql`
      WITH fiables AS (
        SELECT scenario, checkin_date, price_night
        FROM market_rates
        WHERE fuente IN ('booking_mcp', 'manual')
          AND COALESCE(corpus_clonado, false) = false
          AND price_night > 0
          AND scenario LIKE 'prop_%'
          AND search_date >= CURRENT_DATE - INTERVAL '120 days'
      ),
      fecha AS (
        SELECT scenario, checkin_date,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night) AS p50,
               COUNT(*)::int AS comps
        FROM fiables
        WHERE checkin_date IN (${Prisma.join(fechas.map(f => Prisma.sql`${f}::date`))})
        GROUP BY scenario, checkin_date
      ),
      base AS (
        SELECT f.scenario, date_trunc('month', f.checkin_date) AS mes,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY f.price_night) AS p50,
               COUNT(DISTINCT f.checkin_date)::int AS fechas
        FROM fiables f
        WHERE NOT EXISTS (
          SELECT 1 FROM pricing_eventos_auto e
          WHERE e.rate_date = f.checkin_date AND e.estado <> 'descartado' AND e.factor >= 1.15
        )
        GROUP BY 1, 2
      )
      SELECT fe.checkin_date::text AS fecha, fe.scenario,
             fe.p50::float8 AS p50_fecha, fe.comps AS comps_fecha,
             b.p50::float8 AS p50_base, COALESCE(b.fechas, 0) AS fechas_base
      FROM fecha fe
      LEFT JOIN base b
        ON b.scenario = fe.scenario AND b.mes = date_trunc('month', fe.checkin_date)
    `)
    for (const f of filas) {
      const lista = mapa.get(f.fecha) ?? []
      lista.push({
        scenario: f.scenario,
        p50Fecha: Number(f.p50_fecha),
        compsFecha: Number(f.comps_fecha),
        p50Base: f.p50_base == null ? null : Number(f.p50_base),
        fechasBase: Number(f.fechas_base),
      })
      mapa.set(f.fecha, lista)
    }
  } catch (e) {
    // Nunca decide nada por sí sola, así que un fallo aquí solo degrada: queda como `sin_datos`.
    resumen.errores.push(`mercado ilegible: ${String(e).slice(0, 120)}`)
  }
  return mapa
}

// ── Señal 2: la búsqueda dirigida sobre ESE evento ────────────────────────────────────────────
async function preguntarPrensa(ev: FilaPrevisto, resumen: ResumenVerificacion): Promise<SenalPrensa> {
  const prompt = `Verifica el estado REAL de este evento en Sevilla (España):

  Evento: "${ev.nombre}"
  Fecha registrada: ${ev.rate_date}
  Lo que se sabía cuando se anotó: ${ev.evidencia || 'una noticia de prensa, sin más detalle'}

Busca en noticias recientes y fuentes oficiales (organizador, recinto, federación, plataformas de venta de entradas) y responde SOLO a esto:
1. ¿Está CONFIRMADO con fecha oficial y/o entradas a la venta?
2. ¿Se ha CANCELADO, se ha trasladado a otra ciudad, o resultó ser falso?
3. Si la fecha real es OTRA, ¿cuál?

Reglas importantes:
- Si buscas y no encuentras nada nuevo, responde "sin_informacion". NO inventes confirmaciones.
- Usa "confirmado" solo con fecha oficial o entradas a la venta, no con un "está previsto que".
- Usa "desmentido" solo con una fuente que diga que no se celebra en Sevilla en esas fechas.
- Cita SIEMPRE la evidencia (medio + titular, u organizador).

Responde SOLO con JSON válido sin markdown:
{"veredicto":"confirmado|sigue_previsto|desmentido|sin_informacion","fecha_real":"YYYY-MM-DD o null","entradas_a_la_venta":true,"confianza":0.85,"evidencia":"Medio — titular"}`

  try {
    const res = await buscarWeb("", prompt, {
      app: "sivra", endpoint: "eventos-verificar", maxTokens: 1024, timeoutMs: 30_000,
    })
    let json: any
    try {
      json = JSON.parse(res.text.replace(/```json|```/g, "").trim())
    } catch {
      // Respondió pero no se entiende: eso es «no he podido leer», no «no hay nada».
      resumen.errores.push(`${ev.rate_date}: JSON de ${res.proveedor} no parseable`)
      return { veredicto: 'no_verificable' }
    }
    const v = String(json?.veredicto ?? '').trim().toLowerCase()
    const conocido: VeredictoPrensa[] = ['confirmado', 'sigue_previsto', 'desmentido', 'sin_informacion']
    if (!conocido.includes(v as VeredictoPrensa)) return { veredicto: 'no_verificable' }
    const fechaReal = typeof json?.fecha_real === 'string' ? json.fecha_real.trim() : null
    return {
      veredicto: v as VeredictoPrensa,
      confianza: Number.isFinite(Number(json?.confianza)) ? Number(json.confianza) : null,
      evidencia: String(json?.evidencia ?? '').trim().slice(0, 300) || null,
      fechaConfirmada: fechaReal && /^\d{4}-\d{2}-\d{2}$/.test(fechaReal) ? fechaReal : null,
    }
  } catch (e) {
    // Búsqueda caída / presupuesto agotado. Se anota y se reintenta mañana: NO se decide.
    resumen.errores.push(`${ev.rate_date}: búsqueda ${String(e).slice(0, 90)}`)
    return { veredicto: 'no_verificable' }
  }
}

// ── Escritura ─────────────────────────────────────────────────────────────────────────────────
async function guardarDecision(
  ev: FilaPrevisto,
  d: { estado: string | null; confianza?: number | null; veredicto: string; motivo: string; util: boolean },
): Promise<void> {
  // `verificado_ok_at` y `verificaciones` SOLO se mueven cuando la pasada pudo mirar de verdad:
  // son lo que autoriza a caducar un previsto más adelante.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE pricing_eventos_auto SET
      estado = COALESCE(${d.estado}::text, estado),
      confianza = COALESCE(${d.confianza ?? null}::numeric, confianza),
      evidencia = CASE WHEN ${d.estado}::text IS NULL THEN evidencia
                       ELSE left(${d.motivo}, 500) END,
      veredicto = ${d.veredicto}::text,
      verificado_at = now(),
      verificado_ok_at = CASE WHEN ${d.util}::boolean THEN now() ELSE verificado_ok_at END,
      verificaciones = verificaciones + CASE WHEN ${d.util}::boolean THEN 1 ELSE 0 END,
      decidido_por = CASE WHEN ${d.estado}::text IS NULL THEN decidido_por ELSE 'auto' END,
      updated_at = now()
    WHERE id = ${ev.id}
  `)
}

/**
 * El evento existe, pero otro día. Se crea la fila en la fecha buena (idempotente) para no perder
 * la protección de esa noche; la vieja ya queda descartada por la decisión.
 */
async function reubicar(
  ev: FilaPrevisto, fecha: string, estado: string, prensa: SenalPrensa,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_eventos_auto
      (rate_date, nombre, fuente, tipo, aforo, factor, venue, raw, estado, confianza, evidencia,
       veredicto, verificado_at, verificado_ok_at, verificaciones, decidido_por, updated_at)
    VALUES (${fecha}::date, ${ev.nombre}, ${ev.fuente}, ${ev.tipo}, ${ev.aforo}::int,
      ${ev.factor}::numeric, NULL,
      ${JSON.stringify({ via: 'verificar', movidoDesde: ev.rate_date })}::jsonb,
      ${estado}::text, ${prensa.confianza ?? ev.confianza}::numeric,
      ${(prensa.evidencia || ev.evidencia || '').slice(0, 500)},
      'fecha_movida', now(), now(), 1, 'auto', now())
    ON CONFLICT (fuente, nombre, rate_date) DO UPDATE
      SET factor = EXCLUDED.factor, confianza = EXCLUDED.confianza,
          evidencia = EXCLUDED.evidencia, updated_at = now()
      -- Igual que en el descubrimiento: NO se pisa la columna estado. Si esa fecha ya estaba
      -- decidida (por Alberto o por una verificacion anterior), su decision manda.
      -- OJO: SQL dentro de un template literal de TS, aqui NO se pueden usar backticks.
  `)
}
