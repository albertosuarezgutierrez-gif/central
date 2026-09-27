// Selección de candidatos del envío en LOTE de recaptación por email — lógica
// PURA, sin BD (`import type` se borra al compilar, así que este fichero no
// arrastra el cliente Prisma de `cartera-recaptacion.ts` y `node --test` lo
// puede correr sin `prisma generate`, igual que el resto de `lib/*.test.ts`
// de esta app).
//
// Solo entran los leads SOLO-EMAIL (sin teléfono usable): a quien tiene
// teléfono se le sigue trabajando a mano por WhatsApp desde la cola normal —
// el lote es para el resto, que si no se queda sin ningún contacto
// automático nunca.

import type { LeadRecaptacion } from './cartera-recaptacion'

export const LIMITE_LOTE_POR_DEFECTO = 25

export function candidatosLoteEmail(
  leads: readonly LeadRecaptacion[],
  limite: number = LIMITE_LOTE_POR_DEFECTO,
): LeadRecaptacion[] {
  return leads.filter((l) => l.email !== null && l.telefono === null && !l.enCooldown).slice(0, Math.max(0, limite))
}
