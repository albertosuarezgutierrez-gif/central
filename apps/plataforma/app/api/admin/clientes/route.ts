import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { listarTodos } from '@/lib/adapters'

// GET /api/admin/clientes — listado unificado de clientes de TODAS las verticales.
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientes = await listarTodos()
  return NextResponse.json({ clientes, operador: admin.nombre })
}
