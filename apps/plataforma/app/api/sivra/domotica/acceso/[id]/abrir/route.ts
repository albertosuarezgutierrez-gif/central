import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { abrirMomentaneo } from '@/lib/domotica/acceso'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  const rows = await prisma.$queryRaw<{ tuya_device_id: string; categoria: string | null }[]>`
    SELECT tuya_device_id, categoria FROM domotica_dispositivos WHERE id = ${id}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  const r = await abrirMomentaneo(deviceId, rows[0].categoria)

  // Se registra SIEMPRE (también el fallo): método usado + respuesta de Tuya (success/code/msg/result), sin secretos.
  const detalle = {
    hora: new Date().toISOString(), ok: r.ok, metodo: r.metodo ?? null,
    respuestas: r.respuestas ?? [], ...(r.ok ? {} : { error: r.error ?? null }),
  }
  await prisma.$executeRaw`
    INSERT INTO domotica_log (dispositivo_id, accion, detalle)
    VALUES (${id}::uuid, ${'abrir'}, ${JSON.stringify(detalle)}::jsonb)`.catch(() => {})

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
  return NextResponse.json({ ok: true, metodo: r.metodo })
}
