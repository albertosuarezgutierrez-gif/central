export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { firmarSesion } from '@/lib/session-sign'

// POST { camarero_id, restaurante_id } → sesión firmada del camarero elegido.
// Sustituye a la construcción de sesión en cliente del login por voz, para
// que también lleve firma HMAC (consistente con el resto de logins).
export async function POST(req: NextRequest) {
  const { camarero_id, restaurante_id } = await req.json().catch(() => ({}))
  if (!camarero_id || !restaurante_id) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: cam } = await supabase
    .from('personal')
    .select('id, nombre, rol, restaurante_id, seccion_id, puede_comandar, modulos_gestion, activo')
    .eq('id', camarero_id)
    .eq('local_id', restaurante_id)
    .maybeSingle()

  if (!cam || cam.activo === false) {
    return NextResponse.json({ error: 'Camarero no válido' }, { status: 404 })
  }

  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nombre')
    .eq('id', restaurante_id)
    .maybeSingle()

  return NextResponse.json({
    camarero: firmarSesion({
      id: cam.id,
      camarero_id: cam.id,
      nombre: cam.nombre,
      rol: cam.rol,
      restaurante_id: cam.restaurante_id,
      restaurante_nombre: rest?.nombre ?? '',
      seccion_id: cam.seccion_id ?? null,
      puede_comandar: cam.puede_comandar ?? false,
      modulos_gestion: cam.modulos_gestion ?? [],
    }),
  })
}
