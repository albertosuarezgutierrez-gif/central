import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { crearSolicitud, misSolicitudes, tipoEtiqueta } from '@/lib/solicitudes'
import { subirObjeto } from '@/lib/storage'
import { avisarResponsables, nombreEmpleado } from '@/lib/notificar'
import { pushResponsables } from '@/lib/push'

const MAX_JUSTIFICANTE = 10 * 1024 * 1024 // 10 MB

export async function GET() {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    return NextResponse.json({ solicitudes: await misSolicitudes(empresa_id, empleado_id) })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

/** Lee el cuerpo como FormData (con justificante opcional) o JSON. Sube el fichero si viene. */
async function leerEntrada(req: Request, empleadoId: string) {
  const ct = req.headers.get('content-type') ?? ''
  if (!ct.includes('multipart/form-data')) {
    const body = await req.json().catch(() => ({}))
    return { ...body, justificante_path: null as string | null }
  }
  const fd = await req.formData()
  const campos = {
    tipo: String(fd.get('tipo') ?? ''),
    fecha_inicio: (fd.get('fecha_inicio') as string) || null,
    fecha_fin: (fd.get('fecha_fin') as string) || null,
    motivo: (fd.get('motivo') as string) || null,
    justificante_path: null as string | null,
  }
  const file = fd.get('justificante')
  if (file && file instanceof File && file.size > 0) {
    if (file.size > MAX_JUSTIFICANTE) throw new Error('El justificante supera el tamaño máximo (10 MB)')
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'justificante'
    const path = `justificantes/${empleadoId}/${crypto.randomUUID()}-${safe}`
    await subirObjeto(path, await file.arrayBuffer(), file.type || 'application/octet-stream')
    campos.justificante_path = path
  }
  return campos
}

export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const entrada = await leerEntrada(req, empleado_id)
    const solicitud = await crearSolicitud(empresa_id, empleado_id, entrada)
    const nombre = await nombreEmpleado(empleado_id)
    await avisarResponsables(empresa_id, `Nueva solicitud de ${nombre}`, `${nombre} ha enviado una solicitud: ${tipoEtiqueta(solicitud.tipo)}.`)
    await pushResponsables(empresa_id, `Nueva solicitud de ${nombre}`, tipoEtiqueta(solicitud.tipo), '/admin/solicitudes')
    return NextResponse.json({ solicitud }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /válido|anterior|encontrado|máximo/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
