import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { tgSend } from "@central/core-telegram"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"
import { eur } from "@/lib/dinero"
import {
  ajusteCanal, desviacionCanal, pasoCanal, baseDesdeGuest, validarCanal,
  MIN_VENTANAS_CANAL, MAX_SALTO_CANAL,
  type VentanaEscaparate, type ParametrosCanal, type ValidacionCanal,
} from "@/lib/sivra/pricing-canal"
import { precioHuesped, baseDondeLaCuotaMandaya, type ResumenHuesped } from "@/lib/sivra/pricing-precio-huesped"

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
/**
 * Portal cuyo escaparate calibra el motor. Es UNO a propósito: cada canal tiene su comisión y su
 * política de limpieza, así que mezclarlos daría una recta que no describe a ninguno. Booking es
 * el 92-99% del ingreso bruto de los cuatro pisos (medido sobre `incomes`, 12 meses, 19/08/2026),
 * y la base de Smoobu es ÚNICA para todos los canales: los demás heredan esta conversión sin haber
 * sido medidos. El hueco se declara en `cobertura_canales` con el % de ingreso que representa —
 * hoy Airbnb es el 1,0% de House y el 2,1% de Luxury, y por eso NO se trata como una avería.
 */
const PORTAL_CANAL = "booking"

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
  portal: string
  /** null = ventana NUEVA: es la única que puede validar fuera de muestra la recta vigente */
  usada: Date | null
  id: number
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
  /** ¿acierta la recta VIGENTE en las ventanas que no usó para ajustarse? */
  validacion: ValidacionCanal
  /** ids de las ventanas que entran en el ajuste de esta pasada (se marcan al escribir) */
  ventanas_usadas: number[]
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
    SELECT id, property_id, checkin::text AS checkin, noches, guests, precio_total, base_total,
           portal, usada_en_ajuste_at AS usada
    FROM pricing_escaparate
    -- ::int OBLIGATORIO: Prisma manda los números de JS como bigint y Postgres no tiene el
    -- operador date - bigint → 42883, y la pasada moría antes de medir nada (19-20/08/2026).
    WHERE medido_el >= CURRENT_DATE - ${VENTANA_DIAS}::int
    ORDER BY property_id, checkin`)

  type VentanaConId = VentanaEscaparate & { id: number; usada: boolean }
  const porPiso = new Map<string, VentanaConId[]>()
  for (const v of medidas) {
    const lista = porPiso.get(v.property_id) ?? []
    lista.push({
      id: Number(v.id),
      checkin: v.checkin,
      noches: Number(v.noches),
      guests: Number(v.guests),
      precioTotal: Number(v.precio_total),
      baseTotal: v.base_total != null ? Number(v.base_total) : null,
      portal: String(v.portal ?? PORTAL_CANAL),
      usada: v.usada != null,
    })
    porPiso.set(v.property_id, lista)
  }

  const salida = pisos.map(p => {
    const todas = porPiso.get(p.property_id) ?? []
    const aforo = Number(p.aforo_max)
    const ajuste = ajusteCanal(todas, { aforo, portal: PORTAL_CANAL })
    // 🚨 La validación va ANTES de reajustar y con los parámetros VIGENTES: si se hiciera después,
    // se estaría comprobando la recta contra las mismas ventanas que acaban de producirla, que es
    // justo el círculo que este control existe para romper.
    const validacion = validarCanal(
      todas.filter(v => !v.usada && v.portal === PORTAL_CANAL),
      { markup: Number(p.markup_cfg), cuotaFija: Number(p.cuota_cfg) },
      { aforo })
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
      validacion,
      ventanas_usadas: ajuste.estado === "medido"
        ? todas.filter(v => v.guests === aforo && v.portal === PORTAL_CANAL && v.baseTotal != null).map(v => v.id)
        : [],
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

/**
 * Marca las ventanas que han entrado en un ajuste. A partir de aquí ya NO pueden validar nada: el
 * modelo las ha visto. Las que queden a NULL son la muestra limpia de la pasada siguiente.
 */
async function marcarUsadas(ids: number[]) {
  if (!ids.length) return
  await prisma.$executeRaw(Prisma.sql`
    UPDATE pricing_escaparate SET usada_en_ajuste_at = now()
     WHERE id IN (${Prisma.join(ids)}) AND usada_en_ajuste_at IS NULL`)
}

/** Peso de cada canal en el ingreso REAL del piso. Convierte «no medimos X» en euros. */
type Canal = { property_id: string; portal: string; pct: number; bruto: number }

async function coberturaCanales(): Promise<{
  canales: Canal[]; sinMedir: { property_id: string; portal: string; pct: number }[]
}> {
  const filas = await prisma.$queryRaw<{ property_id: string; portal: string; pct: number; bruto: number }[]>(Prisma.sql`
    SELECT "propertyId" AS property_id, COALESCE(portal, 'OTRO') AS portal,
           ROUND(SUM(amount_gross)::numeric)::float8 AS bruto,
           ROUND(100 * SUM(amount_gross)::numeric
                 / NULLIF(SUM(SUM(amount_gross)::numeric) OVER (PARTITION BY "propertyId"), 0), 1)::float8 AS pct
    FROM incomes
    WHERE date >= CURRENT_DATE - 365 AND amount_gross > 0 AND "propertyId" LIKE 'prop_%'
    GROUP BY 1, 2`)
  const canales = filas.map(f => ({
    property_id: f.property_id, portal: String(f.portal).toLowerCase(),
    pct: Number(f.pct), bruto: Number(f.bruto),
  }))
  // Todo canal que NO es el medido hereda la conversión sin haber sido contrastado. No es una
  // avería —Booking es el 92-99%— pero tiene que estar CONTADO, no supuesto: si Airbnb creciera,
  // este número crece con él y el hueco deja de ser despreciable solo.
  return {
    canales,
    sinMedir: canales
      .filter(c => c.portal !== PORTAL_CANAL && c.pct > 0)
      .map(c => ({ property_id: c.property_id, portal: c.portal, pct: c.pct }))
      .sort((a, b) => b.pct - a.pct),
  }
}

/**
 * ¿Qué ve el HUÉSPED en las fechas ya tarifadas? El motor razona en base y con una cuota fija eso
 * deja de describir el precio real (ver `pricing-precio-huesped.ts`). Se cruza la base viva con la
 * mediana de mercado del mes de cada fecha —solo corpus fiable— y se juzga en la unidad correcta.
 */
async function centinelaHuesped(pisos: MedicionCanal[]): Promise<Map<string, ResumenHuesped>> {
  const filas = await prisma.$queryRaw<{ property_id: string; fecha: string; base: number; med: number | null }[]>(Prisma.sql`
    WITH base AS (
      SELECT property_id, rate_date, price_pricelabs AS base
      FROM rate_snapshots
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
        AND rate_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 180
        AND price_pricelabs IS NOT NULL AND available = 1
    ),
    mkt AS (
      SELECT scenario, to_char(checkin_date, 'YYYY-MM') AS ym,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night)::float8 AS med
      FROM market_rates
      WHERE fuente IN ('booking_mcp', 'manual') AND price_night > 0
        AND checkin_date >= CURRENT_DATE AND search_date >= CURRENT_DATE - 120
      GROUP BY 1, 2
    )
    SELECT b.property_id, b.rate_date::text AS fecha, b.base, m.med
    FROM base b
    LEFT JOIN mkt m ON m.scenario = b.property_id AND m.ym = to_char(b.rate_date, 'YYYY-MM')
    ORDER BY b.property_id, b.rate_date`)

  const porPiso = new Map<string, { fecha: string; baseAplicada: number; medMercadoGuest: number | null }[]>()
  for (const f of filas) {
    const l = porPiso.get(f.property_id) ?? []
    l.push({ fecha: f.fecha, baseAplicada: Number(f.base), medMercadoGuest: f.med != null ? Number(f.med) : null })
    porPiso.set(f.property_id, l)
  }
  const salida = new Map<string, ResumenHuesped>()
  for (const p of pisos) {
    const fechas = porPiso.get(p.property_id)
    if (!fechas?.length) continue
    salida.set(p.property_id, precioHuesped(fechas, p.configurado))
  }
  return salida
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
  let huesped = new Map<string, ResumenHuesped>()
  let canales: { canales: Canal[]; sinMedir: { property_id: string; portal: string; pct: number }[] } =
    { canales: [], sinMedir: [] }
  const avisosCentinela: string[] = []
  try {
    const autoGlobal = process.env.SIVRA_CANAL_AUTO !== "0"
    const m = await medir()
    pisos = m.pisos
    const soloProp = req.nextUrl.searchParams.get("property")
    const r = cambiosDe(pisos, soloProp, autoGlobal)
    cambios = r.cambios; frenados = r.frenados
    if (!simulacro && cambios.length > 0) await escribir(cambios)
    // Las ventanas se marcan DESPUÉS de escribir y solo las de los pisos que se han ajustado: si se
    // marcaran siempre, una pasada que no ajustó nada quemaría la muestra limpia de la siguiente.
    if (!simulacro) {
      const usadas = pisos.filter(p => p.estado === "medido").flatMap(p => p.ventanas_usadas)
      await marcarUsadas(usadas)
    }
    // Los dos centinelas van en su propio try: son vigilancia, no pueden tumbar la corrección.
    try { huesped = await centinelaHuesped(pisos) } catch (e) {
      avisosCentinela.push(`centinela del precio al huésped ilegible (${String(e).slice(0, 60)}): esta pasada NO lo ha mirado`)
    }
    try { canales = await coberturaCanales() } catch (e) {
      avisosCentinela.push(`cobertura de canales ilegible (${String(e).slice(0, 60)}): no se sabe qué peso tiene lo no medido`)
    }
  } catch (e) {
    // Una pasada que revienta NO puede quedar como silencio: sin latido en rojo, «hoy no cambió
    // nada» y «hoy no se pudo mirar» son el mismo parte.
    await registrarLatido("sivra_canal", false, `error: ${String(e).slice(0, 160)}`)
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 })
  }

  const sinMedir = pisos.filter(p => p.estado !== "medido")
  const desviados = pisos.filter(p => p.validacion.estado === "desviado")
  const sinValidar = pisos.filter(p => p.validacion.estado === "sin_muestras")
  const caros = [...huesped.entries()].filter(([, h]) => h.caras > 0)

  const detalle =
    `${pisos.length} pisos · ${cambios.length} ajustados` +
    (sinMedir.length ? ` · ${sinMedir.length} sin ajuste fiable (${sinMedir.map(p => p.estado).join(",")})` : "") +
    ` · validación: ${pisos.length - desviados.length - sinValidar.length} ok, ${desviados.length} desviados, ` +
    `${sinValidar.length} sin ventanas nuevas` +
    (caros.length ? ` · 🏷️ ${caros.reduce((a, [, h]) => a + h.caras, 0)} fechas listadas caras al huésped` : "") +
    (avisosCentinela.length ? ` · ⚠️ ${avisosCentinela.length} centinela(s) sin poder mirar` : "") +
    (simulacro ? " · SIMULACRO" : "")

  // La pasada es BUENA si ha podido juzgar a todos los pisos. Un piso sin ventanas suficientes no
  // es un fallo del cron —es un hueco de medición— pero tampoco es «todo cuadra»: por eso el latido
  // se pone en rojo cuando NINGÚN piso tiene ajuste, que es la señal de que el escaparate no se
  // está midiendo y el motor lleva días dividiendo por un número viejo. Un centinela que no ha
  // podido mirar también lo pone en rojo: su silencio no es un parte de buena salud.
  await registrarLatido(
    "sivra_canal",
    pisos.length > 0 && sinMedir.length < pisos.length && avisosCentinela.length === 0,
    detalle)

  if (!simulacro) {
    const bloques: string[] = []
    if (cambios.length > 0) {
      bloques.push(
        `📐 *Canal Booking recalibrado* (medido en el escaparate, aplicado solo)\n\n` +
        cambios.map(lineaCambio).join("\n"))
    }
    // 🚨 El modelo FALLANDO en ventanas nuevas es más grave que un parámetro desfasado: significa
    // que la recta ya no describe al portal y que reajustarla volvería a dar un R² inmejorable
    // sobre un modelo equivocado. Va siempre, aunque no se haya cambiado nada.
    if (desviados.length > 0) {
      bloques.push(
        `🎯 *La recta del canal NO acierta fuera de muestra*\n\n` +
        desviados.map(p =>
          `• ${p.nombre}: ${p.validacion.muestras} ventana(s) nueva(s), error medio ` +
          `${Math.round((p.validacion.errorMedio ?? 0) * 100)}% y sesgo ` +
          `${(p.validacion.sesgo ?? 0) > 0 ? "+" : ""}${Math.round((p.validacion.sesgo ?? 0) * 100)}% ` +
          `(${(p.validacion.sesgo ?? 0) > 0 ? "el portal cobra MÁS de lo que predecimos" : "cobra menos"})`).join("\n") +
          `\n\n_Si el sesgo persiste, el portal ha cambiado su política: el ajuste se recalibrará solo, ` +
          `pero conviene mirar la extranet antes de fiarse del número nuevo._`)
    }
    // El punto ciego del motor: razona en base, el huésped paga base × markup + cuota fija.
    if (caros.length > 0) {
      bloques.push(
        `🏷️ *Precio al HUÉSPED por encima del mercado en fechas ya tarifadas*\n\n` +
        caros.map(([id, h]) => {
          const piso = pisos.find(p => p.property_id === id)
          const suelo = piso ? baseDondeLaCuotaMandaya(piso.configurado) : null
          return `• ${piso?.nombre ?? id}: ${h.caras} fecha(s) · peor ${h.peores[0]?.fecha} ` +
            `${eur(h.peores[0]?.guest ?? 0)}/noche contra ${eur(h.peores[0]?.medMercadoGuest ?? 0)} de mercado ` +
            `(×${h.peores[0]?.ratio})` +
            (suelo ? `\n  Por debajo de ${eur(suelo)} de base, la cuota fija ya es la mitad de lo que paga el ` +
              `huésped: bajar más NO abarata la noche, hay que tocar otra palanca (mín. de noches, oferta del portal).` : "")
        }).join("\n"))
    }
    if (avisosCentinela.length > 0) {
      bloques.push(`⚠️ *Sin poder comprobar* — esto NO es «todo bien»\n\n` +
        avisosCentinela.map(a => `• ${a}`).join("\n"))
    }
    if (bloques.length > 0) {
      try {
        await tgSend(bloques.join("\n\n") +
          `\n\n_Para congelar el calibrado de un piso: \`canal_auto=false\` en pricing\\_settings._`)
      } catch { /* el aviso no puede tumbar la aplicación */ }
    }
  }

  return NextResponse.json({
    ok: true,
    simulacro,
    ventana_dias: VENTANA_DIAS,
    min_ventanas: MIN_VENTANAS_CANAL,
    max_salto: MAX_SALTO_CANAL,
    portal_medido: PORTAL_CANAL,
    pisos,
    cambios,
    // Se declaran los huecos: «sin ajuste fiable» no es «cuadra», y un piso frenado por su
    // interruptor tiene que verse (si no, un `canal_auto=false` olvidado es invisible para siempre).
    frenados,
    sin_ajuste: sinMedir.map(p => ({ property_id: p.property_id, estado: p.estado, ventanas: p.ventanas_totales })),
    // Validación FUERA de muestra: lo único que puede decir que el modelo sigue siendo válido.
    validacion: pisos.map(p => ({ property_id: p.property_id, ...p.validacion })),
    // Lo que ve el huésped en las fechas ya tarifadas (el motor solo mira la base).
    precio_huesped: [...huesped.entries()].map(([id, h]) => ({
      property_id: id, caras: h.caras, baratas: h.baratas, ok: h.ok, sin_mercado: h.sinMercado,
      peores: h.peores,
      base_donde_manda_la_cuota: baseDondeLaCuotaMandaya(
        pisos.find(p => p.property_id === id)!.configurado),
    })),
    // Qué canales heredan esta conversión SIN haber sido medidos, y cuánto ingreso mueven.
    cobertura_canales: { medido: PORTAL_CANAL, sin_medir: canales.sinMedir, peso: canales.canales },
    avisos: avisosCentinela,
  })
}
