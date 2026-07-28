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
import { detectarChollos, estimarAntiguedad, parsearAlertaIdealista, precioM2Zona, type Chollo, type Comparable } from '@central/module-subastas'
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
          (portal, ref_anuncio, titulo, tipo, zona, precio, precio_inicial, superficie, habitaciones, precio_m2, url, visto_en)
        VALUES (
          ${a.portal}, ${a.refAnuncio}, ${a.titulo}, ${a.tipo}, ${a.zona}, ${a.precio}, ${a.precio},
          ${a.superficie}, ${a.habitaciones}, ${a.precioM2}, ${a.url}, ${c.fecha}
        )
        ON CONFLICT (portal, ref_anuncio) DO UPDATE SET
          titulo = EXCLUDED.titulo,
          tipo = EXCLUDED.tipo,
          zona = COALESCE(EXCLUDED.zona, mercado_comparables.zona),
          -- SEGUIMIENTO DE BAJADAS: si el precio nuevo es menor, se registra la
          -- bajada ANTES de pisarlo. Detectarlo por comparación (y no por el
          -- correo de "bajada de precio" del portal) cubre cualquier vía por la
          -- que llegue el precio nuevo. En Postgres los SET ven la fila VIEJA,
          -- así que el orden de las asignaciones no importa.
          precio_anterior = CASE WHEN EXCLUDED.precio <> mercado_comparables.precio
            THEN mercado_comparables.precio ELSE mercado_comparables.precio_anterior END,
          bajadas = mercado_comparables.bajadas +
            CASE WHEN EXCLUDED.precio < mercado_comparables.precio THEN 1 ELSE 0 END,
          ultima_bajada_at = CASE WHEN EXCLUDED.precio < mercado_comparables.precio
            THEN EXCLUDED.visto_en ELSE mercado_comparables.ultima_bajada_at END,
          precio = EXCLUDED.precio,
          superficie = COALESCE(EXCLUDED.superficie, mercado_comparables.superficie),
          habitaciones = COALESCE(EXCLUDED.habitaciones, mercado_comparables.habitaciones),
          precio_m2 = COALESCE(EXCLUDED.precio_m2, mercado_comparables.precio_m2),
          visto_en = GREATEST(EXCLUDED.visto_en, mercado_comparables.visto_en)
        -- Solo actualiza un correo IGUAL O MÁS NUEVO que lo ya visto: en un
        -- backfill (?dias=60) los correos no llegan en orden y, sin esta guarda,
        -- un correo viejo "resubiría" el precio y fabricaría una bajada falsa
        -- al reprocesar el siguiente.
        WHERE EXCLUDED.visto_en >= mercado_comparables.visto_en
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
    SELECT portal, ref_anuncio, titulo, tipo, zona, precio, superficie, habitaciones, precio_m2, url,
           precio_inicial, precio_anterior, bajadas, ultima_bajada_at, created_at
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
    precioInicial: f.precio_inicial == null ? null : Number(f.precio_inicial),
    precioAnterior: f.precio_anterior == null ? null : Number(f.precio_anterior),
    bajadas: f.bajadas ?? 0,
    ultimaBajadaAt: f.ultima_bajada_at ? new Date(f.ultima_bajada_at).toISOString() : null,
    vistoDesde: f.created_at ? new Date(f.created_at).toISOString() : null,
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

/** Un chollo más las señales de seguimiento que interesan al negociar. */
export type CholloSeguido = Chollo & {
  /** Antigüedad estimada del anuncio en días (por el ritmo de refs). `null` sin calibración. */
  antiguedadDias: number | null
  antiguedadCapada: boolean
}

/**
 * Chollos vigentes + antigüedad estimada.
 *
 * La calibración del ritmo de refs usa `created_at` (primera vez que NOSOTROS
 * vimos cada ref): para los anuncios que van ENTRANDO al corpus con los correos
 * diarios, esa fecha ≈ su fecha de alta. Los primeros días no hay rango
 * suficiente y `estimarAntiguedad` devuelve `null` — la UI enseña entonces solo
 * el «lo vemos desde», que es cota inferior honesta.
 */
