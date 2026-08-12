// GET /api/admin/leads/[id]/propuesta — devuelve el HTML de la propuesta del lead.
//
// La propuesta que genera `ia/agente-cotizador` ya se persiste entera en
// `leads.propuesta_html`, así que se sirve desde ahí. Antes se subía además al bucket
// `propuestas-leads` y el panel enlazaba a su ruta pública — pero el bucket es PRIVADO y la
// subida iba con la anon key, así que el enlace nunca llevó a ninguna parte (ver el comentario
// largo en `ia/agente-cotizador/route.ts`). Con la BD como única fuente no hay dos copias que
// puedan discrepar, ni una URL que caduque, ni una clave de servicio en juego.
//
// La propuesta lleva datos del lead (nombre, precio ofertado, argumentario comercial), así que
// va con sesión y scope `empresa_id` como el resto del panel — no es una URL pública.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId, apiError } from '@/lib/tenant'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    const filas = await prisma.$queryRaw<{ propuesta_html: string | null }[]>(Prisma.sql`
      SELECT propuesta_html FROM leads
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)

    // Tres estados, no dos: sin fila = el lead no es de esta empresa (o no existe);
    // fila con `propuesta_html` NULL = el lead existe pero aún no se le ha generado nada.
    // Decirlo distinto importa: lo segundo se arregla pulsando «Generar propuesta».
    if (!filas.length) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }
    if (!filas[0].propuesta_html) {
      return NextResponse.json({ error: 'Este lead todavía no tiene propuesta generada' }, { status: 404 })
    }

    return new NextResponse(filas[0].propuesta_html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Lleva datos comerciales de un cliente potencial: que no quede en caches intermedias.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
