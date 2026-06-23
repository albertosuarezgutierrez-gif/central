// lib/sivra/agente-huesped/contexto.ts — ensambla el contexto de una reserva.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'
import { getGuiaPiso } from './guia'

export type MensajeHist = { id: string; from: 'guest' | 'host'; text: string; ts: string }
export type Aprendizaje = { categoria: string; pregunta_norm: string; respuesta_final: string }
export type Contexto = {
  bookingId: string
  reservationId: string
  propertyId: string
  property: string
  guestName: string
  lang: string
  portal: string
  checkIn: string         // fecha de llegada (YYYY-MM-DD)
  checkOut: string        // fecha de salida (YYYY-MM-DD)
  horaCheckIn: string     // hora oficial de entrada de la reserva (p.ej. "15:00")
  horaCheckOut: string    // hora oficial de salida de la reserva (p.ej. "11:00")
  lat: number | null
  lng: number | null
  zona: string
  direccion: string
  ficha: string           // ficha ESTRUCTURADA del piso (datos oficiales de Smoobu)
  guia: string | null
  historial: MensajeHist[]
  aprendizajes: Aprendizaje[]
}

function strip(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

// Mapea apartmentId/nombre de Smoobu → property_id interno (prop_*).
export function toPropertyId(_apartmentId: unknown, apartmentName: string): string {
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
    id: String(m.id || m.created_at || ''),
    from: (m.sent_by_owner ? 'host' : 'guest') as 'host' | 'guest',
    text: strip(m.message || m.text || ''), ts: m.created_at || '',
  })).filter(m => m.text)

  const guia = await getGuiaPiso(propertyId, bookingId)

  const aprendizajes = await prisma.$queryRaw<Aprendizaje[]>(Prisma.sql`
    SELECT categoria, pregunta_norm, respuesta_final FROM mensajes_aprendizaje
    WHERE property_id = ${propertyId} ORDER BY created_at DESC LIMIT 8
  `)

  // Horas OFICIALES de la reserva. En Smoobu, `arrival`/`departure` son las FECHAS y
  // `check-in`/`check-out` son las HORAS (p.ej. "15:00" / "11:00"). Antes se ignoraban y el
  // agente daba respuestas vagas sobre la hora de salida → ahora son dato de verdad.
  const horaCheckIn = String(reserva?.['check-in'] || '').trim()
  const horaCheckOut = String(reserva?.['check-out'] || '').trim()
  const direccion = [apt?.location?.street, apt?.location?.zip, apt?.location?.city]
    .map((x: any) => (x ? String(x).trim() : '')).filter(Boolean).join(', ')

  // Ficha estructurada del piso a partir de datos OFICIALES de Smoobu (el guest-app-url es una
  // SPA que no se puede leer, así que ésta es la fuente de verdad para el agente).
  const amenities: string[] = Array.isArray(apt?.amenities) ? apt.amenities : []
  const fichaLineas = [
    direccion && `Dirección: ${direccion}`,
    (horaCheckIn || horaCheckOut) &&
      `Horario: entrada a partir de las ${horaCheckIn || '—'}, salida hasta las ${horaCheckOut || '—'}`,
    apt?.rooms?.maxOccupancy && `Capacidad máxima: ${apt.rooms.maxOccupancy} huéspedes`,
    amenities.length && `Equipamiento: ${amenities.join(', ')}`,
  ].filter(Boolean)
  const ficha = fichaLineas.join('\n')

  return {
    bookingId, reservationId: String(bookingId), propertyId,
    property: apartmentName || 'el apartamento',
    guestName: reserva?.guest_name || reserva?.guestName || reserva?.firstname || '',
    lang, portal: reserva?.channel?.name || reserva?.type || 'directo',
    checkIn: reserva?.arrival || '',
    checkOut: reserva?.departure || '',
    horaCheckIn, horaCheckOut,
    lat: apt?.location?.latitude ?? null, lng: apt?.location?.longitude ?? null,
    zona: [apt?.location?.city, apt?.location?.country].filter(Boolean).join(', ') || 'Sevilla, España',
    direccion, ficha, guia, historial, aprendizajes,
  }
}
