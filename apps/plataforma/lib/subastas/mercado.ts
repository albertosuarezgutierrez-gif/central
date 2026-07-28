// ────────────────────────────────────────────────────────────────────────────
// Referencia de mercado para valorar las subastas. Aísla red y BD; el parseo y
// la mediana son PUROS (`@central/module-subastas/comparables`).
//
// POR QUÉ EXISTE: el BOE publica «Tasación 0,00 €» en la práctica totalidad de
// los anuncios y el valor de referencia del Catastro exige certificado digital.
// Sin referencia, `evaluarOportunidad` devuelve `puntuacion: null` — correcto,
// pero deja el radar mudo. Alberto ya recibe alertas de Idealista de las zonas
// que vigila, y esas SÍ traen precio y superficie por anuncio: de ahí sale un
// €/m² por zona, gratis y sin contratar nada.
//
// SOLO IDEALISTA: las alertas de Fotocasa dicen «tienes N anuncios en X» sin
// detalle por anuncio, así que no permiten calcular €/m².
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { detectarChollos, parsearAlertaIdealista, precioM2Zona, type Chollo, type Comparable } from '@central/module-subastas'
import { leerAlertas } from '@/lib/subastas/gmail-boe'
import { tgSend } from '@central/core-telegram'
import { eur } from '@/lib/dinero'

export const REMITENTE_IDEALISTA = 'idealista.com'

/** Ventana de comparables que se considera «mercado actual». */
const MESES_VIGENCIA = 12
/** Tope de filas cargadas para calcular la mediana. El volumen real es de cientos. */
const MAX_COMPARABLES = 3000

/**
 * Ingesta de comparables desde las alertas de Idealista del correo.
 *
 * El mismo anuncio se repite en correos sucesivos mientras sigue vivo, de ahí
 * el `ON CONFLICT (portal, ref_anuncio)`: se actualiza el precio (los anuncios
 * bajan de precio) y la fecha en que se vio, sin duplicar la muestra.
 */
export async function ingerirComparables(dias = 30, maxCorreos = 150): Promise<{
  correos: number
  anuncios: number
  upserts: number
}> {
  const correos = await leerAlertas(dias, maxCorreos, REMITENTE_IDEALISTA)

  let anuncios = 0
  let upserts = 0
  for (const c of correos) {
    for (const a of parsearAlertaIdealista(c.html)) {
      anuncios++
      const r = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO mercado_comparables
          (portal, ref_anuncio, titulo, tipo, zona, precio, superficie, habitaciones, precio_m2, url, visto_en)
        VALUES (
          ${a.portal}, ${a.refAnuncio}, ${a.titulo}, ${a.tipo}, ${a.zona}, ${a.precio},
          ${a.superficie}, ${a.habitaciones}, ${a.precioM2}, ${a.url}, ${c.fecha}
        )
        ON CONFLICT (portal, ref_anuncio) DO UPDATE SET
          titulo = EXCLUDED.titulo,
          tipo = EXCLUDED.tipo,
          zona = COALESCE(EXCLUDED.zona, mercado_comparables.zona),
          precio = EXCLUDED.precio,
          superficie = COALESCE(EXCLUDED.superficie, mercado_comparables.superficie),
          habitaciones = COALESCE(EXCLUDED.habitaciones, mercado_comparables.habitaciones),
          precio_m2 = COALESCE(EXCLUDED.precio_m2, mercado_comparables.precio_m2),
          -- La fecha más RECIENTE en que se vio el anuncio: es lo que decide si
          -- sigue dentro de la ventana de vigencia.
          visto_en = GREATEST(EXCLUDED.visto_en, mercado_comparables.visto_en)
      `)
      upserts += Number(r)
    }
  }
  return { correos: correos.length, anuncios, upserts }
}

/**
 * Comparables vigentes, ya en el tipo del módulo.
 *
 * Se cargan en memoria a propósito: la mediana por zona vive en el módulo puro
 * (probada) y el filtro de zona es insensible a acentos, algo que en Postgres
 * exigiría `unaccent` — una extensión que en Supabase vive en el schema
 * `extensions` y ya ha dado problemas de permisos en runtime.
 */
export async function comparablesVigentes(meses = MESES_VIGENCIA): Promise<Comparable[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT portal, ref_anuncio, titulo, tipo, zona, precio, superficie, habitaciones, precio_m2, url
    FROM mercado_comparables
    WHERE precio_m2 IS NOT NULL
      AND visto_en >= now() - make_interval(months => ${meses}::int)
    ORDER BY visto_en DESC
    LIMIT ${MAX_COMPARABLES}
  `)
  return filas.map((f) => ({
    portal: 'idealista' as const,
    refAnuncio: f.ref_anuncio,
    titulo: f.titulo,
    tipo: f.tipo ?? 'otro',
    zona: f.zona,
    precio: Number(f.precio),
    superficie: f.superficie == null ? null : Number(f.superficie),
    habitaciones: f.habitaciones ?? null,
    precioM2: f.precio_m2 == null ? null : Number(f.precio_m2),
    url: f.url,
  }))
}

/**
 * Zonas por las que buscar el €/m² de una subasta, de la más específica a la
 * más amplia. La primera que reúna muestra suficiente gana.
 *
 * `busqueda_origen` es el nombre de la búsqueda guardada del BOE («PUNTA
 * UMBRIA», «MATALASCAÑAS»…): coincide con las zonas que Alberto vigila en
 * Idealista, así que suele ser el mejor puente cuando el municipio no casa.
 */
export function zonasCandidatas(f: {
  municipio?: string | null
  busqueda_origen?: string | null
  provincia?: string | null
}): string[] {
  return [f.municipio, f.busqueda_origen, f.provincia].filter((z): z is string => !!z && z.trim().length > 2)
}

/**
 * Calcula y persiste el €/m² de mercado en las subastas que lo necesitan.
 *
 * Solo toca las que NO tienen tasación ni valor de referencia: donde hay una
 * tasación real, los comparables no pintan nada (y el scoring los ignoraría
 * igualmente, ver la cascada de `evaluarOportunidad`).
 */
export async function aplicarReferenciaMercado(): Promise<{ candidatas: number; conReferencia: number }> {
  const comparables = await comparablesVigentes()
  if (!comparables.length) return { candidatas: 0, conReferencia: 0 }

  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT dedupe_key, municipio, provincia, busqueda_origen,
           COALESCE(superficie_catastro, superficie) AS m2
    FROM subastas
    WHERE es_inmueble = true
      AND (fecha_fin IS NULL OR fecha_fin >= now())
      AND (tasacion IS NULL OR tasacion <= 0)
      AND (valor_referencia IS NULL OR valor_referencia <= 0)
      AND COALESCE(superficie_catastro, superficie) > 0
  `)

  let conReferencia = 0
  for (const f of filas) {
    let ref: { precioM2: number; muestra: number } | null = null
    let zonaUsada: string | null = null
    for (const z of zonasCandidatas(f)) {
      ref = precioM2Zona(comparables, z)
      if (ref) {
        zonaUsada = z
        break
      }
    }
    // Sin muestra suficiente NO se escribe nada: la subasta se queda sin
    // puntuación, que es la respuesta honesta.
    if (!ref) continue

    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas
      SET precio_m2_mercado = ${ref.precioM2},
          muestra_mercado = ${ref.muestra},
          zona_mercado = ${zonaUsada},
          actualizado_en = now()
      WHERE dedupe_key = ${f.dedupe_key}
    `)
    conReferencia++
  }
  return { candidatas: filas.length, conReferencia }
}

