import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { borrarPin } from '@/lib/domotica/acceso'
import { reponerVentanaPin } from '@/lib/domotica/reponer-ventana'
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

// Repone la ventana de validez de un PIN VIVO. Sesión de usuario: esto ES la «autorización nuestra».
//
// Body: { desde?, hasta? } (ISO/datetime-local). Sin body, se recalcula desde la reserva de Smoobu
// con los márgenes de hoy. La lógica (y sus porqués: borrar+recrear, mismo código, estado 'error' si
// la recreación falla) vive en `lib/domotica/reponer-ventana.ts`, compartida con el botón del aviso
// de Telegram — las dos puertas hacen exactamente lo mismo.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; ref: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, ref } = await ctx.params
  const reservaRef = decodeURIComponent(ref)
  const body = await req.json().catch(() => ({})) as { desde?: string; hasta?: string }

  const r = await reponerVentanaPin(id, reservaRef, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  if (r.sinCambio) return NextResponse.json({ ok: true, sinCambio: true, pin: r.pin })
  return NextResponse.json({ ok: true, pin: r.pin, pinCambio: r.pinCambio, modo: r.modo, desde: r.desde, hasta: r.hasta })
}
