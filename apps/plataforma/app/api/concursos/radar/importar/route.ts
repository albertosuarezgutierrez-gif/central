import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { matchesDeAtom } from '@/lib/concursos-radar'
import type { CriteriosRadar } from '@central/module-concursos'

export const maxDuration = 60

// Import manual: recibe un ATOM (campo `xml`), lo empareja con los criterios de
// la empresa y guarda los matches nuevos. Devuelve cuántos se añadieron.

export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }) }
  const xml = String(b?.xml ?? '')
  if (!xml.trim()) return NextResponse.json({ error: 'Falta el ATOM (campo xml)' }, { status: 400 })

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  const r = rows[0] ?? {}
  const criterios: CriteriosRadar = {
    cpv: r.radar_cpv ?? [],
    palabras_clave: r.radar_palabras_clave ?? [],
    presupuesto_min: r.radar_presupuesto_min ?? undefined,
    presupuesto_max: r.radar_presupuesto_max ?? undefined,
  }

  const matches = matchesDeAtom(xml, criterios)
  let nuevos = 0
  for (const m of matches) {
    const res = await prisma.$executeRaw(Prisma.sql`
      INSERT INTO concursos_radar_anuncios (empresa_id, dedupe_key, anuncio, puntuacion, motivos)
      VALUES (${empresa_id}::uuid, ${m.dedupe_key}, ${JSON.stringify(m.anuncio)}::jsonb, ${m.puntuacion}, ${JSON.stringify(m.motivos)}::jsonb)
      ON CONFLICT (empresa_id, dedupe_key) DO NOTHING
    `)
    nuevos += Number(res) > 0 ? 1 : 0
  }
  return NextResponse.json({ ok: true, encontrados: matches.length, nuevos })
}
