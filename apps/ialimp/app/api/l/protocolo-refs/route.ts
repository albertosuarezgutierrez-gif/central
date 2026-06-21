import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// GET /api/l/protocolo-refs?session_id=...
// Devuelve { item_key: url } de las fotos OBJETIVO del piso de la sesión.
// Se usa en /l para poblar item.foto_referencia_url (botón "Ver referencia").
export async function GET(req: NextRequest) {
  try {
    const session_id = req.nextUrl.searchParams.get('session_id')
    if (!session_id) return NextResponse.json({})
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT pf.item_key, pf.url
      FROM cleaning_sessions cs
      JOIN protocolos p ON p.propiedad_id = cs.propiedad_id AND p.activo
      JOIN protocolo_fotos pf
        ON pf.protocolo_id = p.id AND pf.categoria = 'objetivo' AND pf.item_key IS NOT NULL
      WHERE cs.id = ${session_id}::uuid
    `)
    const map: Record<string, string> = {}
    for (const r of rows) map[r.item_key] = r.url
    return NextResponse.json(map)
  } catch (_) {
    return NextResponse.json({}) // no crítico: /l funciona aunque no haya protocolo
  }
}
