import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { crearPinTemporal } from '@/lib/domotica/acceso'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Alta MANUAL de un PIN temporal (además de los automáticos por reserva). Sesión de usuario.
// Body: { desde, hasta (ISO/datetime-local), pin?, reservaRef?, nombre? }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    desde?: string; hasta?: string; pin?: string; reservaRef?: string; nombre?: string
  }

  const desdeMs = body.desde ? Date.parse(body.desde) : NaN
  const hastaMs = body.hasta ? Date.parse(body.hasta) : NaN
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs) || hastaMs <= desdeMs) {
    return NextResponse.json({ error: 'Fechas de validez inválidas (desde < hasta)' }, { status: 400 })
  }

  const rows = await prisma.$queryRaw<{ tuya_device_id: string }[]>`
    SELECT tuya_device_id FROM domotica_dispositivos WHERE id = ${id}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  const reservaRef = body.reservaRef?.trim() || `manual:${new Date(desdeMs).toISOString()}`
  const nombre = (body.nombre || 'Manual').slice(0, 30)
  const res = await crearPinTemporal(deviceId, {
    nombre, desdeEpoch: Math.floor(desdeMs / 1000), hastaEpoch: Math.floor(hastaMs / 1000), pinPreferido: body.pin?.trim() || undefined,
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })

  await prisma.$executeRaw`
    INSERT INTO domotica_acceso_pin
      (dispositivo_id, reserva_ref, pin, tuya_password_id, modo, valido_desde, valido_hasta, estado, detalle)
    VALUES (${id}::uuid, ${reservaRef}, ${res.pin ?? null}, ${res.tuyaPasswordId ?? null}, ${res.modo ?? null},
            ${new Date(desdeMs).toISOString()}::timestamptz, ${new Date(hastaMs).toISOString()}::timestamptz,
            ${'activo'}, ${JSON.stringify({ manual: true })}::jsonb)
    ON CONFLICT (dispositivo_id, reserva_ref) DO UPDATE SET
      pin = EXCLUDED.pin, tuya_password_id = EXCLUDED.tuya_password_id, modo = EXCLUDED.modo,
      valido_desde = EXCLUDED.valido_desde, valido_hasta = EXCLUDED.valido_hasta,
      estado = 'activo', updated_at = now()`

  return NextResponse.json({ ok: true, pin: res.pin, modo: res.modo })
}
