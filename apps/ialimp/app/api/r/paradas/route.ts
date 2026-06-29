import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

async function getRepartidor() {
  const cookieStore = await cookies()
  const token = cookieStore.get('repartidor_token')?.value
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

// GET — paradas de hoy (o fecha especificada)
export async function GET(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const fecha = new URL(req.url).searchParams.get('fecha') || new Date().toISOString().split('T')[0]

  const paradas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      rp.id::text,
      rp.orden,
      rp.tipo,
      rp.titulo,
      rp.direccion,
      rp.notas,
      rp.completada,
      rp.completada_at,
      rp.foto_url,
      rp.nota_completada,
      rp.eta_minutos,
      rp.eta_calculado_at,
      rp.propiedad_id::text,
      rp.cleaning_session_id::text,
      rp.limpiadora_id::text,
      p.nombre AS propiedad_nombre,
      p.lat    AS propiedad_lat,
      p.lng    AS propiedad_lng,
      l.nombre AS limpiadora_nombre
    FROM repartidor_paradas rp
    LEFT JOIN propiedades p ON p.id = rp.propiedad_id
    LEFT JOIN limpiadoras l ON l.id = rp.limpiadora_id
    WHERE rp.repartidor_id = ${rep.id}::uuid
      AND rp.session_date  = ${fecha}::date
    ORDER BY rp.completada ASC, rp.orden ASC
  `)

  // Última posición conocida del repartidor
  const posRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT lat, lng, recorded_at
    FROM repartidor_posiciones
    WHERE repartidor_id = ${rep.id}::uuid
    ORDER BY recorded_at DESC LIMIT 1
  `)

  return NextResponse.json({ paradas, posicion: posRows[0] || null })
}

// PATCH — completar parada
export async function PATCH(req: Request) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { parada_id, nota_completada, foto_url } = await req.json()
  if (!parada_id) return NextResponse.json({ error: 'Falta parada_id' }, { status: 400 })

  // Verificar que la parada pertenece a este repartidor
  const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, tipo, cleaning_session_id, limpiadora_id, propiedad_id
    FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND repartidor_id = ${rep.id}::uuid
    LIMIT 1
  `)
  if (!parada.length) return NextResponse.json({ error: 'Parada no encontrada' }, { status: 404 })

  await prisma.$executeRaw(Prisma.sql`
    UPDATE repartidor_paradas
    SET completada = true, completada_at = now(),
        nota_completada = ${nota_completada || null},
        foto_url = ${foto_url || null},
        updated_at = now()
    WHERE id = ${parada_id}::uuid
  `)

  const p = parada[0]

  // Notificaciones automáticas cruzadas
  if (p.tipo === 'abrir_piso' && p.limpiadora_id) {
    // Piso abierto → avisar a la limpiadora
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO campo_notificaciones
        (empresa_id, tipo, titulo, cuerpo, dest_limpiadora_id, parada_id, propiedad_id)
      VALUES (
        ${rep.empresa_id}::uuid,
        'piso_abierto',
        '🔑 Piso abierto',
        ${'El repartidor ha abierto el piso. Puedes entrar a limpiar.'},
        ${p.limpiadora_id}::uuid,
        ${parada_id}::uuid,
        ${p.propiedad_id || null}
      )
    `)
  }

  if (p.tipo === 'recoger_ropa' && p.limpiadora_id) {
    // Recogida lista → avisar a la limpiadora
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO campo_notificaciones
        (empresa_id, tipo, titulo, cuerpo, dest_limpiadora_id, parada_id, propiedad_id)
      VALUES (
        ${rep.empresa_id}::uuid,
        'recogida_completada',
        '✅ Ropa recogida',
        ${'El repartidor ha recogido la ropa sucia.'},
        ${p.limpiadora_id}::uuid,
        ${parada_id}::uuid,
        ${p.propiedad_id || null}
      )
    `)
  }

  return NextResponse.json({ ok: true })
}
