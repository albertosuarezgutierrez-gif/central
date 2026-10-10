import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { estadoGoogleContactos } from '@/lib/google-contactos'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/google-contactos — estado de la conexión con Google Contacts: cuenta,
 * última sincronización, vínculos y revisiones pendientes. Nunca el token.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    return NextResponse.json({ estado: 'ok', ...(await estadoGoogleContactos(correduria.id)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos', e) }, { status: 500 })
  }
}
