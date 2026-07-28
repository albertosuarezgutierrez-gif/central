// Recordatorio de cierre de las subastas SEGUIDAS (interés explícito), 3 días
// antes de la conclusión. Incluye el depósito a consignar, porque pujar exige
// tener ese dinero bloqueado y es el aviso que de verdad hace falta a tiempo.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { eur } from '@/lib/dinero'
import { deposito } from '@central/module-subastas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIAS_AVISO = 3
const ESTADOS_ACTIVOS = ['interesado', 'analizando', 'pujando']

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const proximas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, dedupe_key, subasta, estado, fecha_fin, puja_maxima
      FROM subastas_seguidas
      WHERE recordatorio_cierre_at IS NULL
        AND estado = ANY(${ESTADOS_ACTIVOS}::text[])
        AND fecha_fin IS NOT NULL
        AND fecha_fin >= now()
        AND fecha_fin <= now() + make_interval(days => ${DIAS_AVISO}::int)
      ORDER BY fecha_fin ASC
    `)

    if (!proximas.length) return NextResponse.json({ ok: true, avisados: 0 })

    const lineas: string[] = [`⏰ <b>Subastas que cierran en ${DIAS_AVISO} días o menos</b>`, '']
    let totalDeposito = 0

    for (const p of proximas) {
      const s = p.subasta ?? {}
      const dep = deposito(s.valorSubasta ?? null)
      if (dep) totalDeposito += dep
      const cierre = new Date(p.fecha_fin).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

      lineas.push(`• <b>${s.identificador ?? p.dedupe_key}</b> — cierra ${cierre}`)
      if (s.descripcion) lineas.push(`  ${String(s.descripcion).slice(0, 140)}`)
      lineas.push(`  Depósito para pujar: ${dep ? eur(dep) : 'sin valor de subasta publicado'}`)
    }

    if (totalDeposito > 0) {
      lineas.push('', `💰 Necesitas <b>${eur(totalDeposito)}</b> bloqueados para pujar en todas.`)
    }

    await tgSend(lineas.join('\n'), { html: true }).catch(() => {})

    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas_seguidas SET recordatorio_cierre_at = now()
      WHERE id = ANY(${proximas.map((p) => p.id)}::uuid[])
    `)

    return NextResponse.json({ ok: true, avisados: proximas.length })
  } catch (e: any) {
    console.error('[subastas-cierre]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
