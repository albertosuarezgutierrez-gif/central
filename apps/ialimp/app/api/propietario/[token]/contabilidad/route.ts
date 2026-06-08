import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function getCliente(token: string) {
  const r = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id::text, c.empresa_id::text, c.nombre
    FROM clientes c WHERE c.access_token = ${token} LIMIT 1
  `)
  return r[0] || null
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const anio = searchParams.get('anio') || new Date().getFullYear().toString()
    const propiedad_id = searchParams.get('propiedad_id') // null = todas

    const propFiltro = propiedad_id
      ? Prisma.sql`AND g.propiedad_id = ${propiedad_id}::uuid`
      : Prisma.sql``
    const propFiltroI = propiedad_id
      ? Prisma.sql`AND i.propiedad_id = ${propiedad_id}::uuid`
      : Prisma.sql``

    // ── Propiedades del cliente ──
    const propiedades = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, nombre FROM propiedades
      WHERE cliente_id = ${cliente.id}::uuid AND empresa_id = ${cliente.empresa_id}::uuid AND activa = true ORDER BY nombre
    `)

    // ── Gastos del año por mes y categoría ──
    const gastos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        g.id::text, g.nombre, g.categoria, g.importe::float,
        g.mes, g.anio, g.recurrente, g.periodicidad,
        g.proveedor, g.notas, g.justificante_url,
        g.fecha_inicio::text,
        g.fecha_vencimiento::text, g.fecha_proximo_cargo::text,
        g.propiedad_id::text, p.nombre AS propiedad_nombre,
        g.creado_at::text,
        CASE
          WHEN g.fecha_vencimiento IS NULL THEN 'activo'
          WHEN g.fecha_vencimiento < CURRENT_DATE THEN 'vencido'
          WHEN (g.fecha_vencimiento - CURRENT_DATE) <= COALESCE(g.alerta_dias,60) THEN 'proximo'
          ELSE 'activo'
        END AS estado_vencimiento
      FROM propietario_gastos g
      LEFT JOIN propiedades p ON p.id = g.propiedad_id
      WHERE g.cliente_id = ${cliente.id}::uuid AND g.empresa_id = ${cliente.empresa_id}::uuid
        AND g.activo = true
        AND (g.anio = ${parseInt(anio)} OR g.anio IS NULL)
        AND g.es_ingreso = false
        ${propFiltro}
      ORDER BY g.mes NULLS LAST, g.categoria, g.nombre
    `)

    // ── Ingresos del año ──
    const ingresos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        i.id::text, i.concepto, i.importe::float,
        i.fecha::text, i.portal, i.num_noches, i.notas,
        i.propiedad_id::text, p.nombre AS propiedad_nombre,
        EXTRACT(MONTH FROM i.fecha)::int AS mes,
        EXTRACT(YEAR FROM i.fecha)::int AS anio
      FROM propietario_ingresos i
      LEFT JOIN propiedades p ON p.id = i.propiedad_id
      WHERE i.cliente_id = ${cliente.id}::uuid AND i.empresa_id = ${cliente.empresa_id}::uuid
        AND EXTRACT(YEAR FROM i.fecha) = ${parseInt(anio)}
        ${propFiltroI}
      ORDER BY i.fecha DESC
    `)

    // ── Coste de limpieza = FACTURAS EMITIDAS (fuente del gasto), desglosado por piso ──
    // Cabeceras de factura del año (se ignoran borradores)
    const factCab = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT f.id::text, f.numero_factura,
             f.periodo_desde::text, f.periodo_hasta::text, f.fecha_emision::text,
             f.estado, f.concepto,
             f.base_imponible::float, f.iva_porcentaje::float,
             f.iva_importe::float, f.total::float,
             f.dest_razon_social, f.dest_nif
      FROM facturas_clientes f
      WHERE f.cliente_id = ${cliente.id}::uuid AND f.empresa_id = ${cliente.empresa_id}::uuid
        AND f.estado <> 'borrador'
        AND EXTRACT(YEAR FROM f.periodo_desde) = ${parseInt(anio)}
      ORDER BY f.periodo_desde DESC, f.numero_factura DESC
    `)
    // Líneas de esas facturas (cada línea sabe su piso → imputación por propiedad)
    const factLin = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT fl.factura_id::text, fl.descripcion,
             fl.cantidad::float, fl.precio_unitario::float,
             COALESCE(fl.importe, fl.cantidad * fl.precio_unitario)::float AS importe,
             fl.propiedad_id::text, p.nombre AS propiedad_nombre,
             EXTRACT(MONTH FROM f.periodo_desde)::int AS mes
      FROM factura_clientes_lineas fl
      JOIN facturas_clientes f ON f.id = fl.factura_id
      LEFT JOIN propiedades p ON p.id = fl.propiedad_id
      WHERE f.cliente_id = ${cliente.id}::uuid AND f.empresa_id = ${cliente.empresa_id}::uuid
        AND f.estado <> 'borrador'
        AND EXTRACT(YEAR FROM f.periodo_desde) = ${parseInt(anio)}
        ${propiedad_id ? Prisma.sql`AND fl.propiedad_id = ${propiedad_id}::uuid` : Prisma.sql``}
      ORDER BY fl.orden ASC
    `)

    // Agregado por mes + propiedad — misma forma que el cálculo anterior por sesión
    const limpMap: Record<string, any> = {}
    factLin.forEach((l: any) => {
      const key = `${l.mes}|${l.propiedad_id || 'sin'}`
      if (!limpMap[key]) limpMap[key] = {
        mes: Number(l.mes), propiedad_id: l.propiedad_id,
        propiedad_nombre: l.propiedad_nombre, num_limpiezas: 0, coste_limpiezas: 0,
      }
      limpMap[key].num_limpiezas   += Number(l.cantidad || 0)
      limpMap[key].coste_limpiezas += Number(l.importe || 0)
    })
    const limpiezas = Object.values(limpMap)

    // Facturas con sus líneas (para mostrar y descargar en el panel del dueño)
    const lineasPorFactura: Record<string, any[]> = {}
    factLin.forEach((l: any) => {
      if (!lineasPorFactura[l.factura_id]) lineasPorFactura[l.factura_id] = []
      lineasPorFactura[l.factura_id].push({
        descripcion: l.descripcion, cantidad: l.cantidad,
        precio_unitario: l.precio_unitario, importe: l.importe,
        propiedad_id: l.propiedad_id, propiedad_nombre: l.propiedad_nombre,
      })
    })
    const facturas = factCab.map((f: any) => ({ ...f, lineas: lineasPorFactura[f.id] || [] }))

    // ── KPIs por mes (gastos + ingresos agrupados) ──
    const kpisMes = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const gastosM  = gastos.filter(g => !g.mes || g.mes === mes)
                             .reduce((a, g) => a + (g.importe || 0), 0)
      const ingresosM = ingresos.filter(ing => ing.mes === mes)
                                .reduce((a, ing) => a + (ing.importe || 0), 0)
      const limpiezasM = limpiezas.filter(l => l.mes === mes)
                                  .reduce((a, l) => a + (l.coste_limpiezas || 0), 0)
      return {
        mes, nombre: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][i],
        gastos: Math.round((gastosM + limpiezasM) * 100) / 100,
        ingresos: Math.round(ingresosM * 100) / 100,
        beneficio: Math.round((ingresosM - gastosM - limpiezasM) * 100) / 100,
      }
    })

    // ── Gastos por categoría ──
    const categorias: Record<string, number> = {}
    gastos.forEach(g => {
      const cat = g.categoria || 'otros'
      categorias[cat] = (categorias[cat] || 0) + (g.importe || 0)
    })
    const totalCosteReparaciones = limpiezas.reduce((a, l) => a + (l.coste_limpiezas || 0), 0)
    if (totalCosteReparaciones > 0) categorias['limpieza'] = (categorias['limpieza'] || 0) + totalCosteReparaciones

    // ── Totales ──
    const totalGastos   = gastos.reduce((a, g) => a + (g.importe || 0), 0) + totalCosteReparaciones
    const totalIngresos = ingresos.reduce((a, i) => a + (i.importe || 0), 0)
    const beneficioNeto = totalIngresos - totalGastos
    const margen        = totalIngresos > 0 ? Math.round((beneficioNeto / totalIngresos) * 100) : 0
    const totalLimpiezas = limpiezas.reduce((a, l) => a + (l.num_limpiezas || 0), 0)

    // ── Gasto por propiedad ──
    const porPropiedad: Record<string, any> = {}
    propiedades.forEach((p: any) => {
      porPropiedad[p.id] = { nombre: p.nombre, gastos: 0, ingresos: 0, limpiezas: 0 }
    })
    gastos.forEach(g => {
      if (g.propiedad_id && porPropiedad[g.propiedad_id])
        porPropiedad[g.propiedad_id].gastos += g.importe || 0
    })
    ingresos.forEach(i => {
      if (i.propiedad_id && porPropiedad[i.propiedad_id])
        porPropiedad[i.propiedad_id].ingresos += i.importe || 0
    })
    limpiezas.forEach(l => {
      if (l.propiedad_id && porPropiedad[l.propiedad_id]) {
        porPropiedad[l.propiedad_id].gastos   += l.coste_limpiezas || 0
        porPropiedad[l.propiedad_id].limpiezas += l.num_limpiezas || 0
      }
    })

    return NextResponse.json({
      ok: true, anio: parseInt(anio),
      propiedades, gastos, ingresos, limpiezas, facturas,
      kpisMes, categorias, porPropiedad,
      totales: { totalGastos, totalIngresos, beneficioNeto, margen, totalLimpiezas }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear ingreso manual
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    const { concepto, importe, fecha, portal, num_noches, notas, propiedad_id } = await req.json()
    if (!concepto || !importe || !fecha) return NextResponse.json({ error: 'concepto, importe y fecha requeridos' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO propietario_ingresos (empresa_id, cliente_id, propiedad_id, concepto, importe, fecha, portal, num_noches, notas)
      VALUES (${cliente.empresa_id}::uuid, ${cliente.id}::uuid,
        ${propiedad_id || null}::uuid,
        ${concepto}, ${Number(importe)}, ${fecha}::date,
        ${portal || 'directo'}, ${num_noches ? Number(num_noches) : null}, ${notas || null})
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
