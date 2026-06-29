import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — paradas de un repartidor para una fecha
export async function GET(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  const repartidor_id = searchParams.get('repartidor_id')

  const scope = repartidor_id
    ? Prisma.sql`AND rp.repartidor_id = ${repartidor_id}::uuid`
    : Prisma.empty

  const paradas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      rp.id::text, rp.orden, rp.tipo, rp.titulo, rp.direccion,
      rp.notas, rp.completada, rp.completada_at, rp.eta_minutos,
      rp.propiedad_id::text, rp.cleaning_session_id::text, rp.limpiadora_id::text,
      rep.nombre AS repartidor_nombre, rep.color AS repartidor_color,
      p.nombre   AS propiedad_nombre,
      l.nombre   AS limpiadora_nombre
    FROM repartidor_paradas rp
    JOIN repartidores rep ON rep.id = rp.repartidor_id
    LEFT JOIN propiedades p ON p.id = rp.propiedad_id
    LEFT JOIN limpiadoras l ON l.id = rp.limpiadora_id
    WHERE rp.empresa_id = ${empresa_id}::uuid
      AND rp.session_date = ${fecha}::date ${scope}
    ORDER BY rp.repartidor_id, rp.completada ASC, rp.orden ASC
  `)

  // Posiciones actuales de todos los repartidores activos hoy
  const posiciones = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT DISTINCT ON (repartidor_id)
      repartidor_id::text, lat, lng, recorded_at
    FROM repartidor_posiciones
    WHERE empresa_id = ${empresa_id}::uuid
      AND recorded_at > now() - interval '10 minutes'
    ORDER BY repartidor_id, recorded_at DESC
  `)

  return NextResponse.json({ paradas, posiciones })
}

// POST — crear parada
export async function POST(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { repartidor_id, tipo, titulo, direccion, notas, propiedad_id, cleaning_session_id, limpiadora_id, session_date, orden } = await req.json()

  if (!repartidor_id || !tipo || !titulo) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  // Verificar que el repartidor pertenece a esta empresa
  const rep = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM repartidores WHERE id = ${repartidor_id}::uuid AND empresa_id = ${empresa_id}::uuid AND activo = true LIMIT 1
  `)
  if (!rep.length) return NextResponse.json({ error: 'Repartidor no válido' }, { status: 403 })

  const fecha = session_date || new Date().toISOString().split('T')[0]

  // Calcular siguiente orden si no se especifica
  let ordenFinal = orden
  if (ordenFinal == null) {
    const maxOrden = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(MAX(orden), -1) AS max_orden FROM repartidor_paradas
      WHERE repartidor_id = ${repartidor_id}::uuid AND session_date = ${fecha}::date
    `)
    ordenFinal = (maxOrden[0]?.max_orden ?? -1) + 1
  }

  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO repartidor_paradas
      (empresa_id, repartidor_id, session_date, orden, tipo, titulo, direccion, notas,
       propiedad_id, cleaning_session_id, limpiadora_id)
    VALUES (
      ${empresa_id}::uuid, ${repartidor_id}::uuid, ${fecha}::date, ${ordenFinal},
      ${tipo}, ${titulo}, ${direccion||null}, ${notas||null},
      ${propiedad_id||null}, ${cleaning_session_id||null}, ${limpiadora_id||null}
    )
    RETURNING id::text, tipo, titulo, orden
  `)
  return NextResponse.json({ parada: row[0] }, { status: 201 })
}

// DELETE — eliminar parada (solo si no está completada)
export async function DELETE(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM repartidor_paradas
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid AND completada = false
  `)
  return NextResponse.json({ ok: true })
}
