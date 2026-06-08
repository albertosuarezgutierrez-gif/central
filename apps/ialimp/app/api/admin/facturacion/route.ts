import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const lid = new URL(req.url).searchParams.get('limpiadora_id')
  const cond = lid ? Prisma.sql`AND f.limpiadora_id = ${lid}::uuid` : Prisma.empty
  const facturas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT f.*, l.nombre as limpiadora_nombre
    FROM facturas_limpiadoras f
    JOIN limpiadoras l ON l.id = f.limpiadora_id
    WHERE f.empresa_id = ${empresa_id}::uuid ${cond}
    ORDER BY f.periodo_inicio DESC
  `)
  return NextResponse.json({ facturas })
}

export async function POST(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const b = await req.json()
  const { limpiadora_id, desde, hasta } = b
  // La limpiadora debe ser de esta empresa.
  const own = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM limpiadoras WHERE id = ${limpiadora_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
  `)
  if (!own.length) return NextResponse.json({ error: 'Limpiadora no válida' }, { status: 403 })

  // Obtener sesiones del período
  const sessions = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT cs.*,
      CASE WHEN cs.hora_llegada IS NOT NULL AND cs.hora_salida IS NOT NULL
        THEN EXTRACT(EPOCH FROM (cs.hora_salida - cs.hora_llegada))/3600
        ELSE COALESCE(cs.tiempo_estimado,120)/60.0
      END as horas_reales
    FROM cleaning_sessions cs
    WHERE cs.limpiadora_id = ${limpiadora_id}::uuid
      AND cs.session_date BETWEEN ${desde}::date AND ${hasta}::date
      AND cs.completed_at IS NOT NULL
    ORDER BY cs.session_date
  `)

  const tarifa = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM tarifas_limpiadoras
    WHERE limpiadora_id = ${limpiadora_id}::uuid AND property_id = '__all__' AND activo = true
    LIMIT 1
  `)

  const t = tarifa[0]
  let totalH = 0, totalImporte = 0
  const lineas: any[] = []

  for (const s of sessions as any[]) {
    const horas = Number(s.horas_reales || 0)
    totalH += horas
    const imp = t
      ? (t.tipo === 'hora' ? horas * Number(t.importe) : Number(t.importe))
      : 0
    totalImporte += imp
    lineas.push({
      session_id: s.id,
      property_id: s.property_id,
      fecha: s.session_date,
      descripcion: `Limpieza ${new Date(s.session_date).toLocaleDateString('es-ES')}`,
      horas: Math.round(horas*100)/100,
      tarifa: t ? Number(t.importe) : 0,
      importe: Math.round(imp*100)/100,
    })
  }

  const num = `FAC-${Date.now().toString().slice(-6)}`
  const factura = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO facturas_limpiadoras
      (empresa_id, limpiadora_id, numero, periodo_inicio, periodo_fin, num_sesiones, total_horas, importe_total)
    VALUES (${empresa_id}::uuid, ${limpiadora_id}::uuid, ${num}, ${desde}::date, ${hasta}::date,
            ${sessions.length}, ${Math.round(totalH*100)/100}, ${Math.round(totalImporte*100)/100})
    RETURNING *
  `)
  const fid = (factura as any[])[0].id

  for (const ln of lineas) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO factura_lineas (factura_id, session_id, property_id, fecha, descripcion, horas, tarifa, importe)
      VALUES (${fid}::uuid, ${ln.session_id}::uuid, ${ln.property_id}, ${ln.fecha}::date,
              ${ln.descripcion}, ${ln.horas}, ${ln.tarifa}, ${ln.importe})
    `)
  }

  return NextResponse.json({ factura: (factura as any[])[0], lineas })
}

export async function PUT(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const { id, estado } = await req.json()
  await prisma.$executeRaw(Prisma.sql`UPDATE facturas_limpiadoras SET estado=${estado} WHERE id=${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
  return NextResponse.json({ ok: true })
}
