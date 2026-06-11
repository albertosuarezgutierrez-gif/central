import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Criterios del radar PLACSP por empresa (F7). Viven en concursos_perfil_empresa.

export async function GET() {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT radar_activo, radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  const r = rows[0]
  return NextResponse.json({
    criterios: {
      activo: r?.radar_activo ?? false,
      cpv: r?.radar_cpv ?? [],
      palabras_clave: r?.radar_palabras_clave ?? [],
      presupuesto_min: r?.radar_presupuesto_min ?? null,
      presupuesto_max: r?.radar_presupuesto_max ?? null,
    },
  })
}

export async function PUT(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const cpv: string[] = Array.isArray(b.cpv) ? b.cpv.map((x: any) => String(x).trim()).filter(Boolean) : []
  const kws: string[] = Array.isArray(b.palabras_clave) ? b.palabras_clave.map((x: any) => String(x).trim()).filter(Boolean) : []
  const min = b.presupuesto_min === '' || b.presupuesto_min == null ? null : Number(b.presupuesto_min)
  const max = b.presupuesto_max === '' || b.presupuesto_max == null ? null : Number(b.presupuesto_max)

  // El perfil puede no existir aún: upsert mínimo creando la fila si hace falta.
  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO concursos_perfil_empresa (empresa_id, razon_social, nif, radar_activo, radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max, actualizado_en)
    VALUES (${empresa_id}::uuid, '', '', ${b.activo === true}, ${cpv}::text[], ${kws}::text[], ${min}, ${max}, now())
    ON CONFLICT (empresa_id) DO UPDATE SET
      radar_activo = EXCLUDED.radar_activo,
      radar_cpv = EXCLUDED.radar_cpv,
      radar_palabras_clave = EXCLUDED.radar_palabras_clave,
      radar_presupuesto_min = EXCLUDED.radar_presupuesto_min,
      radar_presupuesto_max = EXCLUDED.radar_presupuesto_max,
      actualizado_en = now()
  `)
  return NextResponse.json({ ok: true })
}
