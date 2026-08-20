// lib/sivra/agente-huesped/guia.ts — guía del huésped (guest app de Smoobu) con caché por piso.
//
// Antes esto bajaba el HTML del `guest-app-url`, pero la guest app es una SPA de React: devolvía
// ~2,8 KB sin texto, se descartaba por el umbral de 400 caracteres y `mensajes_guia_cache` llevaba
// CERO filas desde que existe → el agente respondía a los huéspedes sin ninguna fuente sobre la
// vivienda (y se inventaba llaves, cajas fuertes y rutas). Ahora se usa la API JSON de la guest app.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { smoobuFetch } from '@/lib/smoobu'
import { parseGuestAppUrl, fetchGuiaSecciones, type SeccionGuia } from './guest-app'

const TTL_MS = 24 * 3600_000

export type GuiaPiso = {
  secciones: SeccionGuia[]
  // false = NO SE PUDO LEER. Nunca lo trates como "no hay guía": ver CLAUDE.md, los tres estados.
  cargada: boolean
}

async function getGuestUrl(reservationId: string): Promise<string | null> {
  try {
    const d = await smoobuFetch(`/api/reservations/${reservationId}`, { cache: 'no-store' }).then(r => r.json())
    return d?.['guest-app-url'] || null
  } catch { return null }
}

async function leerCache(propertyId: string): Promise<{ secciones: SeccionGuia[]; fresca: boolean } | null> {
  const rows = await prisma.$queryRaw<{ contenido: string; fetched_at: Date }[]>(Prisma.sql`
    SELECT contenido, fetched_at FROM mensajes_guia_cache WHERE property_id = ${propertyId}
  `).catch(() => [])
  const row = rows[0]
  if (!row) return null
  try {
    const secciones = JSON.parse(row.contenido)
    if (!Array.isArray(secciones)) return null
    return { secciones, fresca: Date.now() - new Date(row.fetched_at).getTime() < TTL_MS }
  } catch { return null }   // caché antigua en texto plano: se ignora y se re-descarga
}

async function guardarCache(propertyId: string, secciones: SeccionGuia[], url: string): Promise<void> {
  const json = JSON.stringify(secciones)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_guia_cache (property_id, contenido, fuente_url, fetched_at)
    VALUES (${propertyId}, ${json}, ${url}, now())
    ON CONFLICT (property_id) DO UPDATE SET contenido = ${json}, fuente_url = ${url}, fetched_at = now()
  `).catch(() => {})
}

// Guía del piso. Caché de 24 h; si la descarga falla se usa la caché vieja (mejor la guía de ayer
// que ninguna) y solo se marca `cargada=false` cuando no hay NADA que ofrecer — porque aguas abajo
// ese false significa "no lo sé todavía", jamás "el piso no tiene esa información".
export async function getGuiaPiso(propertyId: string, reservationId: string): Promise<GuiaPiso> {
  const cache = await leerCache(propertyId)
  if (cache?.fresca) return { secciones: cache.secciones, cargada: true }

  const url = await getGuestUrl(reservationId)
  const ref = url ? parseGuestAppUrl(url) : null
  if (!ref) return { secciones: cache?.secciones ?? [], cargada: !!cache }

  const secciones = await fetchGuiaSecciones(ref)
  if (secciones === null) return { secciones: cache?.secciones ?? [], cargada: !!cache }

  await guardarCache(propertyId, secciones, url as string)
  return { secciones, cargada: true }
}
