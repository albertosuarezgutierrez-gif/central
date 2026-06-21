import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { ocrFactura, casarFactura, tipoImagenValido } from '@/lib/factura-ocr'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST multipart/form-data { file (imagen) } — OCR de una factura (foto/imagen) e
// intento de casado con un movimiento bancario sin conciliar de la cuenta. Scoped por sesión.
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la imagen de la factura' }, { status: 400 })
  if (!tipoImagenValido(file.type)) {
    return NextResponse.json({ error: 'Sube una imagen (JPG/PNG/WebP). El PDF aún no está soportado.' }, { status: 415 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const factura = await ocrFactura(base64, file.type)
  if (!factura) {
    return NextResponse.json({ error: 'No se pudo leer la factura (¿IA sin configurar o imagen ilegible?)' }, { status: 422 })
  }

  const casado = await casarFactura(session.id, factura).catch(() => null)
  return NextResponse.json({ ok: true, factura, conciliado: !!casado, movimiento: casado })
}
