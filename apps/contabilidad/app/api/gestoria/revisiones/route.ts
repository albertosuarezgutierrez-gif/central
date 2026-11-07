import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { ejecutarF6 } from '@/lib/f6-carga'
import { marcarRevisado } from '@/lib/gestoria'
import { respuestaDeErrorBdFase } from '@/lib/errores-bd'

// POST /api/gestoria/revisiones { tipo: 'asiento' | 'factura_recibida', id }  → marca como revisado (idempotente). Solo objetos de la empresa de la sesión.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = await req.json().catch(() => null)
  try {
    const r = await ejecutarF6(c.empresaId, (_repo, f6) => marcarRevisado(f6, { usuarioId: c.usuarioId, rol: c.rol }, b))
    return r.ok ? NextResponse.json(r, { status: r.nuevo ? 201 : 200 }) : NextResponse.json({ error: 'revision_no_valida', errores: r.errores }, { status: 422 })
  } catch (e) {
    const { status, body } = respuestaDeErrorBdFase(e, '0006_gestoria.sql')
    return NextResponse.json(body, { status })
  }
}
