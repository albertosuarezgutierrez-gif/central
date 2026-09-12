// Suscripciones Web Push del portal (12/09/2026). Aislamiento por CÓDIGO, misma puerta que el
// resto: la identidad SIEMPRE sale de la sesión, nunca de un parámetro.
import { prisma } from './db'
import { getIdentidad } from './session'

export type SuscripcionEntrada = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** `upsert` por `endpoint`: el mismo navegador puede volver a suscribirse (el permiso ya concedido
 *  no vuelve a preguntar) sin duplicar fila. */
export async function suscribirDeSesion(s: SuscripcionEntrada): Promise<{ ok: true } | { ok: false; motivo: 'sin_sesion' }> {
  const identidad = await getIdentidad()
  if (!identidad) return { ok: false, motivo: 'sin_sesion' }
  await prisma.portalPushSuscripcion.upsert({
    where: { endpoint: s.endpoint },
    create: { identidadId: identidad.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, authKey: s.keys.auth },
    // Un endpoint puede reasignarse a otra identidad si alguien comparte el mismo navegador y
    // entra con otro código: la fila sigue el endpoint, no la identidad original.
    update: { identidadId: identidad.id, p256dh: s.keys.p256dh, authKey: s.keys.auth },
  })
  return { ok: true }
}

export async function desuscribirDeSesion(endpoint: string): Promise<void> {
  const identidad = await getIdentidad()
  if (!identidad) return
  // Filtra también por identidad: sin esto, cualquier endpoint ajeno tecleado a mano borraría la
  // suscripción de otra persona.
  await prisma.portalPushSuscripcion.deleteMany({ where: { endpoint, identidadId: identidad.id } })
}

export async function haySuscripcionDeSesion(): Promise<boolean> {
  const identidad = await getIdentidad()
  if (!identidad) return false
  const n = await prisma.portalPushSuscripcion.count({ where: { identidadId: identidad.id } })
  return n > 0
}
