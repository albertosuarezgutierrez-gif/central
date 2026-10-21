import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { decidirFichaje, MAX_USER_AGENT } from '@/lib/ubicacion-fichaje'
import {
  fichajeActivo, ficharEntrada, ficharSalida, listarFichajes, permiteFicharSinUbicacion, enlazarIncidenciaFichaje,
} from '@/lib/fichajes'

export async function GET() {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const activo = await fichajeActivo(empresa_id, empleado_id)
    const mes = new Date().toISOString().slice(0, 7)
    const historial = await listarFichajes(empresa_id, { mes, empleadoId: empleado_id })
    const permite_sin_ubicacion = await permiteFicharSinUbicacion(empresa_id)
    return NextResponse.json({ activo, historial, permite_sin_ubicacion })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const body = await req.json().catch(() => null)
    // El permiso de la empresa solo se consulta si el cliente pide fichar sin ubicación.
    const pideSin = !!body && typeof body === 'object' && (body as Record<string, unknown>).sin_ubicacion === true
    const d = decidirFichaje(body, pideSin && await permiteFicharSinUbicacion(empresa_id))
    if (!d.ok) return NextResponse.json({ error: d.error, codigo: d.codigo }, { status: 400 })
    const lat = d.modo === 'con_ubicacion' ? d.lat : null
    const lng = d.modo === 'con_ubicacion' ? d.lng : null
    const extra = d.modo === 'con_ubicacion' ? { precision_m: d.precision_m } : { sin_ubicacion: true }
    const activo = await fichajeActivo(empresa_id, empleado_id)
    const fichaje = activo
      ? await ficharSalida(empresa_id, empleado_id, lat, lng, extra)
      : await ficharEntrada(empresa_id, empleado_id, lat, lng, extra)
    if (d.modo === 'sin_ubicacion') {
      // Best-effort: el enlace con la incidencia no tumba un fichaje ya registrado.
      const ua = req.headers.get('user-agent')
      await enlazarIncidenciaFichaje(empresa_id, empleado_id, fichaje.id, {
        causa: d.causa, plataforma: d.plataforma, estado_permiso: null, user_agent: ua ? ua.slice(0, MAX_USER_AGENT) : null,
      }).catch(e => console.error('incidencia ubicación (enlace)', e?.message))
    }
    return NextResponse.json({ fichaje, accion: activo ? 'salida' : 'entrada', sin_ubicacion: d.modo === 'sin_ubicacion' })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
