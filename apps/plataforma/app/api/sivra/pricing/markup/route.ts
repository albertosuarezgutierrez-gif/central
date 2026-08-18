import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { tgSend } from "@central/core-telegram"
import {
  markupMedido, desviacionMarkup, MIN_MUESTRAS_MARKUP,
  type MuestraEscaparate,
} from "@/lib/sivra/pricing-markup"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/pricing/markup   (cron diario · o sesión de admin)
//
// ¿El markup de canal que SUPONE el motor es el que ve el huésped? El motor convierte el mercado
// medido (precio GUEST) en precio BASE de Smoobu dividiendo por `pricing_settings.channel_markup`;
// si ese divisor no describe la realidad, TODO el calendario del piso queda desplazado y en
// silencio, porque el motor cree que ha listado justo al mercado (el mismo fallo del ÷1,16 del
// 09/08/2026). Aquí se contrasta contra las mediciones reales del escaparate que va dejando la
// rutina de Booking en `pricing_escaparate` (ver `/api/sivra/mercado/ingest`).
//
// Medición fundacional (18/08/2026, House 26-28/12): base 1.393,50€/noche · escaparate 1.531,80€
// con 12 huéspedes (×1,10) y 1.384,62€ con ≤6 (×0,99), contra un `channel_markup` de 1,20.
//
// 🚨 NO aplica nada por su cuenta. Cambiar el markup mueve el precio de TODAS las fechas del piso a
// la vez, así que la escritura es un acto deliberado: `POST ?aplicar=true` (con CRON_SECRET o
// sesión), acotada a `MAX_SALTO` por pasada. Sin mediciones dice `sin_datos` — nunca `ok`: un check
// que se pone verde porque no ha podido mirar es el fallo más caro que hay.

/** Días de mediciones que entran en la mediana. */
const VENTANA_DIAS = 30
/** Cuánto puede moverse el markup en una sola aplicación (un salto grande mueve todo el calendario). */
const MAX_SALTO = 0.15

const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

type Fila = {
  property_id: string
  aforo_max: number
  configurado: number
  rate_date: string | null
  guests: number | null
  price_night: number | null
  base: number | null
}

