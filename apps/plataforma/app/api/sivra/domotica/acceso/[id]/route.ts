import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { sondearAcceso } from '@/lib/domotica/acceso'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  const rows = await prisma.$queryRaw<{ tuya_device_id: string }[]>`
    SELECT tuya_device_id FROM domotica_dispositivos WHERE id = ${id}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  try {
    const sonda = await sondearAcceso(deviceId)
    return NextResponse.json({ sonda })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
