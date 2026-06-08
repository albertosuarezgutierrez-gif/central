import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// POST — genera partes de trabajo a partir de las sesiones COMPLETADAS del
// rango con limpiadora asignada. Casa cada sesión con el catálogo (por
// propiedad o por nombre) para tomar precio/tiempo. Idempotente: una sesión
// solo genera un parte (ux_partes_session) → se puede relanzar sin duplicar.
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { desde, hasta } = await req.json()
    if (!desde || !hasta) return NextResponse.json({ error: 'desde/hasta requeridos' }, { status: 400 })

    const inserted = await prisma.$executeRaw(Prisma.sql`
      INSERT INTO partes_trabajo
        (empresa_id, limpiadora_id, fecha, catalogo_id, session_id, concepto, tiempo_min, importe, cantidad, origen)
      SELECT cs.empresa_id, cs.limpiadora_id, cs.session_date, ct.id, cs.id,
             COALESCE(ct.nombre, NULLIF(cs.property_name,''), NULLIF(cs.tipo_servicio,''), 'Limpieza'),
             COALESCE(
               CASE WHEN cs.hora_llegada IS NOT NULL AND cs.hora_salida IS NOT NULL
                    THEN ROUND(EXTRACT(EPOCH FROM (cs.hora_salida - cs.hora_llegada))/60)::int END,
               ct.tiempo_min, cs.tiempo_estimado),
             COALESCE(ct.precio, 0), 1, 'sesion'
      FROM cleaning_sessions cs
      LEFT JOIN LATERAL (
        SELECT c.id, c.nombre, c.tiempo_min, c.precio
        FROM catalogo_tarifas c
        WHERE c.empresa_id = cs.empresa_id
          AND ( c.propiedad_id = cs.propiedad_id
                OR lower(c.nombre) = lower(NULLIF(cs.property_name,'')) )
        ORDER BY (c.propiedad_id = cs.propiedad_id) DESC NULLS LAST
        LIMIT 1
      ) ct ON true
      WHERE cs.empresa_id = ${empresa_id}::uuid
        AND cs.limpiadora_id IS NOT NULL
        AND cs.completed_at IS NOT NULL
        AND cs.session_date BETWEEN ${desde}::date AND ${hasta}::date
      ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO NOTHING
    `)
    return NextResponse.json({ ok: true, generados: inserted })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
