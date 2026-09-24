import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { confirmarDireccionAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/direccion-confirmar?direccion=&codigoPostal=&municipio=
// Proxy hacia `GET /api/operador/direccion/confirmar` de asegura. Read-only,
// gratis: se pregunta mientras se teclea, sin sesión de cliente que romper.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const q = req.nextUrl.searchParams
  const direccion = (q.get('direccion') ?? '').trim()
  const codigoPostal = (q.get('codigoPostal') ?? '').trim()
  const municipio = (q.get('municipio') ?? '').trim()

  return NextResponse.json(await confirmarDireccionAsegura(direccion, codigoPostal, municipio))
}
