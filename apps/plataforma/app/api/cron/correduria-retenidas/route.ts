// ────────────────────────────────────────────────────────────────────────────
// Revisión de emisiones RETENIDAS por la compañía («riesgo condicionado», 30/09/2026).
//
// Dos veces al día pide a asegura que mire en Avant2 las que seguían retenidas y avisa por
// Telegram SOLO si alguna ha cambiado (liberada → ya en cartera, o rechazada).
//
// 🚨 Un fallo de lectura NUNCA es «0 retenidas»: el latido se pone en rojo y no se manda nada.
// Y proyectos que no se pudieron revisar (`errores`) también ponen el latido en rojo.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { retenidasAsegura } from '@/lib/correduria-puerto'
import { mensajeRetenidas } from '@/lib/correduria/retenidas-aviso'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_retenidas'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await retenidasAsegura()

  if (r.estado !== 'ok') {
    const motivo = r.estado === 'sin_configurar'
      ? 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)'
      : `no se pudo leer: ${r.motivo}`
    await registrarLatido(AGENTE, false, motivo)
    return NextResponse.json({ ok: false, motivo }, { status: 200 })
  }

  const mensaje = mensajeRetenidas({ cambios: r.cambios, siguen: r.siguen.length, errores: r.errores.length })

  let enviado = false
  if (mensaje) {
    try {
      await tgAviso('correduria.emision-retenida', mensaje)
      enviado = true
    } catch (e) {
      await registrarLatido(AGENTE, false, `Telegram falló: ${String(e).slice(0, 120)}`)
      return NextResponse.json({ ok: false, motivo: 'telegram', cambios: r.cambios.length }, { status: 200 })
    }
  }

  const resumen = `${r.revisadas} revisada(s), ${r.cambios.length} cambio(s), ${r.siguen.length} siguen retenidas`
  if (r.errores.length > 0) {
    await registrarLatido(AGENTE, false, `${resumen}; ${r.errores.length} sin poder revisar`)
  } else {
    await registrarLatido(AGENTE, true, resumen)
  }
  return NextResponse.json({ ok: r.errores.length === 0, revisadas: r.revisadas, cambios: r.cambios.length, siguen: r.siguen.length, errores: r.errores.length, enviado })
}
