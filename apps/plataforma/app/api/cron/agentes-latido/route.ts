import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'
import { evaluarLatido, AGENTES_VIGILADOS } from '@/lib/monitoring/latidos'

// 💓 Latidos de agentes (cron diario 07:45 UTC ≈ 09:45 CEST). Comprueba que cada agente vigilado
// sigue dejando su huella en BD y avisa por Telegram los que llevan demasiado sin latir. Es el mismo
// concepto que el watchdog de trading, generalizado a la flota. Auth Bearer CRON_SECRET.
// Lógica pura + registro en lib/monitoring/latidos.ts (testeado).
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// SQL de la huella por agente (parametrizado con Prisma.sql, nunca interpolación de strings).
// Cada probe devuelve una fila { ultimo: timestamp | null } = el último latido del agente.
const PROBES: Record<string, Prisma.Sql> = {
  // Pricing: manda el piso MÁS VIEJO, no el max global. Con max(), un solo piso fresco
  // (p.ej. luxury) tapaba que el Dúplex y House Sevillana llevaban 23 días sin estudiar
  // (555 h) → el monitor se callaba. La sonda por-piso (min de los max) delata al rezagado.
  pricing: Prisma.sql`
    SELECT min(ultimo) AS ultimo FROM (
      SELECT p.piso, max(m.created_at) AS ultimo
      FROM (VALUES ('prop_house_sevillana'), ('prop_busto_reform'),
                   ('prop_luxury_busto'), ('prop_duplex_center')) AS p(piso)
      LEFT JOIN market_rates m ON m.scenario = p.piso
      GROUP BY p.piso
    ) t`,
  correo_triaje: Prisma.sql`SELECT max(updated_at) AS ultimo FROM correo_cursor`,
  // ialimp: `last_sync_at` es la columna que el sync escribe DE VERDAD en cada
  // pasada (la del panel, `ultimo_sync`, está a NULL desde siempre — nadie la
  // rellena). Solo cuentan las conexiones activas: una desactivada a mano no es
  // una avería.
  ialimp_pms: Prisma.sql`SELECT max(last_sync_at) AS ultimo FROM pms_connections WHERE activa = true`,
  // Facturas: la frescura se mide sobre la ÚLTIMA PASADA BUENA, no sobre la
  // última ejecución — así un cron que corre y falla siempre también salta.
  // Se traen además `ultimo_at` y `detalle` para poder decir CUÁL de las dos
  // averías es (no se dispara / se dispara y no termina): ver `evaluarLatido`.
  facturas_gmail: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'facturas_gmail'`,
  // Eventos: NO se puede vigilar `pricing_eventos_auto.updated_at` — esa tabla solo crece cuando
  // aparece un evento NUEVO, así que una semana sin conciertos anunciados sería indistinguible de
  // los dos crons muertos (que es como estuvieron junio y julio de 2026 sin que nadie lo viera).
  // La huella es la de la PASADA: el cron la escribe corra o no corra el descubrimiento.
  sivra_eventos: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_eventos'`,
  sivra_mercado_sweep: Prisma.sql`
    SELECT ultimo_ok_at AS ultimo, ultimo_at AS ultimo_intento, detalle
    FROM agente_latidos WHERE agente = 'sivra_mercado_sweep'`,
}

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ahora = new Date()
  const resultados: Array<Record<string, unknown>> = []
  const alertas: string[] = []
  const sondasRotas: string[] = []

  for (const ag of AGENTES_VIGILADOS) {
    const probe = PROBES[ag.id]
    if (!probe) {
      // Un agente declarado en AGENTES_VIGILADOS sin sonda NO se salta en silencio: eso sería un
      // vigilante que no vigila y que además nadie echa de menos. Va al bloque de «sin poder
      // comprobar», que el Telegram muestra aparte de las alertas.
      sondasRotas.push(`${ag.etiqueta}: declarado como vigilado pero sin sonda en PROBES`)
      continue
    }
    try {
      const rows = await prisma.$queryRaw<
        Array<{ ultimo: Date | null; ultimo_intento?: Date | null; detalle?: string | null }>
      >(probe)
      const ultimo = rows[0]?.ultimo ?? null
      const ultimoIntento = rows[0]?.ultimo_intento ?? null
      const ev = evaluarLatido({ ahora, ultimo, maxHoras: ag.maxHoras, ultimoIntento, detalle: rows[0]?.detalle ?? null })
      resultados.push({
        id: ag.id,
        ...ev,
        ultimo: ultimo?.toISOString() ?? null,
        ultimoIntento: ultimoIntento?.toISOString() ?? null,
      })
      if (ev.alerta) alertas.push(`• <b>${ag.etiqueta}</b>: ${ev.motivo}.\n  ${ag.nota}`)
    } catch (e) {
      // 🚨 Una sonda rota NO es un agente sano. Antes se tragaba en silencio
      // "para no dar falsas alarmas", pero eso convierte un vigía averiado en un
      // parte de buena salud: si la tabla desaparece o cambia de nombre, el
      // agente deja de estar vigilado y nadie se entera. Se avisa aparte y con
      // otro tono: «no se ha podido comprobar», que no es «está bien».
      resultados.push({ id: ag.id, error: String((e as Error)?.message ?? e) })
      sondasRotas.push(`• <b>${ag.etiqueta}</b>: no se ha podido comprobar (${String((e as Error)?.message ?? e).slice(0, 120)}).`)
    }
  }

  // El PMS de ialimp marca `last_sync_at` aunque la pasada haya dado errores, así
  // que la frescura sola no lo cubre: una conexión que sincroniza puntual pero
  // falla en cada intento pasaría por sana.
  const conErrores = await prisma
    .$queryRaw<Array<{ cliente_nombre: string; sync_error: string }>>(
      Prisma.sql`SELECT cliente_nombre, sync_error FROM pms_connections WHERE activa = true AND sync_error IS NOT NULL`,
    )
    .catch(() => null)
  if (conErrores == null) {
    sondasRotas.push('• <b>🧹 Errores de sincronización de ialimp</b>: no se ha podido comprobar.')
  } else {
    for (const c of conErrores) {
      alertas.push(
        `• <b>🧹 PMS de ialimp — ${c.cliente_nombre}</b>: sincroniza, pero con errores: ${String(c.sync_error).slice(0, 160)}.\n` +
          '  Las reservas pueden estar entrando a medias: revisa la clave de Smoobu y los iCal.',
      )
    }
  }

  if (alertas.length > 0 || sondasRotas.length > 0) {
    const bloques: string[] = []
    if (alertas.length > 0) bloques.push(`<b>Sin señal / con errores (${alertas.length})</b>\n${alertas.join('\n\n')}`)
    if (sondasRotas.length > 0) {
      bloques.push(`<b>Sin poder comprobar (${sondasRotas.length})</b> — esto NO es «todo bien»:\n${sondasRotas.join('\n')}`)
    }
    await tgSend(`💓⚠️ <b>Latidos de agentes</b>\n\n${bloques.join('\n\n')}`, { html: true })
  }

  return NextResponse.json({ ok: true, alertas: alertas.length, sondasRotas: sondasRotas.length, resultados })
}

export { handler as GET, handler as POST }
