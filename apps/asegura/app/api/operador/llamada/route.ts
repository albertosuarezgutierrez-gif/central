import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { quienLlama } from '@/lib/llamada'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/llamada?tel=… — ¿quién llama? Búsqueda EXACTA por índice ciego del teléfono
 * (todas sus variantes de prefijo). Solo lectura: nombre y si es cliente en vigor o lead. Ni DNI,
 * ni dirección, ni pólizas. El teléfono no se registra en ningún log.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const tel = new URL(req.url).searchParams.get('tel')
  if (!tel || tel.length > 40) return NextResponse.json({ estado: 'invalido' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await quienLlama(correduria.id, tel)
    const status = r.estado === 'invalido' ? 400 : r.estado === 'sin_clave_lookup' ? 503 : 200
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/llamada', e) }, { status: 500 })
  }
}
