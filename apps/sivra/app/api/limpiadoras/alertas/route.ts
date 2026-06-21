import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Polled by admin sidebar to push-notify urgent incidencias
export async function GET() {
  try {
    const urgentes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT i.id, i.titulo, i.property_id, i.urgencia, i.created_at,
             l.nombre as limpiadora_nombre
      FROM incidencias i
      LEFT JOIN limpiadoras l ON l.id = i.limpiadora_id
      WHERE i.estado = 'pendiente' AND i.urgencia = 'urgente'
        AND i.created_at > now() - interval '1 hour'
      ORDER BY i.created_at DESC
      LIMIT 5
    `)

    const stockBajo = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*) as count FROM inventario
      WHERE stock_actual < stock_minimo AND activo = true
    `)

    return NextResponse.json({
      urgentes,
      stockBajoCnt: Number(stockBajo[0]?.count || 0),
      badge: urgentes.length + Number(stockBajo[0]?.count || 0),
    })
  } catch (e: any) {
    return NextResponse.json({ urgentes: [], stockBajoCnt: 0, badge: 0 })
  }
}
