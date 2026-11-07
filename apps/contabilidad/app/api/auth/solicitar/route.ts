import { NextResponse } from 'next/server'
import { resolverSolicitud } from '@/lib/solicitar-acceso'
import { repoAccesoBd } from '@/lib/db'
import { ipDeCabecera } from '@/lib/ip'

// Paso 1 del login: pedir código por correo. Lógica en lib/solicitar-acceso.ts (503 canal_no_disponible · 502 envio_fallido).
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { email?: unknown } | null
  const r = await resolverSolicitud(repoAccesoBd, { email: b?.email, ip: ipDeCabecera(req.headers.get('x-forwarded-for')) })
  return NextResponse.json(r.body, { status: r.status, headers: r.headers })
}
