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

async function enviarA(subs: Sub[], titulo: string, cuerpo: string, url: string) {
  if (!subs.length || !vapidListo()) return
  const payload = JSON.stringify({ title: titulo, body: cuerpo, url })
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    } catch (e: any) {
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.push_subscriptions WHERE endpoint = ${s.endpoint}`).catch(() => {})
      }
    }
  }))
}

/** Push a los responsables de RR.HH. de una empresa (best-effort, no-op sin VAPID). */
export async function pushResponsables(empresaId: string, titulo: string, cuerpo: string, url = '/admin/empleados') {
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
