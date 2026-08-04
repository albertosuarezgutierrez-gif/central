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
// DOS PORTALES: Idealista y Fotocasa. La nota antigua «las alertas de Fotocasa
// no traen detalle» era FALSA para las alertas actuales (verificado 29/07/2026
// contra los correos reales de la etiqueta `inmobiliaria`): sí traen precio,
// tipo, dirección, habs/m²/baños y enlace por anuncio. Además, la FICHA de
// Fotocasa embebe el anunciante → se etiqueta 👤 particular (negociación
// directa sin agencia), que es donde Fotocasa aporta más que Idealista.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { CHOLLO_DESCUENTO_MIN, datosFichaFotocasa, detectarChollos, estimarAntiguedad, MIN_MUESTRA_ZONA, parsearAlertaFotocasa, parsearAlertaIdealista, precioM2Zona, slugDistritoFotocasa, slugNucleoPlaya, slugZonaFotocasa, velocidadZona, type Chollo, type Comparable, type VelocidadZona, type ZonaPortal, type ZonaPortalRef } from '@central/module-subastas'
import { leerAlertas } from '@/lib/subastas/gmail-boe'
import { tgSend } from '@central/core-telegram'
import { eur } from '@/lib/dinero'

export const REMITENTE_IDEALISTA = 'idealista.com'
export const REMITENTE_FOTOCASA = 'fotocasa.es'

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
  // Un lote por portal, mismo upsert. Un fallo de lectura de un portal no debe
  // tirar el otro: cada lectura es best-effort.
  const lotes: Array<{ correos: Awaited<ReturnType<typeof leerAlertas>>; parser: (html: string) => Comparable[] }> = []
  try {
    lotes.push({ correos: await leerAlertas(dias, maxCorreos, REMITENTE_IDEALISTA), parser: parsearAlertaIdealista })
  } catch (e) {
    console.error('[mercado] idealista', e)
  }
  try {
    lotes.push({ correos: await leerAlertas(dias, maxCorreos, REMITENTE_FOTOCASA), parser: parsearAlertaFotocasa })
  } catch (e) {
    console.error('[mercado] fotocasa', e)
  }

  let nCorreos = 0
  let anuncios = 0
  let upserts = 0
  for (const { correos, parser } of lotes) {
    nCorreos += correos.length
    for (const c of correos) {
    for (const a of parser(c.html)) {
      anuncios++
      upserts += await upsertComparable(a, c.fecha)
    }
    }
  }
  return { correos: nCorreos, anuncios, upserts }
}

/**
 * Upsert de UN comparable en `mercado_comparables` — la puerta única del
 * corpus, compartida por las alertas de correo y la API oficial de Idealista
 * (`lib/subastas/idealista-api.ts`): mismo dedupe `(portal, ref_anuncio)` y
 * mismo seguimiento de bajadas venga por donde venga el precio.
 */
