import { NextResponse } from 'next/server'

import { MAX_BYTES_DOCUMENTO } from '@central/module-seguros'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { subirDocumentoSolicitud } from '@/lib/solicitud-datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Guardar + leer con IA (hasta ~40 s de visión).
export const maxDuration = 60

/**
 * POST (multipart: token, documento) — el cliente sube un documento por el enlace de datos
 * (24/09/2026). Se archiva en su ficha y la IA propone los campos que faltan.
 *   200 { tipo, etiqueta, valores, aviso } · 410 muerta/completada · 409 tope · 415 fichero no válido
 */
export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const form = await req.formData().catch(() => null)
    const token = typeof form?.get('token') === 'string' ? String(form?.get('token')).trim() : ''
    const fichero = form?.get('documento')
    if (!(fichero instanceof File)) return NextResponse.json({ estado: 'invalido', motivo: 'No llegó ningún fichero.' }, { status: 400 })
    if (fichero.size > MAX_BYTES_DOCUMENTO) return NextResponse.json({ estado: 'invalido', motivo: 'El fichero es demasiado grande.' }, { status: 413 })
    const r = await subirDocumentoSolicitud(token, {
      nombre: fichero.name || 'documento',
      mime: fichero.type,
      contenido: Buffer.from(await fichero.arrayBuffer()),
    })
    if (r.ok) return NextResponse.json(r)
    const status = r.estado === 'tope' ? 409 : r.estado === 'invalido' ? 415 : r.estado === 'error' ? 503 : 410
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-datos/documento', e) }, { status: 503 })
  }
}
