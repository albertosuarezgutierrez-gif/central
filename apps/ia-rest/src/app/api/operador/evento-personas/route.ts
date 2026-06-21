// Puerto del OPERADOR (god-panel). Participantes (personal) de un evento/catering,
// para resolver grupos dinámicos de comunicación ("participantes del catering", F0.4).
// Read-only, Bearer secret. Additivo.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// GET /api/operador/evento-personas?evento_id=<uuid>
// → { personas: [{ refPersona, nombre, rol, email }] }
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const eventoId = new URL(req.url).searchParams.get('evento_id')
  if (!eventoId) return NextResponse.json({ error: 'evento_id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('evento_personal')
    .select('id, personal_id, nombre_externo, rol, personal:personal_id(id, nombre, email)')
    .eq('evento_id', eventoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const personas = (data ?? []).map((r: any) => {
    const p = Array.isArray(r.personal) ? r.personal[0] : r.personal
    return {
      refPersona: p?.id ?? `externo:${r.id}`,
      nombre: p?.nombre ?? r.nombre_externo ?? 'Participante',
      rol: r.rol ?? null,
      email: p?.email ?? null,
    }
  })
  return NextResponse.json({ personas })
}
