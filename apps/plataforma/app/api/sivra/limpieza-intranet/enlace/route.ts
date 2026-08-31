import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getTokenInvitado } from '@/lib/limpieza-acceso'

export const dynamic = 'force-dynamic'

// GET — SOLO sesión (Alberto): devuelve el enlace de acceso de la limpieza con el token vivo,
// para copiarlo/compartirlo desde el panel. La limpieza nunca ve este endpoint.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = await getTokenInvitado()
  if (!token) return NextResponse.json({ enlace: null, error: 'Sin token activo en limpieza_acceso_token' })

  return NextResponse.json({ enlace: `/invitado/limpieza?token=${encodeURIComponent(token)}` })
}
