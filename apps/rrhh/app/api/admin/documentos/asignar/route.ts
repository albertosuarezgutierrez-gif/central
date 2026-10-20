import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { asignarStaging, type ModoFirma } from '@/lib/envio-documentos'

export const maxDuration = 300 // envío masivo: copia + aviso por empleado

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Subida asistida/masiva, fase 3 (CONFIRMACIÓN del responsable): una copia por empleado, cada una
 * con su firma y evidencia, y aviso opcional. Solo empleados de la empresa de la sesión.
 */
export async function POST(req: Request) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const b = await req.json().catch(() => ({}))
    const empleado_ids = b.toda_plantilla === true
      ? 'toda_plantilla' as const
      : Array.isArray(b.empleado_ids) ? b.empleado_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)) : []
    const r = await asignarStaging(empresa_id, usuario_id, {
      path: String(b.path ?? ''),
      nombre_original: String(b.nombre_original ?? ''),
      titulo: String(b.titulo ?? ''),
      carpeta: String(b.carpeta ?? ''),
      categoria: typeof b.categoria === 'string' ? b.categoria : null,
      resumen: typeof b.resumen === 'string' ? b.resumen : null,
      empleado_ids,
      firma: (b.firma ?? 'none') as ModoFirma,
      avisar: b.avisar === true,
      // Tamaño y tipo NO se aceptan del cliente: salen del objeto real del staging.
      envio_id: typeof b.envio_id === 'string' ? b.envio_id : null,
    }, new URL(req.url).origin)
    return NextResponse.json(r, { status: r.ok ? 201 : 502 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no válid|no se pide firma|permiso|obligatorio|máximo|Máximo|desconocid|no encontrado|Elige|No hay/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
