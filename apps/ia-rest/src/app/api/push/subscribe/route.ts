import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { getSession, type ApiSession } from '@/lib/session'

// Registro de la suscripción Web Push del PROPIO dispositivo (02/11/2026).
// Antes: camarero_id del cuerpo + restaurante de `getRestauranteId` (que cae a un id por defecto
// sin sesión) → cualquiera registraba/pisaba la suscripción de otro camarero. Además escribía la
// columna `restaurante_id`, que no existe (es `local_id`): el upsert fallaba siempre.
// Ahora: sesión firmada obligatoria; el camarero es el de la sesión y el local el de la sesión.
// También lo usa useAlertas (antes iba directo a la Edge Function push-send, ya cerrada).

function camareroDeSesion(s: ApiSession, pedido: unknown): string | null {
  const propios = [s.id, s.camarero_id].filter((x): x is string => typeof x === 'string' && !!x)
  if (typeof pedido !== 'string' || !pedido) return propios[0] ?? null
  return propios.includes(pedido) ? pedido : null
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.restaurante_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  let body: { subscription?: unknown; camarero_id?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.subscription || typeof body.subscription !== 'object')
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  const camareroId = camareroDeSesion(session, body.camarero_id)
  if (!camareroId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = createServerClient()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      camarero_id: camareroId,
      local_id: session.restaurante_id,
      subscription: JSON.stringify(body.subscription),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'camarero_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session?.restaurante_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  let body: { camarero_id?: unknown } = {}
  try { body = await req.json() } catch { /* sin cuerpo: el de la sesión */ }
  const camareroId = camareroDeSesion(session, body.camarero_id)
  if (!camareroId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const supabase = createServerClient()
  await supabase.from('push_subscriptions').delete().eq('camarero_id', camareroId).eq('local_id', session.restaurante_id)
  return NextResponse.json({ ok: true })
}
