// lib/sivra/agente-huesped/guia.ts — descarga + caché + extracción de la guía del huésped.
// Implementación por defecto: HTML legible (caso esperado). Si el sondeo (Task 1) reporta
// PROBABLE_SPA_JS, adaptar fetchGuiaRaw() al endpoint interno detectado (mismo seam).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'

const TTL_DIAS = 7

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim()
}

// Descarga el contenido de la guía. Caso HTML servido (esperado). Devuelve texto o null.
async function fetchGuiaRaw(guestUrl: string): Promise<string | null> {
  try {
    const r = await fetch(guestUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!r.ok) return null
    const text = stripHtml(await r.text())
    return text.length > 400 ? text : null  // poco texto ⇒ probable SPA ⇒ tratar como "sin guía"
  } catch { return null }
}

async function getGuestUrl(reservationId: string): Promise<string | null> {
  try {
    const key = await getSmoobuKey()
    const d = await fetch(`https://login.smoobu.com/api/reservations/${reservationId}`, {
      headers: { 'Api-Key': key }, cache: 'no-store',
    }).then(r => r.json())
    return d?.['guest-app-url'] || null
  } catch { return null }
}

// Devuelve el texto de la guía del piso, con caché por property_id (TTL 7 días).
export async function getGuiaPiso(propertyId: string, reservationId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ contenido: string; fetched_at: Date }[]>(Prisma.sql`
    SELECT contenido, fetched_at FROM mensajes_guia_cache WHERE property_id = ${propertyId}
  `)
  const cached = rows[0]
  if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < TTL_DIAS * 86400_000) {
    return cached.contenido
  }
  const url = await getGuestUrl(reservationId)
  if (!url) return cached?.contenido ?? null
  const contenido = await fetchGuiaRaw(url)
  if (!contenido) return cached?.contenido ?? null
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_guia_cache (property_id, contenido, fuente_url, fetched_at)
    VALUES (${propertyId}, ${contenido}, ${url}, now())
    ON CONFLICT (property_id) DO UPDATE SET contenido = ${contenido}, fuente_url = ${url}, fetched_at = now()
  `).catch(() => {})
  return contenido
}
