import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { getPropiedades } from '@/lib/propiedades'

// GET /api/admin/propiedades — apartamentos turísticos propios (sivra) para el panel.
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const propiedades = await getPropiedades()
    return NextResponse.json({ propiedades })
  } catch {
    return NextResponse.json({ propiedades: [], error: 'No se pudieron cargar' }, { status: 200 })
  }
}
