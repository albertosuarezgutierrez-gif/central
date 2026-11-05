import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { esUuid } from '@/lib/rls'
import { rectificarAsiento } from '@/lib/servicio'

// Contraasiento: el original NO se toca (la BD lo impide). Una sola rectificación por asiento.
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'asiento no válido' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as { fecha?: unknown } | null
  const r = await conRepo(c.empresaId, (repo) => rectificarAsiento(repo, id, String(b?.fecha ?? ''), { actor: 'usuario', usuarioId: c.usuarioId }))
  if (!r.ok) return NextResponse.json({ error: 'no_rectificado', errores: r.errores }, { status: 422 })
  return NextResponse.json({ id: r.id, numero: r.numero }, { status: 201 })
}
