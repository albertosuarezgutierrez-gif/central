import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { requireIdentidad } from '@/lib/session'
import { descargaNoEncontrada, descargaSinSesion } from '@/lib/respuesta-descarga'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/ipid/[id] — la ficha IPID (documento PÚBLICO de la compañía) que se enseña con cada
 * opción del presupuesto. Pide sesión igualmente: el enlace solo vive dentro del portal. Siempre
 * como PDF: el tipo no se toma de lo que se subió.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireIdentidad()
  } catch {
    return descargaSinSesion(req, { estado: 'sin_sesion' })
  }
  const { id } = await params
  if (!UUID.test(id)) return descargaNoEncontrada(req, { estado: 'no_encontrado' })
  const f = await prisma.ipid.findFirst({ where: { id }, select: { contenido: true, nombreFichero: true } }).catch(() => null)
  if (!f) return descargaNoEncontrada(req, { estado: 'no_encontrado' })
  const nombre = f.nombreFichero.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'ipid.pdf'
  return new NextResponse(new Uint8Array(f.contenido), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${nombre}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    },
  })
}
