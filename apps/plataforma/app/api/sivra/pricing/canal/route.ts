import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { tgSend } from "@central/core-telegram"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import { eur } from "@/lib/dinero"
import {
  ajusteCanal, desviacionCanal, pasoCanal, baseDesdeGuest,
  MIN_VENTANAS_CANAL, MAX_SALTO_CANAL,
  type VentanaEscaparate, type ParametrosCanal,
} from "@/lib/sivra/pricing-canal"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET /api/sivra/pricing/canal   (cron diario 07:45 UTC · o sesión de admin)
//
// MIDE la relación real entre nuestra base de Smoobu y lo que paga el huésped, y —salvo que el piso
// tenga el interruptor bajado— la APLICA él solo.
//
// POR QUÉ EXISTE (19/08/2026, reserva de House 21-25/12). El motor tarifica anclado al mercado: mide
// el precio GUEST de los comparables y lo convierte a precio BASE. Esa conversión era un ×1,20
// SUPUESTO que nadie había contrastado. Al medir el escaparate real de los cuatro pisos con el
// conector resultó que ni el número era ese ni el modelo: el canal aplica un multiplicador MENOR que
// 1 y le suma una CUOTA FIJA por estancia (la limpieza). Con la cuota fija, un «markup» escalar no
// existe — el mismo piso mide ×1,33 en 2 noches y ×1,18 en 3 sin que nada haya cambiado.
//
// 🚨 Y AHORA SE APLICA SOLO. La versión anterior solo avisaba por Telegram y esperaba a que alguien
// hiciera un POST. Eso es una corrección que depende de que un humano lea un mensaje: mientras nadie
// lo leyera, el motor seguía tarifando con el número equivocado — que es exactamente lo que pasó
// entre el 16 y el 19/08. Decisión de Alberto: la medición y la corrección son del agente.
// Los raíles que hacen que eso sea seguro:
//   · solo se escribe con ajuste `medido` (≥3 ventanas, R² ≥0,9 y recorrido de base suficiente
//     para separar multiplicador de cuota); cualquier otro estado NO escribe nada y se declara;
//   · el paso está ACOTADO por su EFECTO sobre el precio (`pasoCanal`, ±15% de base por pasada),
//     así que una medición mala cuesta un tramo y la pasada siguiente corrige;
//   · interruptor por piso (`pricing_settings.canal_auto`) y global (`SIVRA_CANAL_AUTO=0`);
//   · deja latido (`sivra_canal`): una pasada que no corre no puede parecer «todo cuadra».

/** Días de mediciones de escaparate que entran en el ajuste. */
const VENTANA_DIAS = 45

const PROP_NAMES: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

type FilaPiso = {
  property_id: string
  aforo_max: number
  markup_cfg: number
  cuota_cfg: number
  noches_cfg: number
  canal_auto: boolean
  noches_mediana: number | null
}

type FilaVentana = {
  property_id: string
  checkin: string
  noches: number
  guests: number
  precio_total: number
  base_total: number | null
}

export type MedicionCanal = {
  property_id: string
  nombre: string
  aforo_max: number
  noches_ref: number
  configurado: ParametrosCanal
  ventanas_totales: number
  markup: number | null
  cuota_fija: number | null
  muestras: number
  r2: number | null
  estado: string
  guest_ref: number | null
  sesgo: number | null
  desviacion: string
  canal_auto: boolean
}