// ── Chollos de venta directa ─────────────────────────────────────────────────

/** Chollos vigentes, calculados sobre los comparables de la ventana actual. */
export async function chollosVigentes(): Promise<Chollo[]> {
  return detectarChollos(await comparablesVigentes())
}

/**
 * Aviso Telegram de los chollos NUEVOS (una sola vez por anuncio).
 *
 * La mediana de zona se mueve a diario y un anuncio podría entrar y salir del
 * umbral: `chollo_avisado_at` fija que cada anuncio avisa UNA vez en su vida.
 * Mensaje agregado, no uno por chollo — misma regla anti-ruido que el resto
 * de avisos de subastas.
 */
export async function avisarChollos(): Promise<{ chollos: number; avisados: number }> {
  const chollos = await chollosVigentes()
  if (!chollos.length) return { chollos: 0, avisados: 0 }

  const refs = chollos.map((c) => c.comparable.refAnuncio)
  const pendientes = await prisma.$queryRaw<Array<{ ref_anuncio: string }>>(Prisma.sql`
    SELECT ref_anuncio FROM mercado_comparables
    WHERE portal = 'idealista' AND ref_anuncio = ANY(${refs}::text[])
      AND chollo_avisado_at IS NULL
  `)
  const nuevosRefs = new Set(pendientes.map((p) => p.ref_anuncio))
  const nuevos = chollos.filter((c) => nuevosRefs.has(c.comparable.refAnuncio))
  if (!nuevos.length) return { chollos: chollos.length, avisados: 0 }

  const lineas: string[] = [`💡 <b>Chollos en tus zonas de Idealista</b> — ${nuevos.length} nuevo${nuevos.length > 1 ? 's' : ''}`, '']
  for (const ch of nuevos.slice(0, 6)) {
    const c = ch.comparable
    lineas.push(`• <b>${escaparHtml(c.titulo)}</b>${ch.sospechoso ? ' ⚠️' : ''}`)
    lineas.push(
      `  ${eur(c.precio)}${c.superficie ? ` · ${c.superficie} m²` : ''} · ${Math.round(c.precioM2 ?? 0)}€/m² ` +
        `frente a ${Math.round(ch.precioM2Zona)}€/m² de ${escaparHtml(ch.zona)} (${ch.muestra} anuncios) → ` +
        `<b>${(ch.descuento * 100).toFixed(0)}% por debajo</b>`,
    )
    if (ch.sospechoso) lineas.push('  <i>Descuento anormalmente alto: verificar el anuncio antes de ilusionarse.</i>')
    if (c.url) lineas.push(`  ${escaparHtml(c.url)}`)
  }
  if (nuevos.length > 6) lineas.push('', `…y ${nuevos.length - 6} más en /subastas`)

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})

  await prisma.$executeRaw(Prisma.sql`
    UPDATE mercado_comparables SET chollo_avisado_at = now()
    WHERE portal = 'idealista' AND ref_anuncio = ANY(${nuevos.map((c) => c.comparable.refAnuncio)}::text[])
  `)
  return { chollos: chollos.length, avisados: nuevos.length }
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
