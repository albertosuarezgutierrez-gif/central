// ────────────────────────────────────────────────────────────────────────────
// RED DIARIA de la correduría (12/10/2026): lo que se queda parado en silencio.
//
// Cada mañana pide a asegura el cuadro (aplicando antes la caducidad perezosa de `aprobacion`) y manda
// UN solo mensaje por Telegram, SOLO si hay algo: aprobaciones que caducan en <24 h o caducaron en las
// últimas 24 h, bajas firmadas hace +48 h que no han salido (con su causa) y recibos devueltos cuyo aviso
// caducó. Sin novedades, no se manda nada.
//
// 🚨 Un fallo de lectura NUNCA es «nada que avisar»: el latido se pone en rojo y no se manda nada.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { leerRedDiaria, mensajeRedDiaria } from '@/lib/correduria/red-diaria'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_red_diaria'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await leerRedDiaria()

  if (r.estado !== 'ok') {
    const motivo = r.estado === 'sin_configurar'
      ? 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)'
      : `no se pudo leer: ${r.motivo}`
    await registrarLatido(AGENTE, false, motivo)
    return NextResponse.json({ ok: false, motivo }, { status: 503 })
  }

  const { red } = r
  const resumen = `${red.porCaducar.length} por caducar, ${red.caducadas.length} caducadas, ${red.anulaciones.length} baja(s) parada(s), ${red.recibos.length} recibo(s)`
  const mensaje = mensajeRedDiaria(red)

  let enviado = false
  if (mensaje) {
    let messageId: number | null = null
    let error = ''
    try {
      messageId = await tgAviso('correduria.red-diaria', mensaje)
    } catch (e) {
      error = String(e).slice(0, 120)
    }
    // `tgAviso` no lanza: devuelve null si Telegram falló, faltan credenciales o el aviso está apagado
    // en /telegram (no se distingue). Sin messageId NO se da por enviado.
    if (messageId === null) {
      const causa = error ? `Telegram falló: ${error}` : 'Telegram no entregó el mensaje (fallo, credenciales o aviso apagado en /telegram)'
      await registrarLatido(AGENTE, false, causa)
      return NextResponse.json({ ok: false, motivo: 'telegram', causa }, { status: 502 })
    }
    enviado = true
  }

  await registrarLatido(AGENTE, true, resumen)
  return NextResponse.json({ ok: true, resumen, enviado })
}
