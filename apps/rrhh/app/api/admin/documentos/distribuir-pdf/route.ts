import { NextRequest, NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { distribuirDocumentosPdf, MAX_PDF_BYTES } from '@/lib/distribuir-documentos'
import { normalizarVisible } from '@/lib/visibilidad-documento'

export const maxDuration = 300 // lectura del PDF + IA por página + copia/aviso por documento

/**
 * «Distribuir documentos desde PDF»: un PDF con los documentos de varios empleados → cada uno al
 * expediente del suyo. Empresa SIEMPRE la de la sesión. Campos: file, carpeta, titulo?, requiere_firma?, avisar?.
 */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'FormData requerido' }, { status: 400 })
    const file = form.get('file') as File | null
    const carpeta = String(form.get('carpeta') ?? '')
    if (!file || (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)))
      return NextResponse.json({ error: 'Se requiere un fichero PDF' }, { status: 400 })
    if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: 'El archivo es demasiado grande' }, { status: 413 })
    if (!carpeta) return NextResponse.json({ error: 'Elige la carpeta' }, { status: 400 })

    const r = await distribuirDocumentosPdf(empresa_id, usuario_id, await file.arrayBuffer(), {
      nombreOriginal: file.name,
      carpeta,
      titulo: String(form.get('titulo') ?? ''),
      requiereFirma: form.get('requiere_firma') === '1',
      avisar: form.get('avisar') !== '0',
      visibleEmpleado: normalizarVisible(form.get('visible_empleado')), // '0' = oculto al empleado
      origen: new URL(req.url).origin,
    })
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    console.error('[distribuir-documentos] error:', msg)
    const cliente = /no válid|no se pide firma|permiso|obligatorio|supera|vac[ií]o|Máximo|No hay empleados|No se pudo leer|debe ser visible|nóminas/.test(msg)
    return NextResponse.json({ error: msg }, { status: cliente ? 400 : 500 })
  }
}
