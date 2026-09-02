import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { buscarEnCartera } from '@/lib/cartera-busqueda'

export const dynamic = 'force-dynamic'

// GET /api/operador/buscar?q=… — el buscador de TODO (read-only, gratis).
// Nombre, matrícula, nº de póliza, DNI, teléfono, email, ciudad o CP: lo que
// se pueda buscar de cada término lo decide `planBusqueda()`, que es puro.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', ...(await buscarEnCartera(correduria.id, q)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/buscar', e) })
  }
}
