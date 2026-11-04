// Citas por enlace: invitación del taller (un solo uso, caduca) y validación de lo que escribe el cliente.
// PURO: la app guarda solo el HASH del token (256 bits); aquí vive la regla de estado y de caducidad.
import type { ConfigTaller } from './config.ts'

export interface InvitacionCita {
  caducaEn: Date
  usadaEn: Date | null
  revocadaEn: Date | null
}

export type EstadoInvitacion = 'vigente' | 'usada' | 'caducada' | 'revocada'

/** Orden de comprobación: revocada y usada ganan a caducada (es lo que le pasó antes a la invitación). */
export function estadoInvitacion(i: InvitacionCita, ahora: Date): EstadoInvitacion {
  if (i.revocadaEn) return 'revocada'
  if (i.usadaEn) return 'usada'
  return i.caducaEn.getTime() <= ahora.getTime() ? 'caducada' : 'vigente'
}

/** Solo una invitación VIGENTE abre la reserva; el resto se responde como «no encontrado» (sin pistas). */
export const invitacionAbierta = (i: InvitacionCita, ahora: Date): boolean => estadoInvitacion(i, ahora) === 'vigente'

export function caducidadInvitacion(c: ConfigTaller, ahora: Date): Date {
  return new Date(ahora.getTime() + c.agenda.invitacionCaducaDias * 86_400_000)
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const esCorreo = (s: string): boolean => s.length <= 200 && CORREO.test(s)

/** Movil español sencillo: 9 dígitos que empiezan por 6, 7, 8 o 9 (admite +34 y espacios). null = no válido. */
export function normalizarMovil(s: string): string | null {
  const limpio = s.replace(/[\s.-]/g, '').replace(/^(\+34|0034)/, '')
  return /^[6-9]\d{8}$/.test(limpio) ? limpio : null
}
