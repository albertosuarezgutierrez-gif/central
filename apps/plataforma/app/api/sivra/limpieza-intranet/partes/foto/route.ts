import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { accesoLimpieza } from '@/lib/limpieza-acceso'

export const dynamic = 'force-dynamic'

// GET /api/sivra/limpieza-intranet/partes/foto?id=N — sirve la foto de un parte desde la BD.
// Autenticada como el resto de la intranet (sesión de Alberto o cookie de invitado de Si que Brilla):
// las fotos no tienen URL pública a propósito.
export async function GET(req: NextRequest) {
  const modo = await accesoLimpieza()
  if (!modo) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  try {
    const [fila] = await prisma.$queryRaw<Array<{ foto: Buffer | null; foto_mime: string | null }>>`
      SELECT foto, foto_mime FROM limpieza_partes WHERE id = ${id}
    `
    if (!fila?.foto) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })
    return new NextResponse(new Uint8Array(fila.foto), {
      headers: {
        'Content-Type': fila.foto_mime || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[limpieza-intranet/partes/foto]', err)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
