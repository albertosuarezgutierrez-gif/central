import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { getAdapter } from '@/lib/adapters'

type Ctx = { params: Promise<{ vertical: string; id: string }> }

// GET — ficha 360 de un cliente.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { vertical, id } = await params
  const adapter = getAdapter(vertical)
  if (!adapter) return NextResponse.json({ error: 'Vertical desconocida' }, { status: 404 })

  const ficha = await adapter.ficha(decodeURIComponent(id))
  if (!ficha) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ficha })
}

// PATCH { activo } — bloquear/liberar un cliente.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { vertical, id } = await params
  const adapter = getAdapter(vertical)
  if (!adapter) return NextResponse.json({ error: 'Vertical desconocida' }, { status: 404 })

  const { activo } = await req.json().catch(() => ({}))
  if (typeof activo !== 'boolean') return NextResponse.json({ error: 'activo (boolean) requerido' }, { status: 400 })

  const ok = await adapter.setActivo(decodeURIComponent(id), activo)
  if (!ok) return NextResponse.json({ error: 'No se pudo aplicar (¿cliente no bloqueable?)' }, { status: 422 })
  return NextResponse.json({ ok: true })
}
