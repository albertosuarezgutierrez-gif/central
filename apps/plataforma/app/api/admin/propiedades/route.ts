import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { getPropiedades, getPropietarioAccessToken } from '@/lib/propiedades'

// GET /api/admin/propiedades — apartamentos turísticos propios (sivra) para el panel.
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Portal del propietario de ialimp. Si encontramos el token mágico del operador
  // (clientes.access_token por su email) embebemos /propietario/<token> → entra SIN
  // login y sin el problema de cookies de terceros. Si no, caemos al login del portal.
  const base = (process.env.IALIMP_URL || 'https://app.ialimp.es').replace(/\/$/, '')
  const token = await getPropietarioAccessToken(admin.email)
  const portalUrl = token ? `${base}/propietario/${token}` : `${base}/propietario`
  const autologin = !!token

  try {
    const propiedades = await getPropiedades()
    return NextResponse.json({ propiedades, portalUrl, autologin })
  } catch {
    return NextResponse.json({ propiedades: [], portalUrl, autologin, error: 'No se pudieron cargar' }, { status: 200 })
  }
}
