import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { buscarClientes } from '@/lib/cartera-ficha'

export const dynamic = 'force-dynamic'

// GET /api/operador/clientes?q=suarez — buscador de la cartera (read-only).
//
// Existe para que Alberto NO tenga que entrar en asegura: su pantalla es
// plataforma, y este puerto es lo que la surte. Busca por nombre y apellidos
// (van en claro), nunca por DNI: el índice ciego puede desincronizarse y
// entonces devolvería «no existe» sobre un cliente que sí está.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    // Menos de 3 letras no es «no hay nadie»: es que no se ha buscado.
    if (q.length < 3) return NextResponse.json({ estado: 'ok', termino: q, buscado: false, clientes: [] })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({
      estado: 'ok',
      termino: q,
      buscado: true,
      clientes: await buscarClientes(correduria.id, q),
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/clientes', e) })
  }
}