export async function upsertComparable(a: Comparable, vistoEn: Date): Promise<number> {
  const r = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mercado_comparables
      (portal, ref_anuncio, titulo, tipo, zona, precio, precio_inicial, superficie, habitaciones, precio_m2, url, visto_en)
    VALUES (
      ${a.portal}, ${a.refAnuncio}, ${a.titulo}, ${a.tipo}, ${a.zona}, ${a.precio}, ${a.precio},
      ${a.superficie}, ${a.habitaciones}, ${a.precioM2}, ${a.url}, ${vistoEn}
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
    -- Solo actualiza una observación IGUAL O MÁS NUEVA que lo ya visto: en un
    -- backfill (?dias=60) los correos no llegan en orden y, sin esta guarda,
    -- un correo viejo "resubiría" el precio y fabricaría una bajada falsa
    -- al reprocesar el siguiente.
    WHERE EXCLUDED.visto_en >= mercado_comparables.visto_en
  `)
  return Number(r)
}

/**
 * Anunciante de los comparables de Fotocasa: la ficha del anuncio embebe
 * `clientAlias`/`clientName` → 👤 particular cuando no hay agencia. Se procesa
 * cada anuncio UNA vez (`anunciante_visto_at`); ante fallos repetidos se corta
 * la pasada y se reintenta otro día (sin marcar).
 *
 * Fotocasa BLOQUEA las IPs de datacenter de Vercel (verificado 29/07/2026: la
 * prueba E2E devolvió 0 revisados con 99 candidatos), así que la ficha se lee
 * a través de la edge function `ficha-fotocasa` de la Supabase compartida —
 * proxy de host único y sin secretos cuyo egress sí pasa el muro. La URL no es
 * sensible (la función solo sirve páginas públicas de www.fotocasa.es).
 */
const PROXY_FICHA_FOTOCASA = 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/ficha-fotocasa'

export async function enriquecerAnunciantesFotocasa(max = 8): Promise<{ revisados: number; particulares: number; fallos: string[] }> {
  const filas = await prisma.$queryRaw<Array<{ ref_anuncio: string; url: string }>>(Prisma.sql`
    SELECT ref_anuncio, url FROM mercado_comparables
    WHERE portal = 'fotocasa' AND anunciante_visto_at IS NULL AND url IS NOT NULL
      AND visto_en >= now() - make_interval(months => ${MESES_VIGENCIA}::int)
    ORDER BY visto_en DESC
    LIMIT ${max}
  `)

  let revisados = 0
  let particulares = 0
  // Cada fallo se anota LEGIBLE en la respuesta (el cron lo enseña): un 0 en
  // silencio ya costó dos ciclos de depuración el 29/07/2026.
  const fallos: string[] = []
  for (const f of filas) {
    try {
      const r = await fetch(`${PROXY_FICHA_FOTOCASA}?url=${encodeURIComponent(f.url)}`, {
        // La edge function se ejecuta en la región del LLAMANTE: desde Vercel
        // (iad1, EE.UU.) el egress sale con IP americana y Fotocasa GEOBLOQUEA
        // con 405 (E2E 29/07/2026); desde Europa responde 200. `x-region`
        // fija la ejecución en Irlanda (la región del proyecto Supabase).
        headers: { 'x-region': 'eu-west-1' },
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      })
      if (!r.ok) {
        // El proxy caído afecta a toda la pasada: parar y reintentar otro día.
        fallos.push(`${f.ref_anuncio}: proxy HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`)
        if (fallos.length >= 2) break
        continue
      }
      const j = (await r.json()) as { status?: number; html?: string }
      if (j.status === 404 || j.status === 410) {
        // Anuncio retirado: marcado como visto para no insistir.
        await prisma.$executeRaw(Prisma.sql`
          UPDATE mercado_comparables SET anunciante_visto_at = now()
          WHERE portal = 'fotocasa' AND ref_anuncio = ${f.ref_anuncio}
        `)
        continue
      }
      if (j.status !== 200) {
        fallos.push(`${f.ref_anuncio}: portal ${j.status}`)
        if (fallos.length >= 2) break
        continue
      }
      const ficha = datosFichaFotocasa(j.html ?? '')
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mercado_comparables SET
          anunciante = ${ficha.anunciante},
          es_particular = ${ficha.esParticular},
          anunciante_visto_at = now()
        WHERE portal = 'fotocasa' AND ref_anuncio = ${f.ref_anuncio}
      `)
      revisados++
      if (ficha.esParticular) particulares++
    } catch (e: any) {
      console.error('[mercado] anunciante', f.ref_anuncio, e)
      fallos.push(`${f.ref_anuncio}: ${e?.message ?? e}`)
      if (fallos.length >= 2) break
    }
  }
  return { revisados, particulares, fallos }
}

