// ────────────────────────────────────────────────────────────────────────────
// Aviso diario de BAJAS DE ALLIANZ pendientes de tramitar en el PUE (30/09/2026).
//
// Allianz no recibe bajas por correo: la intranet las deja `firmadas` y Alberto las teclea en su
// extranet (PUE). Cada mañana, si hay alguna sin tramitar, Telegram con la ficha y los enlaces.
// Digest diario sin dedupe: mientras siga pendiente, sigue siendo la misma tarea. Ver docs/ALLIANZ-PUE.md.
//
// 🚨 Un fallo de lectura NUNCA se sirve como «0 pendientes»: el latido se pone en rojo y no se manda
// nada (un «0» falso sería peor que no mandar).
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { bajasPuePendientes, mensajeBajasPue } from '@/lib/correduria/bajas-pue'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_bajas_pue'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await bajasPuePendientes()

  if (r.estado !== 'ok') {
    const motivo = r.estado === 'sin_configurar'
      ? 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)'
      : `no se pudo leer: ${r.motivo}`
    await registrarLatido(AGENTE, false, motivo)
    return NextResponse.json({ ok: false, motivo }, { status: 200 })
  }

  const mensaje = mensajeBajasPue(r.bajas)

  let enviado = false
  if (mensaje) {
    try {
      await tgAviso('correduria.baja-pue', mensaje)
      enviado = true
    } catch (e) {
      await registrarLatido(AGENTE, false, `Telegram falló: ${String(e).slice(0, 120)}`)
      return NextResponse.json({ ok: false, motivo: 'telegram', pendientes: r.bajas.length }, { status: 200 })
    }
  }

  await registrarLatido(AGENTE, true, `${r.bajas.length} baja(s) de Allianz pendiente(s) en el PUE`)
  return NextResponse.json({ ok: true, pendientes: r.bajas.length, enviado })
}
