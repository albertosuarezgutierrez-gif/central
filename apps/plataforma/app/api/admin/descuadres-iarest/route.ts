import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { getDescuadresIaRest } from '@/lib/descuadres'

export const dynamic = 'force-dynamic'

// GET /api/admin/descuadres-iarest?desde&hasta — consolidado de descuadres por
// empleado de ia-rest (todos los locales) para el god-panel.
export async function GET(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const data = await getDescuadresIaRest(
    searchParams.get('desde') || undefined,
    searchParams.get('hasta') || undefined,
  )
  return NextResponse.json(data)
}
