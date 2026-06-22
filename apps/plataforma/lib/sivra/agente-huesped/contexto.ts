// lib/sivra/agente-huesped/contexto.ts — ensambla el contexto de una reserva.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'
import { getGuiaPiso } from './guia'

export type MensajeHist = { from: 'guest' | 'host'; text: string; ts: string }
export type Aprendizaje = { categoria: string; pregunta_norm: string; respuesta_final: string }
export type Contexto = {
  bookingId: string
  reservationId: string
  propertyId: string
  property: string
  guestName: string
  lang: string
  portal: string
  checkIn: string
  checkOut: string
  lat: number | null
  lng: number | null
  zona: string
  guia: string | null
  historial: MensajeHist[]
  aprendizajes: Aprendizaje[]
}

function strip(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

// Mapea apartmentId/nombre de Smoobu → property_id interno (prop_*).
function toPropertyId(_apartmentId: unknown, apartmentName: string): string {
  const n = (apartmentName || '').toLowerCase()
  if (n.includes('house') || n.includes('sevillana')) return 'prop_house_sevillana'
  if (n.includes('busto reform')) return 'prop_busto_reform'
  if (n.includes('luxury')) return 'prop_luxury_busto'
  if (n.includes('duplex') || n.includes('center')) return 'prop_duplex_center'
  return 'all'
}

export async function construirContexto(bookingId: string, lang: string): Promise<Contexto | null> {
  const key = await getSmoobuKey()
  const reserva: any = await fetch(`https://login.smoobu.com/api/reservations/${bookingId}`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).catch(() => null)
  if (!reserva) return null

  const apartmentId = reserva?.apartment?.id ?? reserva?.apartmentId
  const apartmentName: string = reserva?.apartment?.name ?? ''
  const apt: any = apartmentId ? await fetch(`https://login.smoobu.com/api/apartments/${apartmentId}`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).catch(() => ({})) : {}

  const propertyId = toPropertyId(apartmentId, apartmentName)

  const msgRaw: any[] = await fetch(`https://login.smoobu.com/api/reservations/${bookingId}/messages`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).then(d => d.messages || d || []).catch(() => [])
  const historial: MensajeHist[] = msgRaw.map(m => ({
    from: (m.sent_by_owner ? 'host' : 'guest') as 'host' | 'guest',
    text: strip(m.message || m.text || ''), ts: m.created_at || '',
  })).filter(m => m.text)

  const guia = await getGuiaPiso(propertyId, bookingId)

  const aprendizajes = await prisma.$queryRaw<Aprendizaje[]>(Prisma.sql`
    SELECT categoria, pregunta_norm, respuesta_final FROM mensajes_aprendizaje
    WHERE property_id = ${propertyId} ORDER BY created_at DESC LIMIT 8
  `)

  return {
    bookingId, reservationId: String(bookingId), propertyId,
    property: apartmentName || 'el apartamento',
    guestName: reserva?.guest_name || reserva?.guestName || '',
    lang, portal: reserva?.channel?.name || reserva?.type || 'directo',
    checkIn: reserva?.arrival || '', checkOut: reserva?.departure || '',
    lat: apt?.location?.latitude ?? null, lng: apt?.location?.longitude ?? null,
    zona: [apt?.location?.city, apt?.location?.country].filter(Boolean).join(', ') || 'Sevilla, España',
    guia, historial, aprendizajes,
  }
}