// ── Referencia €/m² por zona (buscador de Fotocasa) ─────────────────────────
// Las alertas de correo solo cubren las zonas que Alberto vigila; para el resto
// de municipios con subastas vivas, la edge `zona-fotocasa` baja la página de
// búsqueda de venta de la zona y devuelve la mediana €/m² (misma técnica y
// mismo muro geo/datacenter que la ficha → mismo `x-region`).
const PROXY_ZONA_FOTOCASA = 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/zona-fotocasa'
/** La mediana municipal cambia despacio: la caché de zona vale un mes. */
const DIAS_CACHE_ZONA = 30

/** Consulta una zona en el puente y la cachea; aprende CP→distrito de los anuncios. */
async function consultarZona(slug: string, etiqueta: string, fallos: string[]): Promise<void> {
  // OJO: sin el segmento `todas-las-zonas` la URL municipal devuelve 404
  // (verificado E2E 29/07/2026: /punta-umbria/l → 404, /punta-umbria/todas-las-zonas/l → 200).
  // Los distritos de capital (slug con «/») SÍ van sin ese segmento.
  const ruta = slug.includes('/')
    ? `/es/comprar/viviendas/${slug}/l`
    : `/es/comprar/viviendas/${slug}/todas-las-zonas/l`
  const r = await fetch(`${PROXY_ZONA_FOTOCASA}?ruta=${encodeURIComponent(ruta)}`, {
    headers: { 'x-region': 'eu-west-1' },
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  })
  if (!r.ok) {
    fallos.push(`${slug}: proxy HTTP ${r.status}`)
    return
  }
  const z = (await r.json()) as ZonaPortal & { status?: number }

  // Aprender el mapeo CP→distrito de los anuncios (solo tiene sentido dentro
  // de una capital: el slug del distrito cuelga del slug de la capital).
  const capital = slug.includes('/') ? slug.split('/')[0] : slug.endsWith('-capital') ? slug : null
  if (capital) {
    for (const a of z.anuncios ?? []) {
      const distrito = slugDistritoFotocasa(a.distrito)
      if (!a.cp || !distrito) continue
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO mercado_zonas_cp (cp, slug_zona, veces, actualizado_en)
        VALUES (${a.cp}, ${`${capital}/${distrito}`}, 1, now())
        ON CONFLICT (cp, slug_zona) DO UPDATE SET veces = mercado_zonas_cp.veces + 1, actualizado_en = now()
      `)
    }
  }

  if (z.status !== 200 || z.muestra < MIN_MUESTRA_ZONA || z.p50m2 == null) {
    // Zona sin página o con muestra raquítica: se cachea vacía para no
    // insistir a diario, pero sin mediana (nunca se inventa) — y se ANOTA
    // legible: un portal 404/405 en silencio ya costó un ciclo de debug.
    fallos.push(`${slug}: portal ${z.status}, muestra ${z.muestra ?? 0}`)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO mercado_zonas (slug, municipio, muestra, total_zona, actualizado_en)
      VALUES (${slug}, ${etiqueta}, ${z.muestra ?? 0}, ${z.totalZona ?? null}, now())
      ON CONFLICT (slug) DO UPDATE SET muestra = EXCLUDED.muestra, actualizado_en = now()
    `)
    return
  }
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mercado_zonas (slug, municipio, p25_m2, p50_m2, p75_m2, muestra, total_zona, actualizado_en)
    VALUES (${slug}, ${etiqueta}, ${z.p25m2}, ${z.p50m2}, ${z.p75m2}, ${z.muestra}, ${z.totalZona}, now())
    ON CONFLICT (slug) DO UPDATE SET
      p25_m2 = EXCLUDED.p25_m2, p50_m2 = EXCLUDED.p50_m2, p75_m2 = EXCLUDED.p75_m2,
      muestra = EXCLUDED.muestra, total_zona = EXCLUDED.total_zona, actualizado_en = now()
  `)
  // Snapshot histórico (~mensual, al ritmo de la caché): la serie de mediana y
  // nº de anuncios POR ZONA es el detector fino de recesión — precio cayendo
  // y oferta creciendo en una zona concreta se verá aquí antes que en el INE.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mercado_zonas_hist (slug, p50_m2, muestra, total_zona)
    VALUES (${slug}, ${z.p50m2}, ${z.muestra}, ${z.totalZona})
  `).catch((e) => console.error('[mercado] hist', slug, e))
}

