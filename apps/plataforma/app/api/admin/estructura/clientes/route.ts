// Clientes en vivo de una vertical para el mapa de arquitectura (carga perezosa).
// Reutiliza el adaptador de la vertical (mismo puerto que el listado del god-panel).
import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { getAdapter } from '@/lib/adapters'

export async function GET(req: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const app = req.nextUrl.searchParams.get('app') || ''
  const adapter = getAdapter(app)
  if (!adapter) return NextResponse.json({ clientes: [] })
  try {
    const lista = await adapter.listar()
    const clientes = lista
      .filter(c => c.id !== 'iarest-info')
      .map(c => ({ id: c.id, nombre: c.nombre, activo: c.activo }))
    return NextResponse.json({ clientes })
  } catch {
    return NextResponse.json({ clientes: [] })
  }
}
