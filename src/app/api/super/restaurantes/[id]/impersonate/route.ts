import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getSession(req: NextRequest) {
  const header = req.headers.get('x-ia-session')
  if (!header) return null
  try { return JSON.parse(header) } catch { return null }
}

// POST /api/super/restaurantes/[id]/impersonate
// Genera una sesiÃ³n temporal de owner para que el super admin acceda al panel del restaurante
// sin necesitar el PIN. La sesiÃ³n generada solo vale para la sesiÃ³n del navegador.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()

  // Obtener datos del restaurante
  const { data: restaurante, error: errRest } = await supabase
    .from('restaurantes')
    .select('id, nombre, nombre_comercial, slug')
    .eq('id', params.id)
    .single()

  if (errRest || !restaurante) {
    return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
  }

  // Buscar el primer camarero con rol owner o admin del restaurante
  const { data: camareros } = await supabase
    .from('camareros')
    .select('id, nombre, rol, restaurante_id, seccion_id')
    .eq('restaurante_id', params.id)
    .eq('activo', true)
    .in('rol', ['owner', 'admin'])
    .order('rol') // owner primero
    .limit(1)

  let camarero = camareros?.[0]

  // Si no hay owner/admin, buscar cualquier camarero activo
  if (!camarero) {
    const { data: cualquiera } = await supabase
      .from('camareros')
      .select('id, nombre, rol, restaurante_id, seccion_id')
      .eq('restaurante_id', params.id)
      .eq('activo', true)
      .limit(1)
    camarero = cualquiera?.[0]
  }

  if (!camarero) {
    return NextResponse.json({ error: 'No hay usuarios activos en este restaurante' }, { status: 404 })
  }

  // Construir la sesiÃ³n igual que lo hace /api/auth al hacer login con PIN
  const sessionData = {
    id: camarero.id,
    nombre: camarero.nombre,
    rol: camarero.rol,
    restaurante_id: camarero.restaurante_id,
    restaurante_nombre: restaurante.nombre_comercial || restaurante.nombre,
    seccion_id: camarero.seccion_id ?? null,
    // Marcamos que es una sesiÃ³n impersonada por el super admin
    _impersonated_by: session.nombre || 'super_admin',
  }

  return NextResponse.json({
    ok: true,
    session: sessionData,
    restaurante_codigo: restaurante.slug.toUpperCase(),
    redirect_to: camarero.rol === 'owner' ? '/owner' : '/hub',
  })
}
