import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — items de una parada (admin)
export async function GET(req: Request) {
  const empresa_id = await requireEmpresaId()
  const parada_id = new URL(req.url).searchParams.get('parada_id')
  if (!parada_id) return NextResponse.json({ error: 'Falta parada_id' }, { status: 400 })

  const items = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT pi.id::text, pi.orden, pi.texto, pi.obligatorio, pi.requiere_foto,
           pi.completado, pi.completado_at, pi.foto_url
    FROM repartidor_parada_items pi
    JOIN repartidor_paradas rp ON rp.id = pi.parada_id
    WHERE pi.parada_id = ${parada_id}::uuid AND rp.empresa_id = ${empresa_id}::uuid
    ORDER BY pi.orden ASC
  `)

  return NextResponse.json({ items })
}
