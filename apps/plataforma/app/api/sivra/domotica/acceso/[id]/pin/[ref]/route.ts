import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { borrarPin } from '@/lib/domotica/acceso'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Borra un PIN (por su reserva_ref). Sesión de usuario. Intenta borrarlo en la cerradura y lo marca
// 'borrado' en la BD. `ref` viene URL-encoded (puede contener ':' del prefijo manual).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; ref: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, ref } = await ctx.params
  const reservaRef = decodeURIComponent(ref)

  const rows = await prisma.$queryRaw<{ tuya_device_id: string; tuya_password_id: string | null }[]>`
    SELECT dd.tuya_device_id, ap.tuya_password_id
    FROM domotica_acceso_pin ap JOIN domotica_dispositivos dd ON dd.id = ap.dispositivo_id
    WHERE ap.dispositivo_id = ${id}::uuid AND ap.reserva_ref = ${reservaRef}`
  if (!rows[0]) return NextResponse.json({ error: 'PIN no encontrado' }, { status: 404 })

  let error: string | undefined
  if (rows[0].tuya_password_id) {
    const r = await borrarPin(rows[0].tuya_device_id, rows[0].tuya_password_id)
    if (!r.ok) error = r.error
  }
  await prisma.$executeRaw`
    UPDATE domotica_acceso_pin SET estado = 'borrado', updated_at = now()
    WHERE dispositivo_id = ${id}::uuid AND reserva_ref = ${reservaRef}`

  return NextResponse.json({ ok: true, avisoTuya: error ?? null })
}
