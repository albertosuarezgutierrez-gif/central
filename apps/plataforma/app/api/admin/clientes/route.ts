import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { listarTodos, getAdapter } from '@/lib/adapters'

// GET /api/admin/clientes — listado unificado de clientes de TODAS las verticales.
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientes = await listarTodos()
  return NextResponse.json({ clientes, operador: admin.nombre })
}

// POST { vertical, nombre, email?, password?, ciudad? } — alta de cliente.
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const adapter = getAdapter(String(body.vertical || ''))
  if (!adapter || !adapter.crear) return NextResponse.json({ error: 'Esa vertical no admite alta desde el panel' }, { status: 400 })

  try {
    const { id } = await adapter.crear({ nombre: body.nombre, email: body.email, password: body.password, ciudad: body.ciudad })
    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo crear' }, { status: 400 })
  }
}