async function medir() {
  // La base de esa noche sale de `rate_snapshots.price_pricelabs` — que PESE AL NOMBRE es el precio
  // real vivo en Smoobu (ver el COMMENT de la columna, migración 2026-08-18). Se coge el snapshot
  // más cercano al día en que se midió el escaparate: comparar contra el precio de hoy un
  // escaparate de hace tres semanas mediría el movimiento del motor, no el markup del canal.
  const filas = await prisma.$queryRaw<Fila[]>(Prisma.sql`
    SELECT s.property_id,
           COALESCE(z.max_guests, 4)::int              AS aforo_max,
           COALESCE(s.channel_markup, 1.16)::float8    AS configurado,
           e.rate_date::text                           AS rate_date,
           e.guests                                    AS guests,
           e.price_night                               AS price_night,
           snap.price_pricelabs                        AS base
    FROM pricing_settings s
    LEFT JOIN pricing_piso_zona z ON z.property_id = s.property_id
    LEFT JOIN pricing_escaparate e
      ON e.property_id = s.property_id
     AND e.medido_el >= CURRENT_DATE - ${VENTANA_DIAS}
    LEFT JOIN LATERAL (
      SELECT rs.price_pricelabs
      FROM rate_snapshots rs
      WHERE rs.property_id = e.property_id AND rs.rate_date = e.rate_date
        AND rs.price_pricelabs IS NOT NULL AND rs.snapshot_date <= e.medido_el
      ORDER BY rs.snapshot_date DESC
      LIMIT 1
    ) snap ON true
    ORDER BY s.property_id, e.rate_date`)

  const porPiso = new Map<string, { aforoMax: number; configurado: number; muestras: MuestraEscaparate[] }>()
  for (const f of filas) {
    const piso = porPiso.get(f.property_id) ?? {
      aforoMax: Number(f.aforo_max), configurado: Number(f.configurado), muestras: [],
    }
    if (f.rate_date && f.price_night != null) {
      piso.muestras.push({
        rateDate: f.rate_date,
        guests: Number(f.guests),
        precioEscaparate: Number(f.price_night),
        precioBase: f.base != null ? Number(f.base) : null,
      })
    }
    porPiso.set(f.property_id, piso)
  }

  return [...porPiso.entries()].map(([propertyId, p]) => {
    const medido = markupMedido(p.muestras, { aforoMax: p.aforoMax })
    const d = desviacionMarkup({ configurado: p.configurado, medido: medido.markup })
    return {
      property_id: propertyId,
      nombre: PROP_NAMES[propertyId] ?? propertyId,
      aforo_max: p.aforoMax,
      mediciones: p.muestras.length,
      ...medido,
      ...d,
    }
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const qs = req.nextUrl.searchParams.get("secret")
  const secretOk = !!secret && (bearer === secret || qs === secret)
  if (!secretOk && !(await getSession())) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const pisos = await medir()
  const desviados = pisos.filter(p => p.estado === "desviado")
  const sinDatos = pisos.filter(p => p.estado === "sin_datos")

  // Aviso deduplicado por piso+markup medido: mientras la desviación siga igual no se repite (el
  // canal de Telegram muere de éxito si repite lo mismo 3 veces al día — lección del 19/07/2026).
  if (desviados.length > 0 && secretOk) {
    try {
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM pricing_avisos WHERE enviado_at < now() - interval '7 days'`)
      const claves = desviados.map(p =>
        Prisma.sql`(${`markup:${p.property_id}:${p.medido}`}, now())`)
      const nuevas = await prisma.$queryRaw<{ clave: string }[]>(Prisma.sql`
        INSERT INTO pricing_avisos (clave, enviado_at) VALUES ${Prisma.join(claves)}
        ON CONFLICT (clave) DO NOTHING RETURNING clave`)
      if (nuevas.length > 0) {
        const nuevasSet = new Set(nuevas.map(n => n.clave))
        const lineas = desviados
          .filter(p => nuevasSet.has(`markup:${p.property_id}:${p.medido}`))
          .map(p => `• ${p.nombre}: configurado ×${p.configurado} · medido ×${p.medido} ` +
            `(${p.mediciones} med.) → listamos un ${Math.round((p.sesgo ?? 0) * 100)}% ` +
            `${(p.sesgo ?? 0) > 0 ? "POR DEBAJO" : "por encima"} del mercado medido`)
        if (lineas.length > 0) {
          await tgSend(
            `📐 *Pricing: el markup de canal no cuadra con el escaparate*\n\n` +
            lineas.join("\n") +
            `\n\n_El motor divide el mercado por el markup CONFIGURADO para fijar la base. ` +
            `Para alinearlo: POST /api/sivra/pricing/markup?aplicar=true_`)
        }
      }
    } catch { /* el aviso no puede tumbar la medición */ }
  }

  return NextResponse.json({
    ok: true,
    ventana_dias: VENTANA_DIAS,
    min_muestras: MIN_MUESTRAS_MARKUP,
    pisos,
    // Se declaran los huecos: «sin medir» no es «cuadra».
    sin_datos: sinDatos.map(p => p.property_id),
    desviados: desviados.map(p => p.property_id),
  })
}

// POST /api/sivra/pricing/markup?aplicar=true[&property=prop_x]
// Alinea `channel_markup` con lo medido, como mucho `MAX_SALTO` por pasada. Sin `aplicar` es un
// simulacro (devuelve lo que haría). Solo pisos con medición suficiente: un `sin_datos` NUNCA
// escribe — sería sustituir una suposición por otra.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const qs = req.nextUrl.searchParams.get("secret")
  const secretOk = !!secret && (bearer === secret || qs === secret)
  if (!secretOk && !(await getSession())) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const aplicar = req.nextUrl.searchParams.get("aplicar") === "true"
  const soloProp = req.nextUrl.searchParams.get("property")
  const pisos = (await medir()).filter(p => !soloProp || p.property_id === soloProp)

  const cambios: { property_id: string; de: number; a: number; medido: number }[] = []
  for (const p of pisos) {
    if (p.markup == null || p.estado !== "desviado") continue
    const tope = p.configurado * (1 + MAX_SALTO)
    const suelo = p.configurado * (1 - MAX_SALTO)
    const nuevo = Number(Math.min(tope, Math.max(suelo, p.markup)).toFixed(2))
    // Ojo: el markup NUNCA baja de 1 — sería declarar que el canal vende por debajo de la base y
    // el motor lo usa como divisor.
    if (nuevo < 1 || nuevo === Number(p.configurado.toFixed(2))) continue
    cambios.push({ property_id: p.property_id, de: p.configurado, a: nuevo, medido: p.markup })
  }

  if (aplicar) {
    for (const c of cambios) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE pricing_settings SET channel_markup = ${c.a}, updated_at = now()
        WHERE property_id = ${c.property_id}`)
    }
  }

  return NextResponse.json({ ok: true, aplicado: aplicar, max_salto: MAX_SALTO, cambios })
}
