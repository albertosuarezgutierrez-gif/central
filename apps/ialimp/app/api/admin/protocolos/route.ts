import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// GET /api/admin/protocolos?propiedad_id=...  (o ?session_id=...)
// Devuelve el protocolo activo del piso con sus items y fotos.
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const sp = req.nextUrl.searchParams
    let propiedad_id = sp.get('propiedad_id')
    const session_id = sp.get('session_id')
    if (!propiedad_id && session_id) {
      const s = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT propiedad_id::text AS propiedad_id FROM cleaning_sessions WHERE id = ${session_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
      propiedad_id = s[0]?.propiedad_id || null
    }
    if (!propiedad_id) return NextResponse.json({ error: 'propiedad_id o session_id requerido' }, { status: 400 })

    const prot = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text AS id, nombre, datos FROM protocolos WHERE propiedad_id = ${propiedad_id}::uuid AND activo AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
    if (!prot.length) return NextResponse.json({ protocolo: null })

    const pid = prot[0].id
    const items = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT estancia, item_key, descripcion, requiere_foto, orden FROM protocolo_items WHERE protocolo_id = ${pid}::uuid ORDER BY orden`)
    const fotos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT item_key, estancia, categoria, url, caption, orden FROM protocolo_fotos WHERE protocolo_id = ${pid}::uuid ORDER BY orden`)

    return NextResponse.json({ protocolo: { ...prot[0], items, fotos } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