async function medir(): Promise<{ pisos: MedicionCanal[]; ventanas: Map<string, VentanaEscaparate[]> }> {
  const pisos = await prisma.$queryRaw<FilaPiso[]>(Prisma.sql`
    SELECT s.property_id,
           COALESCE(z.max_guests, 4)::int           AS aforo_max,
           COALESCE(s.channel_markup, 1.20)::float8 AS markup_cfg,
           COALESCE(s.cuota_fija, 0)::float8        AS cuota_cfg,
           COALESCE(s.noches_ref, 2)::int           AS noches_cfg,
           COALESCE(s.canal_auto, true)             AS canal_auto,
           -- Estancia típica REAL del piso: entre esas noches se reparte la cuota fija. Mediana, no
           -- media: una reserva de 14 noches no puede decidir cómo se tarifa un fin de semana.
           (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY i.nights)
              FROM incomes i
             WHERE i."propertyId" = s.property_id AND i.nights > 0
               AND i.date >= CURRENT_DATE - 365)::int AS noches_mediana
    FROM pricing_settings s
    LEFT JOIN pricing_piso_zona z ON z.property_id = s.property_id
    ORDER BY s.property_id`)

  const medidas = await prisma.$queryRaw<FilaVentana[]>(Prisma.sql`
    SELECT property_id, checkin::text AS checkin, noches, guests, precio_total, base_total
    FROM pricing_escaparate
    WHERE medido_el >= CURRENT_DATE - ${VENTANA_DIAS}
    ORDER BY property_id, checkin`)

  const porPiso = new Map<string, VentanaEscaparate[]>()
  for (const v of medidas) {
    const lista = porPiso.get(v.property_id) ?? []
    lista.push({
      checkin: v.checkin,
      noches: Number(v.noches),
      guests: Number(v.guests),
      precioTotal: Number(v.precio_total),
      baseTotal: v.base_total != null ? Number(v.base_total) : null,
    })
    porPiso.set(v.property_id, lista)
  }

  const salida = pisos.map(p => {
    const todas = porPiso.get(p.property_id) ?? []
    const aforo = Number(p.aforo_max)
    const ajuste = ajusteCanal(todas, { aforo })
    // La estancia típica solo se toma del histórico si lo hay; si no, se conserva la guardada (que
    // por defecto es 2) en vez de inventar una duración con la que nunca se ha vendido nada.
    const nochesRef = Number(p.noches_mediana) > 0 ? Number(p.noches_mediana) : Number(p.noches_cfg)
    const configurado: ParametrosCanal = {
      markup: Number(p.markup_cfg), cuotaFija: Number(p.cuota_cfg), nochesRef,
    }
    // Precio de referencia = lo que de verdad cuesta una noche nuestra en el portal, en la mediana
    // de las ventanas del aforo medido. Con una cuota fija el sesgo NO es un porcentaje plano, así
    // que decir «nos desviamos un X%» sin decir a qué precio no significa nada.
    const delAforo = todas.filter(v => v.guests === aforo && v.noches > 0)
    const porNoche = delAforo.map(v => v.precioTotal / v.noches).sort((a, b) => a - b)
    const guestRef = porNoche.length ? Math.round(porNoche[Math.floor((porNoche.length - 1) / 2)]) : null
    const d = guestRef != null
      ? desviacionCanal({
          configurado,
          medido: ajuste.markup != null && ajuste.cuotaFija != null && ajuste.estado === "medido"
            ? { markup: ajuste.markup, cuotaFija: ajuste.cuotaFija }
            : null,
          guestRef,
        })
      : { estado: "sin_datos" as const, sesgo: null }
    return {
      property_id: p.property_id,
      nombre: PROP_NAMES[p.property_id] ?? p.property_id,
      aforo_max: aforo,
      noches_ref: nochesRef,
      configurado,
      ventanas_totales: todas.length,
      markup: ajuste.markup,
      cuota_fija: ajuste.cuotaFija,
      muestras: ajuste.muestras,
      r2: ajuste.r2,
      estado: ajuste.estado,
      guest_ref: guestRef,
      sesgo: d.sesgo,
      desviacion: d.estado,
      canal_auto: Boolean(p.canal_auto),
    }
  })

  return { pisos: salida, ventanas: porPiso }
}

/** Un cambio efectivamente escrito (o simulado) en `pricing_settings`. */
type Cambio = {
  property_id: string; nombre: string
  de: ParametrosCanal; a: ParametrosCanal
  medido: { markup: number; cuotaFija: number }
  guest_ref: number
  base_antes: number; base_despues: number
  efecto: number; topado: boolean
}

function cambiosDe(pisos: MedicionCanal[], soloProp: string | null, autoGlobal: boolean): {
  cambios: Cambio[]; frenados: { property_id: string; motivo: string }[]
} {
  const cambios: Cambio[] = []
  const frenados: { property_id: string; motivo: string }[] = []
  for (const p of pisos) {
    if (soloProp && p.property_id !== soloProp) continue
    if (p.estado !== "medido" || p.markup == null || p.cuota_fija == null || p.guest_ref == null) {
      // No es un «cuadra»: es un «no lo sé». Se declara, nunca se escribe.
      frenados.push({ property_id: p.property_id, motivo: `ajuste ${p.estado} (${p.muestras} ventanas)` })
      continue
    }
    if (p.desviacion === "ok") continue
    if (!autoGlobal) { frenados.push({ property_id: p.property_id, motivo: "SIVRA_CANAL_AUTO=0" }); continue }
    if (!p.canal_auto) { frenados.push({ property_id: p.property_id, motivo: "canal_auto=false en el piso" }); continue }

    const medido = { markup: p.markup, cuotaFija: p.cuota_fija }
    const paso = pasoCanal({ configurado: p.configurado, medido, guestRef: p.guest_ref })
    // `noches_ref` viaja SIEMPRE con la cuota, aunque el paso vaya topado: son las dos mitades del
    // mismo reparto y desparejarlas describiría un canal que no existe.
    const a: ParametrosCanal = { ...paso.aplicar, nochesRef: p.noches_ref }
    const baseAntes = baseDesdeGuest(p.guest_ref, p.configurado)
    const baseDespues = baseDesdeGuest(p.guest_ref, a)
    if (baseAntes === baseDespues && a.nochesRef === p.configurado.nochesRef) continue
    cambios.push({
      property_id: p.property_id, nombre: p.nombre,
      de: p.configurado, a, medido, guest_ref: p.guest_ref,
      base_antes: baseAntes, base_despues: baseDespues,
      efecto: paso.efecto, topado: paso.topado,
    })
  }
  return { cambios, frenados }
}

