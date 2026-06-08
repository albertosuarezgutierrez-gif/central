import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'

// GET /api/l/consumo?session_id=xxx
// Devuelve los productos disponibles + consumos ya registrados para esta sesión
export async function GET(req: NextRequest) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  if (!session_id) return NextResponse.json({ error: 'session_id requerido' }, { status: 400 })

  try {
    // La sesión debe ser de la empresa de la limpiadora.
    const sesRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT cs.empresa_id, cs.property_name, cs.tipo_servicio
      FROM cleaning_sessions cs
      WHERE cs.id = ${session_id}::uuid AND cs.empresa_id = ${sess.empresa_id}::uuid
      LIMIT 1
    `)
    if (!sesRows.length) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    const { empresa_id } = sesRows[0]

    // Productos disponibles del stock de la empresa
    const productos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, categoria, unidad, stock_actual, precio_unitario
      FROM productos_stock
      WHERE empresa_id = ${empresa_id}::uuid AND activo = true
      ORDER BY categoria, nombre
    `)

    // Consumos ya guardados para esta sesión
    const consumos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT sc.*, ps.nombre as producto_nombre, ps.unidad as producto_unidad
      FROM stock_consumos sc
      JOIN productos_stock ps ON ps.id = sc.producto_id
      WHERE sc.session_id = ${session_id}::uuid
    `)

    return NextResponse.json({ productos, consumos, sesion: sesRows[0] })
  } catch (e: any) {
    console.error('[consumo GET]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/l/consumo
// Guarda o actualiza el consumo de un producto en una sesión
export async function POST(req: NextRequest) {
  try {
    const sess = await getLimpiadoraSession()
    if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { session_id, lineas } = await req.json()
    // lineas: [{ producto_id, cantidad, notas? }]

    if (!session_id || !Array.isArray(lineas)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    // La sesión debe ser de la empresa de la limpiadora.
    const sesRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT empresa_id FROM cleaning_sessions WHERE id = ${session_id}::uuid AND empresa_id = ${sess.empresa_id}::uuid LIMIT 1
    `)
    if (!sesRows.length) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    const empresa_id = sess.empresa_id
    const limpiadora_id = sess.limpiadora_id

    const resultados: any[] = []

    for (const linea of lineas) {
      const { producto_id, cantidad, notas } = linea
      if (!producto_id || cantidad === undefined || cantidad === null) continue
      const qty = Number(cantidad)
      if (isNaN(qty) || qty < 0) continue

      // Obtener precio actual del producto (snapshot) — debe ser de la empresa.
      const prod = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT precio_unitario FROM productos_stock WHERE id = ${producto_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
      `)
      if (!prod.length) continue   // producto de otra empresa → ignorar
      const coste_unitario = prod[0]?.precio_unitario ?? null

      if (qty === 0) {
        // Si cantidad 0, eliminar el consumo si existe
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM stock_consumos
          WHERE session_id = ${session_id}::uuid AND producto_id = ${producto_id}::uuid
        `)
        resultados.push({ producto_id, accion: 'eliminado' })
        continue
      }

      // Upsert por (session_id, producto_id)
      const row = await prisma.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO stock_consumos (empresa_id, session_id, producto_id, cantidad, coste_unitario, notas, registrado_por)
        VALUES (
          ${empresa_id}::uuid,
          ${session_id}::uuid,
          ${producto_id}::uuid,
          ${qty},
          ${coste_unitario},
          ${notas ?? null},
          ${limpiadora_id || null}::uuid
        )
        ON CONFLICT (session_id, producto_id) DO UPDATE
          SET cantidad = EXCLUDED.cantidad,
              coste_unitario = EXCLUDED.coste_unitario,
              notas = EXCLUDED.notas,
              registrado_por = EXCLUDED.registrado_por
        RETURNING *
      `)
      resultados.push({ producto_id, accion: 'guardado', row: row[0] })

      // Actualizar stock_actual (descontar)
      // Solo descuenta la diferencia respecto al consumo anterior
      await prisma.$executeRaw(Prisma.sql`
        UPDATE productos_stock
        SET stock_actual = GREATEST(0, stock_actual - ${qty})
        WHERE id = ${producto_id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }

    return NextResponse.json({ ok: true, resultados })
  } catch (e: any) {
    console.error('[consumo POST]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
