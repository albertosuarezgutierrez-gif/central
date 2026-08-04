import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { abrirMomentaneo } from '@/lib/domotica/acceso'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  const rows = await prisma.$queryRaw<{ tuya_device_id: string }[]>`
    SELECT tuya_device_id FROM domotica_dispositivos WHERE id = ${id}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  const r = await abrirMomentaneo(deviceId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  await prisma.$executeRaw`
    INSERT INTO domotica_log (dispositivo_id, accion, detalle)
    VALUES (${id}::uuid, ${'abrir'}, ${JSON.stringify({ hora: new Date().toISOString() })}::jsonb)`
  return NextResponse.json({ ok: true })
}
