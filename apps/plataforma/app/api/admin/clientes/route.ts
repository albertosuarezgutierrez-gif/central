import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { listarTodos, getAdapter } from '@/lib/adapters'
import { nuevoClienteDesdeBody, respuestaAlta } from '@/lib/adapters/alta'

// GET /api/admin/clientes — listado unificado de clientes de TODAS las verticales.
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientes = await listarTodos()
  return NextResponse.json({ clientes, operador: admin.nombre })
}

// POST { vertical, nombre, email?, password?, ciudad?, nif?, direccion?, vincularExistente? } — alta de cliente.
// taller devuelve `pinTemporal` (UNA vez, no-store); rrhh con vincularExistente:true devuelve `vinculado`.
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const adapter = getAdapter(String(body.vertical || ''))
  if (!adapter || !adapter.crear) return NextResponse.json({ error: 'Esa vertical no admite alta desde el panel' }, { status: 400 })

  try {
    const r = await adapter.crear(nuevoClienteDesdeBody(body))
    const { cuerpo, cabeceras } = respuestaAlta(r)
    return NextResponse.json(cuerpo, { status: 201, headers: cabeceras })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo crear' }, { status: 400 })
  }
}
