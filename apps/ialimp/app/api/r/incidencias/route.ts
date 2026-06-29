import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

async function getRepartidor() {
  const jar = await cookies()
  const token = jar.get('repartidor_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id, r.empresa_id, r.nombre
    FROM repartidor_sessions s
    JOIN repartidores r ON r.id = s.repartidor_id
    WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true
    LIMIT 1
  `)
  return rows[0] || null
}

// POST — reportar incidencia desde una parada
export async function POST(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { parada_id, tipo_incidencia, nota, foto_url } = await req.json()
  if (!parada_id || !tipo_incidencia) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, titulo, propiedad_id FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND repartidor_id = ${rep.id}::uuid
    LIMIT 1
  `)
  if (!parada.length) return NextResponse.json({ error: 'Parada no encontrada' }, { status: 404 })

  const cuerpo = [
    `Parada: ${parada[0].titulo}`,
    `Problema: ${tipo_incidencia}`,
    nota ? `Nota: ${nota}` : '',
    foto_url ? `Foto adjunta` : '',
  ].filter(Boolean).join(' | ')

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO campo_notificaciones
      (empresa_id, tipo, titulo, cuerpo, parada_id, propiedad_id)
    VALUES (
      ${rep.empresa_id}::uuid,
      'incidencia_repartidor',
      ${'🚨 ' + rep.nombre + ': ' + tipo_incidencia},
      ${cuerpo},
      ${parada_id}::uuid,
      ${parada[0].propiedad_id || null}
    )
  `)

  return NextResponse.json({ ok: true })
}
