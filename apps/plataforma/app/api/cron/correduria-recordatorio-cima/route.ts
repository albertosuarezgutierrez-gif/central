// Recordatorio mensual (día 2) de bajar el export «Ficheros recibidos» del Portal CIMA y compararlo con
// lo recibido, con el resumen por compañía de días sin mandar. Un solo Telegram al mes.
//
// Si la ingesta no se puede leer, el recordatorio sale igual (es lo importante) y lo dice: nunca
// pinta «todo al día» por no haber podido mirar. Auth: `isCronAuthorized` (CRON_SECRET, sin fallback).
import { NextRequest, NextResponse } from 'next/server'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { leerIngestaCima } from '@/lib/correduria/ingesta-cima'
import { mensajeRecordatorioCima } from '@/lib/correduria/recordatorio-cima'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const r = await leerIngestaCima().catch(() => null)
  const silencio = r && r.estado === 'ok' ? r.salud.silencio : null
  const mensaje = mensajeRecordatorioCima(silencio)

  try {
    await tgAviso('correduria.recordatorio-cima', mensaje)
  } catch (e) {
    return NextResponse.json({ ok: false, motivo: 'telegram', detalle: String(e).slice(0, 120) }, { status: 200 })
  }
  return NextResponse.json({ ok: true, enviado: true, conResumen: silencio !== null })
}
