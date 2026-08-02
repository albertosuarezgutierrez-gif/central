import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { matchesDeAtom } from '@/lib/concursos-radar'
import { descargarAtom } from '@/lib/concursos-ingesta'
import { isCronAuthorized } from '@/lib/cron-auth'
import type { CriteriosRadar } from '@central/module-concursos'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  let xml = ''
  try { xml = await descargarAtom() }
  catch (e: any) { return NextResponse.json({ ok: false, error: 'fetch ATOM: ' + (e?.message || e) }, { status: 200 }) }
  if (!xml.trim()) return NextResponse.json({ ok: true, empresas: 0, nuevos: 0, nota: 'feed vacío' })

  const empresas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT empresa_id, radar_cpv, radar_palabras_clave, radar_presupuesto_min, radar_presupuesto_max
    FROM concursos_perfil_empresa WHERE radar_activo = true
  `)

  let totalNuevos = 0
  for (const e of empresas) {
    const criterios: CriteriosRadar = {
      cpv: e.radar_cpv ?? [],
      palabras_clave: e.radar_palabras_clave ?? [],
      presupuesto_min: e.radar_presupuesto_min ?? undefined,
      presupuesto_max: e.radar_presupuesto_max ?? undefined,
    }
    const matches = matchesDeAtom(xml, criterios)
    for (const m of matches) {
      const res = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO concursos_radar_anuncios (empresa_id, dedupe_key, anuncio, puntuacion, motivos)
        VALUES (${e.empresa_id}::uuid, ${m.dedupe_key}, ${JSON.stringify(m.anuncio)}::jsonb, ${m.puntuacion}, ${JSON.stringify(m.motivos)}::jsonb)
        ON CONFLICT (empresa_id, dedupe_key) DO NOTHING
      `)
      totalNuevos += Number(res) > 0 ? 1 : 0
    }
  }
  return NextResponse.json({ ok: true, empresas: empresas.length, nuevos: totalNuevos })
}