async function escribir(cambios: Cambio[]) {
  for (const c of cambios) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE pricing_settings
         SET channel_markup = ${c.a.markup}, cuota_fija = ${c.a.cuotaFija},
             noches_ref = ${c.a.nochesRef}, updated_at = now()
       WHERE property_id = ${c.property_id}`)
  }
}

function lineaCambio(c: Cambio): string {
  return `• ${c.nombre}: ×${c.de.markup.toFixed(3)}${c.de.cuotaFija > 0 ? ` +${eur(c.de.cuotaFija)}` : ""} → ` +
    `×${c.a.markup.toFixed(3)} +${eur(c.a.cuotaFija)}/estancia (÷${c.a.nochesRef} noches)\n` +
    `  base a ${eur(c.guest_ref)}/noche de escaparate: ${eur(c.base_antes)} → ${eur(c.base_despues)} ` +
    `(${c.efecto > 0 ? "+" : ""}${Math.round(c.efecto * 100)}%)${c.topado ? " · tramo acotado, sigue en la próxima pasada" : ""}`
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const qs = req.nextUrl.searchParams.get("secret")
  const secretOk = !!secret && (bearer === secret || qs === secret)
  if (!secretOk && !(await getSession())) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  // Desde una sesión de admin es un SIMULACRO salvo que se pida lo contrario: mirar la pantalla no
  // puede mover el precio de cuatro pisos sin querer. El cron sí aplica (es su trabajo).
  const simulacro = req.nextUrl.searchParams.get("simulacro") === "true" || !secretOk

  let pisos: MedicionCanal[] = []
  let cambios: Cambio[] = []
  let frenados: { property_id: string; motivo: string }[] = []
  try {
    const autoGlobal = process.env.SIVRA_CANAL_AUTO !== "0"
    const m = await medir()
    pisos = m.pisos
    const soloProp = req.nextUrl.searchParams.get("property")
    const r = cambiosDe(pisos, soloProp, autoGlobal)
    cambios = r.cambios; frenados = r.frenados
    if (!simulacro && cambios.length > 0) await escribir(cambios)
  } catch (e) {
    // Una pasada que revienta NO puede quedar como silencio: sin latido en rojo, «hoy no cambió
    // nada» y «hoy no se pudo mirar» son el mismo parte.
    await registrarLatido("sivra_canal", false, `error: ${String(e).slice(0, 160)}`)
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 })
  }

  const sinMedir = pisos.filter(p => p.estado !== "medido")
  const detalle =
    `${pisos.length} pisos · ${cambios.length} ajustados` +
    (sinMedir.length ? ` · ${sinMedir.length} sin ajuste fiable (${sinMedir.map(p => p.estado).join(",")})` : "") +
    (simulacro ? " · SIMULACRO" : "")
  // La pasada es BUENA si ha podido juzgar a todos los pisos. Un piso sin ventanas suficientes no
  // es un fallo del cron —es un hueco de medición— pero tampoco es «todo cuadra»: por eso el latido
  // se pone en rojo cuando NINGÚN piso tiene ajuste, que es la señal de que el escaparate no se
  // está midiendo y el motor lleva días dividiendo por un número viejo.
  await registrarLatido("sivra_canal", pisos.length > 0 && sinMedir.length < pisos.length, detalle)

  if (!simulacro && cambios.length > 0) {
    try {
      await tgSend(
        `📐 *Canal Booking recalibrado* (medido en el escaparate, aplicado solo)\n\n` +
        cambios.map(lineaCambio).join("\n") +
        `\n\n_El motor convierte mercado→base con estos parámetros. Para congelar un piso: ` +
        `\`canal_auto=false\` en pricing\\_settings._`)
    } catch { /* el aviso no puede tumbar la aplicación */ }
  }

  return NextResponse.json({
    ok: true,
    simulacro,
    ventana_dias: VENTANA_DIAS,
    min_ventanas: MIN_VENTANAS_CANAL,
    max_salto: MAX_SALTO_CANAL,
    pisos,
    cambios,
    // Se declaran los huecos: «sin ajuste fiable» no es «cuadra», y un piso frenado por su
    // interruptor tiene que verse (si no, un `canal_auto=false` olvidado es invisible para siempre).
    frenados,
    sin_ajuste: sinMedir.map(p => ({ property_id: p.property_id, estado: p.estado, ventanas: p.ventanas_totales })),
  })
}
