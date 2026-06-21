// Puerto del OPERADOR (god-panel de la matriz). Directorio de personal de un local
// (camareros, cocina, jefe…) para que apps/plataforma pueda dirigir comunicación a
// personas concretas (F0.3). Read-only, server-to-server con Bearer secret. Additivo.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// GET /api/operador/directorio?local_id=<uuid>
// → { personas: [{ refPersona, nombre, rol, email }] }
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const localId = new URL(req.url).searchParams.get('local_id')
  if (!localId) return NextResponse.json({ error: 'local_id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('personal')
    .select('id, nombre, rol, email')
    .eq('local_id', localId)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const personas = (data ?? []).map((p: any) => ({
    refPersona: p.id,
    nombre: p.nombre,
    rol: p.rol ?? null,
    email: p.email ?? null,
  }))
  return NextResponse.json({ personas })
}
