import { NextResponse } from 'next/server'
import { tgSend } from '@central/core-telegram'
import type { IndiceIne } from '@central/module-patrimonio'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/tenant' // tabla GLOBAL (INE): sin ámbito; prisma sale de la puerta única
import { registrarErrorCartera } from '@/lib/error-cartera'
import { ejecutarIndicesRenta } from '@/lib/indices-renta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/indices-renta — IPC e IRAV del INE → `portal_patrimonio_indice` (paso 9b, 22/10/2026).
 * Mensual, día 20 a las 10:00 UTC (`vercel.json`): el IPC del mes anterior ya está publicado.
 *
 * Auth: `CRON_SECRET` por Bearer (sin env no se autoriza a nadie). La tabla es GLOBAL (índices públicos del
 * INE, sin correduría) y APPEND-ONLY: `prisma_seguros` solo tiene SELECT + INSERT. SQL crudo parametrizado
 * porque no hay modelo Prisma de la tabla (la crea el SQL del portal; un modelo espejo obligaría a regenerar
 * ambos clientes por una sola tabla de dos columnas útiles).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const resultados = await ejecutarIndicesRenta({
      hoy: new Date().toISOString().slice(0, 10),
      descargar: async (url) => {
        const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      },
      leerGuardados: async (indice: IndiceIne) => {
        const filas = await prisma.$queryRaw<Array<{ periodo: string; pct: string }>>`
          SELECT periodo::text AS periodo, pct::text AS pct
            FROM seguros.portal_patrimonio_indice
           WHERE indice = ${indice}
           ORDER BY descargado_en, creado_en`
        return filas.map((f) => ({ periodo: f.periodo, pct: Number(f.pct) }))
      },
      insertar: async (indice, filas, fuenteUrl) => {
        for (const f of filas) {
          await prisma.$executeRaw`
            INSERT INTO seguros.portal_patrimonio_indice (indice, periodo, pct, fuente_url, revisado)
            VALUES (${indice}, ${f.periodo}, ${f.pct}, ${fuenteUrl}, ${f.revisado})
            ON CONFLICT DO NOTHING`
        }
      },
      avisar: (t) => tgSend(t),
    })
    const hayError = resultados.some((r) => r.estado === 'error')
    return NextResponse.json({ estado: hayError ? 'con_avisos' : 'ok', resultados }, { status: hayError ? 502 : 200 })
  } catch (e) {
    await tgSend('📉 <b>Índices INE</b> · el cron ha fallado antes de empezar. No se ha guardado nada.').catch(() => null)
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/indices-renta', e) }, { status: 503 })
  }
}
