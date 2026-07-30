// ────────────────────────────────────────────────────────────────────────────
// API OFICIAL de Idealista → comparables de mercado. Aísla red y BD; el mapeo,
// los centros de zona y el presupuesto son PUROS (`@central/module-subastas`).
//
// POR QUÉ EXISTE: las alertas de correo solo cubren las búsquedas guardadas
// que Alberto crea a mano en Idealista, y la app de Idealista en ChatGPT no es
// conectable desde fuera. La API oficial (developers.idealista.com) es la vía
// legítima de consulta directa: gratis, ~100 llamadas/mes, hasta 50 anuncios
// por llamada con precio/m²/€·m². Cada anuncio entra al MISMO corpus
// `mercado_comparables` por `upsertComparable` (el `propertyCode` es el id de
// `/inmueble/<id>/` → deduplica con lo ya visto en los correos).
//
// INERTE SIN CREDENCIALES: hasta que Idealista apruebe el alta y Alberto pegue
// `IDEALISTA_API_KEY` + `IDEALISTA_API_SECRET` (editables desde el god-panel →
// 🔑 Secretos), `ingerirComparablesIdealistaApi` devuelve `disponible: false`
// sin tocar red ni BD.
//
// PRESUPUESTO: el tramo gratuito es ~100 búsquedas/mes. Cada llamada se anota
// en `idealista_api_usos`; el módulo raciona (3/pasada, margen mensual de 15)
// y cada zona se cachea IDEALISTA_DIAS_CACHE_ZONA días — con ~15 zonas vivas
// el consumo real ronda 15-30 llamadas/mes.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  centroBusquedaIdealista,
  comparablesDesdeApiIdealista,
  llamadasPermitidasIdealista,
  IDEALISTA_DIAS_CACHE_ZONA,
  type RespuestaIdealistaApi,
} from '@central/module-subastas'
import { upsertComparable } from '@/lib/subastas/mercado'

const OAUTH_URL = 'https://api.idealista.com/oauth/token'
const SEARCH_URL = 'https://api.idealista.com/3.5/es/search'

export function idealistaApiDisponible(): boolean {
  return !!process.env.IDEALISTA_API_KEY && !!process.env.IDEALISTA_API_SECRET
}

/** Token OAuth2 client_credentials. Dura ~12h; una pasada del cron pide uno y listo. */
async function obtenerToken(): Promise<string> {
  const basic = Buffer.from(`${process.env.IDEALISTA_API_KEY}:${process.env.IDEALISTA_API_SECRET}`).toString('base64')
  const r = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'read' }),
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`oauth HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`)
  const j = (await r.json()) as { access_token?: string }
  if (!j.access_token) throw new Error('oauth sin access_token')
  return j.access_token
}

/** Una búsqueda de VIVIENDA en venta alrededor del centro de la zona. */
async function buscarZona(token: string, centro: { lat: number; lng: number; distancia: number }): Promise<RespuestaIdealistaApi> {
  const r = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({
      operation: 'sale',
      propertyType: 'homes',
      center: `${centro.lat},${centro.lng}`,
      distance: String(centro.distancia),
      maxItems: '50',
      numPage: '1',
      order: 'publicationDate',
      sort: 'desc',
    }),
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`search HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`)
  return (await r.json()) as RespuestaIdealistaApi
}

/**
 * Pasada del cron: elige las zonas con subastas vivas cuya búsqueda API está
 * caducada (o nunca hecha), consulta las que el presupuesto permita y vuelca
 * los anuncios al corpus. Cada llamada queda anotada en `idealista_api_usos`
 * — el contador mensual sale de ahí, no de memoria.
 */
export async function ingerirComparablesIdealistaApi(maxPorPasada = 3): Promise<{
  disponible: boolean
  llamadas: number
  anuncios: number
  upserts: number
  usadasMes: number
  fallos: string[]
}> {
  if (!idealistaApiDisponible()) {
    return { disponible: false, llamadas: 0, anuncios: 0, upserts: 0, usadasMes: 0, fallos: [] }
  }

  // El límite de Idealista es por mes natural: se cuenta igual.
  const [{ usadas }] = await prisma.$queryRaw<Array<{ usadas: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS usadas FROM idealista_api_usos
    WHERE llamada_at >= date_trunc('month', now())
  `)
  const permitidas = llamadasPermitidasIdealista(usadas, maxPorPasada)
  if (!permitidas) return { disponible: true, llamadas: 0, anuncios: 0, upserts: 0, usadasMes: usadas, fallos: [] }

  // Zonas candidatas: municipios con subasta de inmueble viva. La misma cola
  // que `referenciaZonasFotocasa`, pero contra la caché propia de la API.
  const vivas = await prisma.$queryRaw<Array<{ municipio: string }>>(Prisma.sql`
    SELECT DISTINCT municipio FROM subastas
    WHERE es_inmueble = true AND municipio IS NOT NULL
      AND (fecha_fin IS NULL OR fecha_fin >= now())
  `)
  const frescas = await prisma.$queryRaw<Array<{ zona: string }>>(Prisma.sql`
    SELECT DISTINCT zona FROM idealista_api_usos
    WHERE llamada_at >= now() - make_interval(days => ${IDEALISTA_DIAS_CACHE_ZONA}::int)
  `)
  const yaFrescas = new Set(frescas.map((f) => f.zona))

  const pendientes = vivas
    .map((v) => v.municipio)
    .filter((m) => !yaFrescas.has(m) && centroBusquedaIdealista(m) != null)

  let token: string
  try {
    token = await obtenerToken()
  } catch (e: any) {
    return { disponible: true, llamadas: 0, anuncios: 0, upserts: 0, usadasMes: usadas, fallos: [`oauth: ${e?.message ?? e}`] }
  }

  const fallos: string[] = []
  let llamadas = 0
  let anuncios = 0
  let upserts = 0
  const ahora = new Date()
  for (const zona of pendientes.slice(0, permitidas)) {
    const centro = centroBusquedaIdealista(zona)!
    try {
      const respuesta = await buscarZona(token, centro)
      llamadas++
      const comparables = comparablesDesdeApiIdealista(respuesta)
      anuncios += comparables.length
      for (const a of comparables) upserts += await upsertComparable(a, ahora)
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO idealista_api_usos (zona, resultados) VALUES (${zona}, ${comparables.length})
      `)
    } catch (e: any) {
      console.error('[idealista-api]', zona, e)
      fallos.push(`${zona}: ${e?.message ?? e}`)
      // Un 429/403 afecta a toda la pasada (cuota o permiso): parar y no insistir.
      break
    }
  }
  return { disponible: true, llamadas, anuncios, upserts, usadasMes: usadas + llamadas, fallos }
}