export async function referenciaZonasFotocasa(max = 6): Promise<{ zonasConsultadas: number; subastasConZona: number; fallos: string[] }> {
  const vivas = await prisma.$queryRaw<Array<{ dedupe_key: string; municipio: string | null; codigo_postal: string | null; descripcion: string | null }>>(Prisma.sql`
    SELECT dedupe_key, municipio, codigo_postal, descripcion FROM subastas
    WHERE es_inmueble = true AND municipio IS NOT NULL
      AND (fecha_fin IS NULL OR fecha_fin >= now())
  `)
  const conCache = await prisma.$queryRaw<Array<{ slug: string }>>(Prisma.sql`
    SELECT slug FROM mercado_zonas
    WHERE actualizado_en >= now() - make_interval(days => ${DIAS_CACHE_ZONA}::int)
  `)
  const frescas = new Set(conCache.map((c) => c.slug))
  const mapaCP = await prisma.$queryRaw<Array<{ cp: string; slug_zona: string; veces: number }>>(Prisma.sql`
    SELECT DISTINCT ON (cp) cp, slug_zona, veces FROM mercado_zonas_cp ORDER BY cp, veces DESC
  `)
  const distritoPorCP = new Map(mapaCP.map((m) => [m.cp, m.slug_zona]))

  // Cola: primero el municipio (que además APRENDE distritos de sus anuncios),
  // y para las subastas de capital con CP ya mapeado, su distrito concreto.
  const pendientes: Array<{ slug: string; etiqueta: string }> = []
  const encolar = (slug: string | null, etiqueta: string) => {
    if (slug && !frescas.has(slug) && !pendientes.some((p) => p.slug === slug)) pendientes.push({ slug, etiqueta })
  }
  for (const v of vivas) {
    encolar(slugZonaFotocasa(v.municipio), v.municipio!)
    const distrito = v.codigo_postal ? distritoPorCP.get(v.codigo_postal) : undefined
    if (distrito) encolar(distrito, `${v.municipio} · ${distrito.split('/')[1]}`)
    // Núcleos de playa (Matalascañas, La Antilla…): página propia en Fotocasa,
    // con mediana MUY distinta de la del municipio al que pertenecen.
    const nucleo = slugNucleoPlaya(v.municipio, v.descripcion)
    if (nucleo) encolar(nucleo, nucleo.replace(/-/g, ' '))
  }

  const fallos: string[] = []
  let zonasConsultadas = 0
  for (const p of pendientes.slice(0, max)) {
    try {
      await consultarZona(p.slug, p.etiqueta, fallos)
      zonasConsultadas++
    } catch (e: any) {
      console.error('[mercado] zona', p.slug, e)
      fallos.push(`${p.slug}: ${e?.message ?? e}`)
      if (fallos.length >= 3) break
    }
  }

  // Pintar la zona en TODAS las subastas vivas (también las que tienen
  // tasación: la referencia de zona es contexto, no valoración). Preferencia:
  // distrito por CP (capitales) > mediana municipal. El emparejado se hace en
  // JS, que es donde vive `slugZonaFotocasa`.
  let pintadas = 0
  const zonas = await prisma.$queryRaw<Array<{ slug: string; municipio: string; p50_m2: number | null; muestra: number }>>(Prisma.sql`
    SELECT slug, municipio, p50_m2, muestra FROM mercado_zonas WHERE p50_m2 IS NOT NULL
  `)
  const porSlug = new Map(zonas.map((z) => [z.slug, z]))
  for (const v of vivas) {
    // Preferencia: núcleo de playa citado > distrito por CP > mediana municipal.
    const nucleo = slugNucleoPlaya(v.municipio, v.descripcion)
    const slugDistrito = v.codigo_postal ? distritoPorCP.get(v.codigo_postal) : undefined
    const z = (nucleo && porSlug.get(nucleo))
      || (slugDistrito && porSlug.get(slugDistrito))
      || porSlug.get(slugZonaFotocasa(v.municipio) ?? '')
    if (!z) continue
    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas SET precio_m2_zona = ${z.p50_m2}, muestra_zona = ${z.muestra}, zona_portal = ${z.municipio}
      WHERE dedupe_key = ${v.dedupe_key}
        AND (precio_m2_zona IS DISTINCT FROM ${z.p50_m2} OR zona_portal IS DISTINCT FROM ${z.municipio})
    `)
    pintadas++
  }
  return { zonasConsultadas, subastasConZona: pintadas, fallos }
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
           precio_inicial, precio_anterior, bajadas, ultima_bajada_at, created_at, visto_en,
           anunciante, es_particular
    FROM mercado_comparables
    WHERE precio_m2 IS NOT NULL
      AND visto_en >= now() - make_interval(months => ${meses}::int)
    ORDER BY visto_en DESC
    LIMIT ${MAX_COMPARABLES}
  `)
  return filas.map((f) => ({
    portal: (f.portal === 'fotocasa' ? 'fotocasa' : 'idealista') as 'idealista' | 'fotocasa',
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
    ultimaVez: f.visto_en ? new Date(f.visto_en).toISOString() : null,
    anunciante: f.anunciante ?? null,
    esParticular: f.es_particular ?? null,
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
  // Sin comparables de alertas el fallback de zona del portal sigue valiendo:
  // no se corta en seco.
  const comparables = await comparablesVigentes()

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

  // Fallback para municipios fuera del corpus de alertas: la mediana de zona
  // del buscador de Fotocasa (tabla `mercado_zonas`, la puebla
  // `referenciaZonasFotocasa` en este mismo cron).
  const zonasPortal = await prisma.$queryRaw<Array<{ slug: string; p50_m2: number; muestra: number }>>(Prisma.sql`
    SELECT slug, p50_m2, muestra FROM mercado_zonas WHERE p50_m2 IS NOT NULL
  `)
  const portalPorSlug = new Map(zonasPortal.map((z) => [z.slug, z]))

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
    if (!ref) {
      const slug = slugZonaFotocasa(f.municipio)
      const zp = slug ? portalPorSlug.get(slug) : undefined
      if (zp) {
        ref = { precioM2: Number(zp.p50_m2), muestra: zp.muestra }
        zonaUsada = `${f.municipio} (buscador Fotocasa)`
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
  /** Lo rápido que se vende la zona (mediana de días de los anuncios desaparecidos). */
  velocidad: VelocidadZona | null
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
  // Las medianas del BUSCADOR (mercado_zonas, muestras de 100+ anuncios) mandan
  // sobre las de alertas cuando existen: el descuento sale más robusto y las
  // zonas con pocas alertas dejan de quedarse sin referencia. Best-effort.
  const zonasPortal: ZonaPortalRef[] = await prisma
    .$queryRaw<Array<{ slug: string; p50_m2: number; muestra: number }>>(
      Prisma.sql`SELECT slug, p50_m2, muestra FROM mercado_zonas WHERE p50_m2 IS NOT NULL`,
    )
    .then((filas) => filas.map((f) => ({ slug: f.slug, p50m2: Number(f.p50_m2), muestra: f.muestra })))
    .catch(() => [])
  const hoy = new Date().toISOString()
  return detectarChollos(comparables, CHOLLO_DESCUENTO_MIN, 3, zonasPortal).map((ch) => {
    const est = estimarAntiguedad(ch.comparable.refAnuncio, observaciones, hoy)
    return {
      ...ch,
      antiguedadDias: est?.dias ?? null,
      antiguedadCapada: est?.capada ?? false,
      velocidad: velocidadZona(comparables, ch.zona, hoy),
    }
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
  // La clave real es (portal, ref): dos portales podrían compartir un id numérico.
  const pendientes = await prisma.$queryRaw<Array<{ portal: string; ref_anuncio: string }>>(Prisma.sql`
    SELECT portal, ref_anuncio FROM mercado_comparables
    WHERE ref_anuncio = ANY(${refs}::text[])
      AND chollo_avisado_at IS NULL
  `)
  const nuevosRefs = new Set(pendientes.map((p) => `${p.portal}|${p.ref_anuncio}`))
  const nuevos = chollos.filter((c) => nuevosRefs.has(`${c.comparable.portal}|${c.comparable.refAnuncio}`))
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
    if (c.esParticular) lineas.push('  👤 Anuncio de PARTICULAR — negociación directa, sin comisión de agencia')
    if (ch.sospechoso) lineas.push('  <i>Descuento anormalmente alto: verificar el anuncio antes de ilusionarse.</i>')
    if (c.url) lineas.push(`  ${escaparHtml(c.url)}`)
  }
  if (nuevos.length > 6) lineas.push('', `…y ${nuevos.length - 6} más en /subastas`)

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})

  for (const portal of ['idealista', 'fotocasa'] as const) {
    const delPortal = nuevos.filter((c) => c.comparable.portal === portal).map((c) => c.comparable.refAnuncio)
    if (!delPortal.length) continue
    await prisma.$executeRaw(Prisma.sql`
      UPDATE mercado_comparables SET chollo_avisado_at = now()
      WHERE portal = ${portal} AND ref_anuncio = ANY(${delPortal}::text[])
    `)
  }
  return { chollos: chollos.length, avisados: nuevos.length }
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Índice de precios de vivienda (INE) + pulso de enfriamiento ─────────────
// Segunda referencia, independiente del portal: el IPV oficial (trimestral).
// Se capturan la variación ANUAL (contexto) y la TRIMESTRAL (primera señal de
// giro: una recesión inmobiliaria se ve antes en el trimestre que en el año).
// Tabla 25171 de la API Tempus, verificada en vivo el 29/07/2026; se localizan
// las series por su Nombre (no por código, que no es correlativo).
const INE_TABLA_IPV = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/25171?nult=1'
const SERIES_IPV: Array<{ clave: string; nombre: string }> = [
  { clave: 'ipv_andalucia_va', nombre: 'Andalucía. General. Variación anual.' },
  { clave: 'ipv_andalucia_vt', nombre: 'Andalucía. General. Variación trimestral.' },
]
/** El IPV es trimestral: la caché de 30 días sobra. */
const DIAS_CACHE_INDICE = 30

export interface IndicesVivienda {
  /** Variación anual en % (p.ej. 12.4). */
  anual: number | null
  /** Variación del último trimestre en % — negativa = el precio está CAYENDO. */
  trimestral: number | null
  /** Periodo legible («T2 2026»). */
  etiqueta: string | null
}

/** Refresca la caché del IPV si está caducada. Best-effort (el cron lo llama). */
export async function refrescarIndiceINE(): Promise<{ ok: boolean; detalle: string }> {
  const cache = await prisma.$queryRaw<Array<{ actualizado_en: Date }>>(Prisma.sql`
    SELECT actualizado_en FROM mercado_indices
    WHERE clave = 'ipv_andalucia_va'
      AND actualizado_en >= now() - make_interval(days => ${DIAS_CACHE_INDICE}::int)
  `)
  if (cache.length) return { ok: true, detalle: 'caché fresca' }

  const r = await fetch(INE_TABLA_IPV, { signal: AbortSignal.timeout(20000), cache: 'no-store' })
  if (!r.ok) return { ok: false, detalle: `INE HTTP ${r.status}` }
  const j = (await r.json()) as Array<{ Nombre?: string; Data?: Array<{ Anyo?: number; Fecha?: number; Valor?: number }> }>
  if (!Array.isArray(j)) return { ok: false, detalle: 'respuesta del INE sin tabla' }

  const guardadas: string[] = []
  for (const s of SERIES_IPV) {
    const serie = j.find((x) => (x.Nombre ?? '').trim() === s.nombre)
    const dato = serie?.Data?.[0]
    if (dato?.Valor == null || dato.Anyo == null) continue
    const trimestre = dato.Fecha ? Math.floor(new Date(dato.Fecha).getUTCMonth() / 3) + 1 : null
    const etiqueta = trimestre ? `T${trimestre} ${dato.Anyo}` : String(dato.Anyo)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO mercado_indices (clave, valor, etiqueta, actualizado_en)
      VALUES (${s.clave}, ${dato.Valor}, ${etiqueta}, now())
      ON CONFLICT (clave) DO UPDATE SET
        valor = EXCLUDED.valor, etiqueta = EXCLUDED.etiqueta, actualizado_en = now()
    `)
    guardadas.push(`${s.clave}=${dato.Valor}% (${etiqueta})`)
  }
  return guardadas.length
    ? { ok: true, detalle: guardadas.join(' · ') }
    : { ok: false, detalle: 'series no encontradas en la tabla del INE' }
}

/** Lee el IPV cacheado (sin red). Campos a null si aún no se han capturado. */
export async function leerIndiceINE(): Promise<IndicesVivienda | null> {
  const filas = await prisma.$queryRaw<Array<{ clave: string; valor: number; etiqueta: string }>>(Prisma.sql`
    SELECT clave, valor, etiqueta FROM mercado_indices
    WHERE clave = ANY(${SERIES_IPV.map((s) => s.clave)}::text[]) AND valor IS NOT NULL
  `)
  if (!filas.length) return null
  const por = new Map(filas.map((f) => [f.clave, f]))
  const va = por.get('ipv_andalucia_va')
  const vt = por.get('ipv_andalucia_vt')
  return {
    anual: va ? Number(va.valor) : null,
    trimestral: vt ? Number(vt.valor) : null,
    etiqueta: va?.etiqueta ?? vt?.etiqueta ?? null,
  }
}

/**
 * Pulso de enfriamiento desde NUESTRO corpus de anuncios (más fresco que el
 * INE, que llega con un trimestre de retraso): qué parte de los anuncios
 * vigilados ha bajado de precio y cuánto. Un % de bajadas creciente y recortes
 * más profundos son la señal clásica de mercado girando — determinista, sin IA.
 */
export interface PulsoMercado {
  anuncios: number
  conBajada: number
  /** conBajada / anuncios (0..1). */
  pctConBajada: number
  /** Recorte medio de los que han bajado, sobre su precio anterior (0..1). */
  recorteMedio: number | null
}

export async function pulsoMercado(): Promise<PulsoMercado | null> {
  const filas = await prisma.$queryRaw<Array<{ anuncios: number; con_bajada: number; recorte: number | null }>>(Prisma.sql`
    SELECT COUNT(*)::int AS anuncios,
           COUNT(*) FILTER (WHERE bajadas > 0)::int AS con_bajada,
           AVG((precio_anterior - precio) / NULLIF(precio_anterior, 0))
             FILTER (WHERE bajadas > 0 AND precio_anterior > precio) AS recorte
    FROM mercado_comparables
    WHERE visto_en >= now() - make_interval(months => ${MESES_VIGENCIA}::int)
  `)
  const f = filas[0]
  if (!f || !f.anuncios) return null
  return {
    anuncios: f.anuncios,
    conBajada: f.con_bajada,
    pctConBajada: f.con_bajada / f.anuncios,
    recorteMedio: f.recorte == null ? null : Number(f.recorte),
  }
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
