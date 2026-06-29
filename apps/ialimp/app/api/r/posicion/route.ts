import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

// Haversine inline (sin dep externa)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('repartidor_token')?.value
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id, r.empresa_id
    FROM repartidor_sessions s
    JOIN repartidores r ON r.id = s.repartidor_id
    WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true
    LIMIT 1
  `)
  if (!rows.length) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const rep = rows[0]

  const { lat, lng, precision_m, speed_kmh } = await req.json()
  if (!lat || !lng) return NextResponse.json({ error: 'Falta lat/lng' }, { status: 400 })

  // Guardar posición
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO repartidor_posiciones (repartidor_id, empresa_id, lat, lng, precision_m, speed_kmh)
    VALUES (${rep.id}::uuid, ${rep.empresa_id}::uuid, ${lat}, ${lng}, ${precision_m || null}, ${speed_kmh || null})
  `)

  // Purgar posiciones >48h para no inflar la tabla
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM repartidor_posiciones
    WHERE repartidor_id = ${rep.id}::uuid AND recorded_at < now() - interval '48 hours'
  `)

  // Recalcular ETA para la próxima parada no completada de hoy con coordenadas
  const hoy = new Date().toISOString().split('T')[0]
  const proxima = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT rp.id, rp.huesped_telefono, p.lat AS prop_lat, p.lng AS prop_lng
    FROM repartidor_paradas rp
    JOIN propiedades p ON p.id = rp.propiedad_id
    WHERE rp.repartidor_id = ${rep.id}::uuid
      AND rp.session_date = ${hoy}::date
      AND rp.completada = false
      AND p.lat IS NOT NULL AND p.lng IS NOT NULL
    ORDER BY rp.orden ASC
    LIMIT 1
  `)

  let etaMinutos: number | null = null
  if (proxima.length) {
    const { prop_lat, prop_lng, id: paradaId, huesped_telefono } = proxima[0]
    const distKm = haversineKm(lat, lng, prop_lat, prop_lng)
    const velocidadKmh = speed_kmh && speed_kmh > 2 ? speed_kmh : 25 // default urbano
    etaMinutos = Math.max(1, Math.round((distKm / velocidadKmh) * 60))

    await prisma.$executeRaw(Prisma.sql`
      UPDATE repartidor_paradas
      SET eta_minutos = ${etaMinutos}, eta_calculado_at = now()
      WHERE id = ${paradaId}::uuid
    `)

    // Si ETA ≤ 15 min y hay teléfono de huésped → alerta admin para avisar al huésped
    if (etaMinutos <= 15 && huesped_telefono) {
      const recienteHuesped = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM campo_notificaciones
        WHERE tipo = 'huesped_eta_alerta'
          AND parada_id = ${paradaId}::uuid
          AND created_at > now() - interval '20 minutes'
        LIMIT 1
      `)
      if (!recienteHuesped.length) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO campo_notificaciones (empresa_id, tipo, titulo, cuerpo, parada_id)
          VALUES (
            ${rep.empresa_id}::uuid,
            'huesped_eta_alerta',
            ${'📱 Avisar al huésped — llega en ' + etaMinutos + ' min'},
            ${'El repartidor llega en ' + etaMinutos + ' min. Huésped: ' + huesped_telefono},
            ${paradaId}::uuid
          )
        `)
      }
    }

    // Si ETA ≤ 10 min → notificación a la limpiadora asignada a esa parada
    if (etaMinutos <= 10) {
      const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT limpiadora_id, propiedad_id, tipo
        FROM repartidor_paradas
        WHERE id = ${paradaId}::uuid AND limpiadora_id IS NOT NULL
        LIMIT 1
      `)
      if (parada.length) {
        // Verificar que no enviamos la misma notificación hace <15 min
        const reciente = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT id FROM campo_notificaciones
          WHERE dest_limpiadora_id = ${parada[0].limpiadora_id}::uuid
            AND tipo = 'repartidor_cerca'
            AND parada_id = ${paradaId}::uuid
            AND created_at > now() - interval '15 minutes'
          LIMIT 1
        `)
        if (!reciente.length) {
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO campo_notificaciones
              (empresa_id, tipo, titulo, cuerpo, dest_limpiadora_id, parada_id, propiedad_id)
            VALUES (
              ${rep.empresa_id}::uuid,
              'repartidor_cerca',
              ${'🚐 El repartidor llega en ' + etaMinutos + ' min'},
              ${'Prepárate: el repartidor está a ' + etaMinutos + ' minutos del piso.'},
              ${parada[0].limpiadora_id}::uuid,
              ${paradaId}::uuid,
              ${parada[0].propiedad_id || null}
            )
          `)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, eta_minutos: etaMinutos })
}
