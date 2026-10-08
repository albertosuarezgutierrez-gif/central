import { NextResponse } from 'next/server'

import { descargarEstudioPdf } from '@/lib/presupuesto-pdf'
import { descargaNoEncontrada, descargaSinSesion } from '@/lib/respuesta-descarga'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/presupuesto/pdf?id= — el estudio comparativo de un presupuesto de OFERTAS, en PDF.
 * La identidad sale de la SESIÓN; asegura resuelve la ficha (`portal_vinculo`) y solo entrega el de
 * SU ficha, ya enviado y de origen ofertas. Se abre con un `<a href>`: los errores van como página.
 */
export async function GET(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return descargaSinSesion(req, { estado: 'sin_sesion' })
  }
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID.test(id)) return descargaNoEncontrada(req, { estado: 'no_encontrado' })
  const r = await descargarEstudioPdf(identidad.id, id)
  if (r.estado === 'ok') {
    return new NextResponse(new Uint8Array(r.bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${r.nombre}"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    })
  }
  if (r.estado === 'error') return NextResponse.json({ estado: 'error' }, { status: 503 })
  return descargaNoEncontrada(req, { estado: r.estado })
}
