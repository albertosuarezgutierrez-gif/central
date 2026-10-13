// Suscripciones Web Push del portal (12/09/2026). Aislamiento por CÓDIGO, misma puerta que el
// resto: la identidad SIEMPRE sale de la sesión, nunca de un parámetro.
import { VERSION_TEXTO_AVISOS, consentimientoVigente, normalizarIp, normalizarUserAgent } from '@central/module-seguros-portal'

import { prisma } from './db'
import { decidirRegistroAvisos } from './push-estado'
import { getIdentidad } from './session'

/** Lo de la request que se sella en la fila de consentimiento (prueba: art. 7.1 RGPD). */
export type MetaConsentimiento = { forwardedFor: string | null; userAgent: string | null }

/** Filas `avisos` de la identidad, para decidir si toca escribir otra (la tabla es append-only). */
async function avisosPrevios(identidadId: string) {
  return prisma.portalConsentimiento.findMany({
    where: { identidadId, tipo: 'avisos' },
    select: { tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
  })
}

async function sellarAvisos(identidadId: string, otorgado: boolean, meta: MetaConsentimiento) {
  await prisma.portalConsentimiento.create({
    data: {
      identidadId,
      tipo: 'avisos',
      otorgado,
      versionTexto: VERSION_TEXTO_AVISOS,
      ip: normalizarIp(meta.forwardedFor),
      userAgent: normalizarUserAgent(meta.userAgent),
    },
  })
}

export type SuscripcionEntrada = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** `upsert` por `endpoint`: el mismo navegador puede volver a suscribirse (el permiso ya concedido
 *  no vuelve a preguntar) sin duplicar fila. */
/**
 * Además de guardar la suscripción, sella el consentimiento `avisos` (13/10/2026): la ruta solo llega
 * aquí si el navegador manda la versión del texto que enseñó junto al botón (`VERSION_TEXTO_AVISOS`).
 */
export async function suscribirDeSesion(
  s: SuscripcionEntrada,
  meta: MetaConsentimiento,
): Promise<{ ok: true } | { ok: false; motivo: 'sin_sesion' }> {
  const identidad = await getIdentidad()
  if (!identidad) return { ok: false, motivo: 'sin_sesion' }
  const previas = await avisosPrevios(identidad.id)
  const registrar = decidirRegistroAvisos({
    accion: 'activar',
    vigenteVersionActual: consentimientoVigente(previas, 'avisos', VERSION_TEXTO_AVISOS),
    ultima: consentimientoVigente(previas, 'avisos'),
    quedanSuscripciones: true,
  })
  await prisma.portalPushSuscripcion.upsert({
    where: { endpoint: s.endpoint },
    create: { identidadId: identidad.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, authKey: s.keys.auth },
    // Un endpoint puede reasignarse a otra identidad si alguien comparte el mismo navegador y
    // entra con otro código: la fila sigue el endpoint, no la identidad original.
    update: { identidadId: identidad.id, p256dh: s.keys.p256dh, authKey: s.keys.auth },
  })
  if (registrar !== null) await sellarAvisos(identidad.id, registrar, meta)
  return { ok: true }
}

/**
 * Quita la suscripción de ESTE dispositivo y, si la identidad se queda sin ninguno, sella la
 * revocación del consentimiento `avisos` (`decidirRegistroAvisos`).
 */
export async function desuscribirDeSesion(endpoint: string, meta: MetaConsentimiento): Promise<void> {
  const identidad = await getIdentidad()
  if (!identidad) return
  // Filtra también por identidad: sin esto, cualquier endpoint ajeno tecleado a mano borraría la
  // suscripción de otra persona.
  await prisma.portalPushSuscripcion.deleteMany({ where: { endpoint, identidadId: identidad.id } })
  const [quedan, previas] = await Promise.all([
    prisma.portalPushSuscripcion.count({ where: { identidadId: identidad.id } }),
    avisosPrevios(identidad.id),
  ])
  const registrar = decidirRegistroAvisos({
    accion: 'desactivar',
    vigenteVersionActual: consentimientoVigente(previas, 'avisos', VERSION_TEXTO_AVISOS),
    ultima: consentimientoVigente(previas, 'avisos'),
    quedanSuscripciones: quedan > 0,
  })
  if (registrar !== null) await sellarAvisos(identidad.id, registrar, meta)
}

export async function haySuscripcionDeSesion(): Promise<boolean> {
  const identidad = await getIdentidad()
  if (!identidad) return false
  const n = await prisma.portalPushSuscripcion.count({ where: { identidadId: identidad.id } })
  return n > 0
}
