import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generarBorradores, periodoActual } from '@/lib/nominas'

export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const periodo = periodoActual()
  const empresas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM rrhh.empresas ORDER BY creada_at ASC`)

  const resultados: Array<{ empresa_id: string; creadas: number; omitidas: number; error?: string }> = []
  for (const { id } of empresas) {
    try {
      const r = await generarBorradores(id, periodo)
      resultados.push({ empresa_id: id, ...r })
    } catch (e) {
      resultados.push({ empresa_id: id, creadas: 0, omitidas: 0, error: e instanceof Error ? e.message : String(e) })
    }
  }

  console.log('[cron/nominas]', periodo, resultados)
  return NextResponse.json({ periodo, resultados })
}
