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
import { mejorPujaViva } from '@/lib/subastas/enriquecer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIAS_AVISO = 3
const ESTADOS_ACTIVOS = ['interesado', 'analizando', 'pujando']
/** Tope de fichas consultadas por pasada (una llamada al portal por seguida). */
const MAX_VIGILADAS = 10

/**
 * Vigila la MEJOR PUJA en vivo de las seguidas que cierran pronto y avisa una
 * sola vez cuando alguien puja por encima del techo (el declarado por Alberto
 * en el seguimiento o, si no lo fijó, el calculado para ≥25% de descuento):
 * a partir de ahí la subasta ya no es negocio y seguir mirándola es ruido.
 *
 * La ficha del portal no siempre publica la puja: un `null` NO borra el último
 * valor visto (una puja solo puede subir) y no cuenta como «sin pujas».
 */
async function vigilarPujasSeguidas(): Promise<{ vigiladas: number; sobrepujas: number }> {
  const seguidas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT sg.id, sg.dedupe_key, sg.puja_maxima, sg.sobrepuja_avisada_at,
           s.identificador, s.valor_subasta, s.puja_maxima_calc
    FROM subastas_seguidas sg
    JOIN subastas s ON s.dedupe_key = sg.dedupe_key
    WHERE sg.estado = ANY(${ESTADOS_ACTIVOS}::text[])
      AND s.fuente = 'boe' AND s.identificador IS NOT NULL
      AND COALESCE(s.fecha_fin, sg.fecha_fin) >= now()
      AND COALESCE(s.fecha_fin, sg.fecha_fin) <= now() + make_interval(days => ${DIAS_AVISO}::int)
    ORDER BY COALESCE(s.fecha_fin, sg.fecha_fin) ASC
    LIMIT ${MAX_VIGILADAS}
  `)

  let sobrepujas = 0
  for (const sg of seguidas) {
    let puja: number | null
    try {
      puja = await mejorPujaViva(sg.identificador)
    } catch (e) {
      // Ficha no legible ahora mismo: se reintenta en la pasada siguiente. No
      // se toca la fila — un fallo de lectura no es un dato.
      console.error('[subastas-cierre vigilar]', sg.identificador, e)
      continue
    }
    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas SET
        mejor_puja = COALESCE(${puja}, mejor_puja),
        mejor_puja_at = now(),
        actualizado_en = now()
      WHERE dedupe_key = ${sg.dedupe_key}
    `)
    if (puja == null) continue

    const techo = sg.puja_maxima != null ? Number(sg.puja_maxima)
      : sg.puja_maxima_calc != null ? Number(sg.puja_maxima_calc) : null
    if (techo != null && puja > techo && sg.sobrepuja_avisada_at == null) {
      const valor = sg.valor_subasta == null ? null : Number(sg.valor_subasta)
      const pct = valor && valor > 0 ? ` (${Math.round((puja / valor) * 100)}% del tipo)` : ''
      await tgSend(
        `🔥 <b>${escapar(sg.identificador)}</b> — ya pujan <b>${escapar(eur(puja))}</b>${escapar(pct)}, ` +
          `por encima de tu techo de ${escapar(eur(techo))}. A este precio deja de ser negocio: ` +
          `puja solo si asumes menos descuento.`,
        { html: true },
      ).catch(() => {})
      await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas_seguidas SET sobrepuja_avisada_at = now() WHERE id = ${sg.id}::uuid
      `)
      sobrepujas++
    }
  }
  return { vigiladas: seguidas.length, sobrepujas }
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    // Antes de los recordatorios: refrescar la mejor puja de las que cierran
    // pronto, para que los avisos de abajo hablen con el dato de HOY.
    const vigilancia = await vigilarPujasSeguidas().catch((e) => {
      console.error('[subastas-cierre] vigilancia', e)
      return { vigiladas: 0, sobrepujas: 0 }
    })

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

    if (!proximas.length) return NextResponse.json({ ok: true, avisados: 0, urgentes: await avisarUltimas24h(), ...vigilancia })

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

    const urgentes = await avisarUltimas24h()
    return NextResponse.json({ ok: true, avisados: proximas.length, urgentes, ...vigilancia })
  } catch (e: any) {
    console.error('[subastas-cierre]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}

/**
 * Segundo recordatorio, URGENTE, en las últimas 24 h — con lo que hay que
 * tener delante para decidir la puja: depósito, semáforo documental, las notas
 * de la CERTIFICACIÓN registral y el €/m² de la zona frente al del tipo.
 * `recordatorio_24h_at` fija que se manda una sola vez.
 */
async function avisarUltimas24h(): Promise<number> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT sg.id, sg.dedupe_key, sg.subasta, sg.fecha_fin, sg.puja_maxima,
           s.semaforo, s.notas_edicto, s.precio_m2_zona, s.zona_portal,
           COALESCE(s.superficie_catastro, s.superficie) AS m2, s.valor_subasta,
           s.mejor_puja, s.mejor_puja_at
    FROM subastas_seguidas sg
    LEFT JOIN subastas s ON s.dedupe_key = sg.dedupe_key
    WHERE sg.recordatorio_24h_at IS NULL
      AND sg.estado = ANY(${ESTADOS_ACTIVOS}::text[])
      AND sg.fecha_fin IS NOT NULL
      AND sg.fecha_fin >= now()
      AND sg.fecha_fin <= now() + interval '24 hours'
    ORDER BY sg.fecha_fin ASC
  `)
  if (!filas.length) return 0

  const SEMAFORO_EMOJI: Record<string, string> = { verde: '🟢', ambar: '🟡', rojo: '🔴' }
  const lineas: string[] = ['🚨 <b>ÚLTIMAS 24 HORAS</b> — subastas seguidas a punto de cerrar', '']
  for (const f of filas) {
    const s = f.subasta ?? {}
    const cierre = new Date(f.fecha_fin).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })
    const dep = s.deposito != null && Number(s.deposito) > 0 ? Number(s.deposito) : deposito(s.valorSubasta ?? null)
    lineas.push(`• <b>${s.identificador ?? f.dedupe_key}</b> — cierra ${cierre} (hora Madrid)`)
    if (s.descripcion) lineas.push(`  ${String(s.descripcion).slice(0, 140)}`)
    lineas.push(`  Depósito: ${dep ? eur(dep) : 'sin valor de subasta publicado'}` +
      (f.puja_maxima != null ? ` · tu puja máx.: ${eur(Number(f.puja_maxima))}` : ''))
    // La puja en vivo, si el portal la publica: es EL dato de la última hora.
    if (f.mejor_puja != null) {
      const valor = f.valor_subasta == null ? null : Number(f.valor_subasta)
      const pct = valor && valor > 0 ? ` (${Math.round((Number(f.mejor_puja) / valor) * 100)}% del tipo)` : ''
      lineas.push(`  🔥 Mejor puja vista: ${eur(Number(f.mejor_puja))}${pct}`)
    }
    if (f.semaforo) lineas.push(`  ${SEMAFORO_EMOJI[f.semaforo] ?? ''} Semáforo documental: ${f.semaforo}`)
    // El €/m² al tipo frente al de la zona: la cifra que resume la oportunidad.
    const valor = f.valor_subasta == null ? null : Number(f.valor_subasta)
    const m2 = f.m2 == null ? null : Number(f.m2)
    if (valor && m2 && m2 > 0 && f.precio_m2_zona != null) {
      lineas.push(`  📍 Al tipo sale a ${Math.round(valor / m2)}€/m² — la zona${f.zona_portal ? ` (${f.zona_portal})` : ''} está a ~${Math.round(Number(f.precio_m2_zona))}€/m²`)
    }
    for (const nota of String(f.notas_edicto ?? '').split('\n').filter(Boolean).slice(0, 4)) {
      lineas.push(`  📄 ${nota}`)
    }
    lineas.push('')
  }

  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})
  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas_seguidas SET recordatorio_24h_at = now()
    WHERE id = ANY(${filas.map((f) => f.id)}::uuid[])
  `)
  return filas.length
}