export async function chollosVigentes(): Promise<CholloSeguido[]> {
  const comparables = await comparablesVigentes()
  const observaciones = comparables
    .filter((c) => c.vistoDesde != null)
    .map((c) => ({ refAnuncio: c.refAnuncio, primeraVez: c.vistoDesde! }))
  const hoy = new Date().toISOString()
  return detectarChollos(comparables).map((ch) => {
    const est = estimarAntiguedad(ch.comparable.refAnuncio, observaciones, hoy)
    return { ...ch, antiguedadDias: est?.dias ?? null, antiguedadCapada: est?.capada ?? false }
  })
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
    // Las señales de negociación: bajadas = vendedor nervioso; antigüedad = margen para ofertar a la baja.
    if ((c.bajadas ?? 0) > 0 && c.precioInicial != null && c.precioInicial > c.precio) {
      lineas.push(`  ⬇️ Ha bajado ${c.bajadas} ${c.bajadas === 1 ? 'vez' : 'veces'}: de ${eur(c.precioInicial)} a ${eur(c.precio)}`)
    }
    if (ch.antiguedadDias != null && ch.antiguedadDias >= 30) {
      lineas.push(`  ⏳ En venta desde hace ~${Math.round(ch.antiguedadDias / 30)} meses (estimado por el nº de anuncio)`)
    }
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

/**
 * Aviso Telegram de las BAJADAS DE PRECIO nuevas en las zonas vigiladas.
 *
 * Una bajada es señal aunque el anuncio no llegue a chollo: el vendedor ya ha
 * cedido una vez y es el candidato natural a una oferta por debajo. Mensaje
 * agregado; `bajada_avisada_n` fija que cada bajada avisa UNA sola vez (si
 * vuelve a bajar, se avisa de la nueva).
 */
export async function avisarBajadas(): Promise<{ bajadas: number; avisados: number }> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ref_anuncio, titulo, zona, precio, precio_inicial, precio_anterior, bajadas, url
    FROM mercado_comparables
    WHERE bajadas > bajada_avisada_n
      AND visto_en >= now() - make_interval(months => ${MESES_VIGENCIA}::int)
    ORDER BY bajadas DESC, precio_anterior - precio DESC
  `)
  if (!filas.length) return { bajadas: 0, avisados: 0 }

  const lineas: string[] = [`⬇️ <b>Bajadas de precio en tus zonas</b> — ${filas.length} anuncio${filas.length > 1 ? 's' : ''}`, '']
  for (const f of filas.slice(0, 8)) {
    const precio = Number(f.precio)
    const anterior = f.precio_anterior == null ? null : Number(f.precio_anterior)
    const inicial = f.precio_inicial == null ? null : Number(f.precio_inicial)
    const pct = anterior && anterior > 0 ? ((1 - precio / anterior) * 100).toFixed(1) : null
    lineas.push(`• <b>${escaparHtml(f.titulo)}</b>`)
    lineas.push(
      `  ${anterior ? `${eur(anterior)} → ` : ''}<b>${eur(precio)}</b>${pct ? ` (−${pct}%)` : ''}` +
        (f.bajadas > 1 && inicial != null && inicial > precio
          ? ` · ${f.bajadas}ª bajada, salió a ${eur(inicial)}`
          : ''),
    )
    if (f.url) lineas.push(`  ${escaparHtml(f.url)}`)
  }
  if (filas.length > 8) lineas.push('', `…y ${filas.length - 8} más en /subastas`)

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})

  await prisma.$executeRaw(Prisma.sql`
    UPDATE mercado_comparables SET bajada_avisada_n = bajadas
    WHERE ref_anuncio = ANY(${filas.map((f) => String(f.ref_anuncio))}::text[])
  `)
  return { bajadas: filas.length, avisados: Math.min(filas.length, 8) }
}
