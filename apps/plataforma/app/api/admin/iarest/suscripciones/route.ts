// Proxy → ia-rest /api/admin/suscripciones. Auth: plataforma_admin cookie → Bearer OPERADOR_SHARED_SECRET.
// Solo lectura (las escrituras de Stripe se quedan en iarest.es/super).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { fetchIarest, iarestError } from '@/lib/iarest-port'

export async function GET(_req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Sesión de operador no válida' }, { status: 401 })
  const res = await fetchIarest('/api/admin/suscripciones')
  if (!res || !res.ok) return iarestError(res)
  return NextResponse.json(await res.json())
}
