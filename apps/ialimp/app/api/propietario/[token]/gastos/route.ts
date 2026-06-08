import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Verificar token propietario
async function getCliente(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id::text, c.empresa_id::text, c.nombre
    FROM clientes c
    WHERE c.access_token = ${token} AND c.notif_activa = true
    LIMIT 1
  `)
  return rows[0] || null
}

// GET — listar gastos del propietario
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const propiedad_id = searchParams.get('propiedad_id')

    const gastos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        g.id::text, g.tipo, g.nombre, g.importe::float,
        g.periodicidad, g.fecha_inicio::text, g.fecha_vencimiento::text,
        g.fecha_proximo_cargo::text, g.proveedor, g.numero_poliza,
        g.es_ingreso, g.notas, g.alerta_dias, g.alerta_enviada,
        g.propiedad_id::text, p.nombre AS propiedad_nombre,
        g.creado_at::text,
        CASE
          WHEN g.fecha_vencimiento IS NULL THEN NULL
          WHEN g.fecha_vencimiento < CURRENT_DATE THEN 'vencido'
          WHEN (g.fecha_vencimiento - CURRENT_DATE) <= g.alerta_dias THEN 'proximo'
          ELSE 'activo'
        END AS estado_vencimiento,
        (g.fecha_vencimiento - CURRENT_DATE)::int AS dias_para_vencer
      FROM propietario_gastos g
      LEFT JOIN propiedades p ON p.id = g.propiedad_id
      WHERE g.cliente_id = ${cliente.id}::uuid
        AND g.activo = true
        ${propiedad_id ? Prisma.sql`AND g.propiedad_id = ${propiedad_id}::uuid` : Prisma.sql``}
      ORDER BY g.es_ingreso, g.fecha_vencimiento NULLS LAST, g.tipo
    `)

    // Totales
    const total_gastos  = gastos.filter(g => !g.es_ingreso).reduce((a, g) => a + (g.importe || 0), 0)
    const total_ingresos = gastos.filter(g => g.es_ingreso).reduce((a, g) => a + (g.importe || 0), 0)
    const proximos_vencer = gastos.filter(g => g.estado_vencimiento === 'proximo').length

    return NextResponse.json({ gastos, total_gastos, total_ingresos, proximos_vencer })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear gasto
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const body = await req.json()
    const {
      tipo, nombre, importe, periodicidad, categoria, recurrente,
      mes, anio, fecha_inicio, fecha_vencimiento, fecha_proximo_cargo,
      proveedor, numero_poliza, es_ingreso, notas, alerta_dias,
      propiedad_id
    } = body

    if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

    let proximo = fecha_proximo_cargo || null
    if (!proximo && fecha_vencimiento) proximo = fecha_vencimiento

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO propietario_gastos (
        empresa_id, cliente_id, propiedad_id, tipo, nombre, importe,
        periodicidad, categoria, recurrente, mes, anio,
        fecha_inicio, fecha_vencimiento, fecha_proximo_cargo,
        proveedor, numero_poliza, es_ingreso, notas, alerta_dias
      ) VALUES (
        ${cliente.empresa_id}::uuid,
        ${cliente.id}::uuid,
        ${propiedad_id || null},
        ${tipo || categoria || 'otros'}, ${nombre},
        ${importe ? Number(importe) : null},
        ${periodicidad || 'mensual'},
        ${categoria || 'otros'},
        ${recurrente === true},
        ${mes ? Number(mes) : null},
        ${anio ? Number(anio) : null},
        ${fecha_inicio || null}::date,
        ${fecha_vencimiento || null}::date,
        ${proximo || null}::date,
        ${proveedor || null},
        ${numero_poliza || null},
        ${es_ingreso === true},
        ${notas || null},
        ${alerta_dias ? Number(alerta_dias) : 60}
      )
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
