import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/** Configura VAPID si hay claves. Devuelve false (no-op) si faltan. */
function vapidListo(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails('mailto:rrhh@central.local', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  return true
}

type Sub = { endpoint: string; p256dh: string; auth: string }

export type ResultadoPush = 'enviado' | 'sin_suscripcion' | 'sin_vapid' | 'error'

async function enviarA(subs: Sub[], titulo: string, cuerpo: string, url: string): Promise<ResultadoPush> {
  if (!subs.length) return 'sin_suscripcion'
  if (!vapidListo()) return 'sin_vapid'
  const payload = JSON.stringify({ title: titulo, body: cuerpo, url })
  const oks = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      return true
    } catch (e: any) {
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.push_subscriptions WHERE endpoint = ${s.endpoint}`).catch(() => {})
      }
      return false
    }
  }))
  return oks.some(Boolean) ? 'enviado' : 'error'
}

/** Push a los responsables de RR.HH. de una empresa (best-effort, no-op sin VAPID). */
export async function pushResponsables(empresaId: string, titulo: string, cuerpo: string, url = '/admin') {
  try {
    const subs = await prisma.$queryRaw<Sub[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth FROM rrhh.push_subscriptions
      WHERE empresa_id = ${empresaId}::uuid AND suscriptor_tipo = 'gestor'`)
    await enviarA(subs, titulo, cuerpo, url)
  } catch (e: any) { console.error('pushResponsables', e?.message) }
}

/** Push a un empleado concreto (best-effort, no-op sin VAPID). */
export async function pushEmpleado(empresaId: string, empleadoId: string, titulo: string, cuerpo: string, url = '/e') {
  try {
    const subs = await prisma.$queryRaw<Sub[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth FROM rrhh.push_subscriptions
      WHERE empresa_id = ${empresaId}::uuid AND suscriptor_tipo = 'titular' AND suscriptor_id = ${empleadoId}::uuid`)
    await enviarA(subs, titulo, cuerpo, url)
  } catch (e: any) { console.error('pushEmpleado', e?.message) }
}

/** Igual que `pushEmpleado` pero devuelve el resultado (para registrarlo en `rrhh.avisos`). No lanza. */
export async function pushEmpleadoResultado(empresaId: string, empleadoId: string, titulo: string, cuerpo: string, url = '/e'): Promise<ResultadoPush> {
  try {
    const subs = await prisma.$queryRaw<Sub[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth FROM rrhh.push_subscriptions
      WHERE empresa_id = ${empresaId}::uuid AND suscriptor_tipo = 'titular' AND suscriptor_id = ${empleadoId}::uuid`)
    return await enviarA(subs, titulo, cuerpo, url)
  } catch (e: any) { console.error('pushEmpleadoResultado', e?.message); return 'error' }
}
