// «Enviar al cliente» (21/10/2026): lo PURO del bloque (con test). El texto, el token y el código NO se generan aquí: los
// genera asegura (`envio-presupuesto.ts` + `mensajePresupuestoWhatsapp`) con `accion:'avisar', canal:'whatsapp_enlace'`,
// que también anota `enlace_generado`. Nada sale sin el clic de Alberto: copiar y WhatsApp solo le dan el texto/chat.

import type { ContactoFicha } from '@/lib/ficha-asegura'

/** ¿El tomador tiene correo? Tres estados: `null` = no se ha podido comprobar (ficha ilegible), nunca «no tiene». */
export function correoDelTomador(contacto: Pick<ContactoFicha, 'email' | 'emailIlegible'> | null | undefined): 'con_email' | 'sin_email' | 'no_se_sabe' {
  if (!contacto) return 'no_se_sabe'
  if (contacto.emailIlegible) return 'no_se_sabe'
  return contacto.email && contacto.email.trim() !== '' ? 'con_email' : 'sin_email'
}

/** La respuesta de `avisar` por `whatsapp_enlace` → lo que el bloque necesita. `null` = no vino un enlace. PURO. */
export function leerEnlaceAviso(status: number, j: unknown): { mensaje: string; whatsapp: string; enlace: string; conTelefono: boolean } | null {
  const o = typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null
  if (status !== 200 || o?.estado !== 'enlace') return null
  if (typeof o.mensaje !== 'string' || typeof o.whatsapp !== 'string' || typeof o.enlace !== 'string') return null
  if (!/^https:\/\/wa\.me\//.test(o.whatsapp)) return null
  return { mensaje: o.mensaje, whatsapp: o.whatsapp, enlace: o.enlace, conTelefono: typeof o.telefono === 'string' && o.telefono !== '' }
}

export const CONFIRMAR_CORREO = 'Se le manda por correo el aviso con el enlace (sin precios: los ve al entrar con su código). ¿Enviar?'
