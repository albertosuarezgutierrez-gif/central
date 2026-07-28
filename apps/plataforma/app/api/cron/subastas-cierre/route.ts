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
import { tesoreriaSubastas } from '@/lib/subastas/tesoreria'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIAS_AVISO = 3
const ESTADOS_ACTIVOS = ['interesado', 'analizando', 'pujando']

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const proximas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, cuenta_id, dedupe_key, subasta, estado, fecha_fin, puja_maxima
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

    for (const p of proximas) {
      const s = p.subasta ?? {}
      // El depósito publicado por el Portal manda; si falta, el 5% legal.
      const dep = s.deposito != null && Number(s.deposito) > 0 ? Number(s.deposito) : deposito(s.valorSubasta ?? null)
      const cierre = new Date(p.fecha_fin).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

      lineas.push(`• <b>${s.identificador ?? p.dedupe_key}</b> — cierra ${cierre}`)
      if (s.descripcion) lineas.push(`  ${String(s.descripcion).slice(0, 140)}`)
      lineas.push(`  Depósito para pujar: ${dep ? eur(dep) : 'sin valor de subasta publicado'}`)
    }

    // ── Tesorería ───────────────────────────────────────────────────────────
    // No basta con sumar los depósitos de las que cierran esta semana: cuenta
    // el MÁXIMO SIMULTÁNEO de TODAS las seguidas (las que se solapan coinciden
    // en la cuenta) y se contrasta con el saldo real.
    for (const cuentaId of [...new Set(proximas.map((p) => String(p.cuenta_id)))]) {
      const { plan, saldo } = await tesoreriaSubastas(cuentaId)
      if (plan.pico <= 0) continue

      lineas.push('', `💰 Necesitas <b>${eur(plan.pico)}</b> bloqueados a la vez` +
        (plan.picoDesde ? ` desde el ${new Date(plan.picoDesde).toLocaleDateString('es-ES')}` : '') +
        (plan.picoSubastas.length > 1 ? ` (${plan.picoSubastas.length} subastas solapadas)` : ''))
      if (plan.total > plan.pico) {
        lineas.push(`  <i>Suma de depósitos ${eur(plan.total)}, pero no coinciden todos en el tiempo.</i>`)
      }
      if (saldo.cuentas === 0) {
        lineas.push('  ⚠️ No hay saldo de cuentas corrientes para contrastar.')
      } else if (plan.deficit != null && plan.deficit > 0) {
        lineas.push(`  🚨 Disponible ${eur(saldo.total)} → <b>faltan ${eur(plan.deficit)}</b>.`)
      } else {
        lineas.push(`  ✅ Disponible ${eur(saldo.total)}, suficiente.`)
      }
      if (saldo.desactualizado) {
        lineas.push(`  <i>Ojo: el saldo más antiguo es del ${new Date(saldo.masAntiguo!).toLocaleDateString('es-ES')}.</i>`)
      }
      if (plan.incompletos.length) {
        lineas.push(`  <i>Sin depósito o sin fecha de cierre: ${plan.incompletos.join(', ')}.</i>`)
      }
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
