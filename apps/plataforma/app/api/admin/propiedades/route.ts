import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { getPropiedades } from '@/lib/propiedades'

// GET /api/admin/propiedades — apartamentos turísticos propios (sivra) para el panel.
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Portal del propietario de ialimp (Alberto es propietario/cliente ahí) para embeber.
  const portalUrl = (process.env.IALIMP_URL || 'https://app.ialimp.es').replace(/\/$/, '') + '/propietario'

  try {
    const propiedades = await getPropiedades()
    return NextResponse.json({ propiedades, portalUrl })
  } catch {
    return NextResponse.json({ propiedades: [], portalUrl, error: 'No se pudieron cargar' }, { status: 200 })
  }
}
