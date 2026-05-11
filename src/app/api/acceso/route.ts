import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const tk = req.nextUrl.searchParams.get('tk')
  if (!tk || tk.length < 16) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: cam, error } = await supabase
    .from('camareros')
    .select(`
      id, nombre, rol, restaurante_id, seccion_id, activo,
      install_token_expira_at, install_token_usado,
      restaurantes!inner(nombre)
    `)
    .eq('install_token', tk)
    .single()

  if (error || !cam) {
    return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })
  }

  if (cam.install_token_usado) {
    return NextResponse.json({ error: 'Este enlace ya fue usado. Pide al owner un nuevo QR.' }, { status: 410 })
  }

  if (!cam.install_token_expira_at || new Date(cam.install_token_expira_at) < new Date()) {
    return NextResponse.json({ error: 'Enlace caducado. Pide al owner un nuevo QR.' }, { status: 410 })
  }

  if (!cam.activo) {
    return NextResponse.json({ error: 'Este usuario está de baja.' }, { status: 403 })
  }

  // Consumir el token (un solo uso)
  await supabase
    .from('camareros')
    .update({ install_token_usado: true })
    .eq('id', cam.id)

  const restaurante_nombre = (cam.restaurantes as unknown as { nombre: string })?.nombre ?? 'Restaurante'

  return NextResponse.json({
    ok: true,
    session: {
      id: cam.id,
      nombre: cam.nombre,
      rol: cam.rol,
      restaurante_id: cam.restaurante_id,
      restaurante_nombre,
      seccion_id: cam.seccion_id ?? null,
    }
  })
}
