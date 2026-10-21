import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { validarIncidenciaUbicacion } from '@/lib/ubicacion-fichaje'
import { registrarIncidenciaUbicacion } from '@/lib/fichajes'
import { rateLimit } from '@/lib/rate-limit'

// Incidencia de ubicación (el GPS del móvil no dio posición). El cliente la manda sin esperar
// respuesta; el responsable la ve en /admin/fichajes. Sin correo, push ni mensajes salientes.
export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const i = validarIncidenciaUbicacion(await req.json().catch(() => null), req.headers.get('user-agent'))
    if (!i) return NextResponse.json({ error: 'Causa o plataforma no válida' }, { status: 400 })
    if (!rateLimit(`incidencia-ubicacion:${empleado_id}`, 30, 60 * 60 * 1000).allowed) {
      return NextResponse.json({ error: 'Demasiadas incidencias' }, { status: 429 })
    }
    await registrarIncidenciaUbicacion(empresa_id, empleado_id, i)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
