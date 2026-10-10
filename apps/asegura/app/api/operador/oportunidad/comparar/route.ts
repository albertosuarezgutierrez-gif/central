import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { compararVariantes } from '@/lib/oportunidad-riesgo'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/oportunidad/comparar?id=&a=&b=` — dos variantes del mismo riesgo: qué cambia
 * de una a otra y la mejor prima de cada compañía en las dos (29/09/2026). Gratis, sin DNI.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const [id, a, b] = ['id', 'a', 'b'].map((k) => (sp.get(k) ?? '').trim())
  if (!id || !a || !b) return NextResponse.json({ estado: 'error', motivo: 'faltan id, a o b' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const c = await compararVariantes(correduria.id, id, a, b)
    if (!c) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...c })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/comparar', e) }, { status: 500 })
  }
}
