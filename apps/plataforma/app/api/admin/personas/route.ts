import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { consolidarPersonas } from '@/lib/personas'

// GET /api/admin/personas — consolida "la persona a través de verticales" (Fase 3, solo lectura).
export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const data = await consolidarPersonas()
  return NextResponse.json(data)
}
