import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { minarHistorico } from '@/lib/sivra/agente-huesped/historico'

export const dynamic = 'force-dynamic'
// Cada reserva son 2 llamadas a Smoobu + 1 a la IA por par de mensajes. Con 300 s (máximo del plan)
// caben ~20 reservas por pasada; de ahí el tope de `max` y que esto se dispare A MANO, no por cron.
export const maxDuration = 300

// Minado del histórico de conversaciones: empareja pregunta del huésped → respuesta de Alberto en
// los hilos ya cerrados y PROPONE hechos del piso por Telegram. Nada entra al prompt sin que él lo
// confirme: un hecho falso aprendido aquí se le contaría a todos los huéspedes futuros.
//
// Disparo manual (no hay cron): sirve para sembrar y luego para pasadas puntuales.
//   POST /api/sivra/mensajes/minar-historico?desde=2026-01-01&hasta=2026-08-20&max=20
async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  const desde = searchParams.get('desde') || `${hoy.slice(0, 4)}-01-01`
  const hasta = searchParams.get('hasta') || hoy
  const max = Number(searchParams.get('max') || 20)
  const avisar = searchParams.get('avisar') !== '0'

  try {
    const r = await minarHistorico({ desde, hasta, max, avisar })
    // `sinLeer` viaja en la respuesta a propósito: un hilo que no se pudo leer es un HUECO, no una
    // reserva sin nada que aprender. Sin ese número, «0 hechos» sería indistinguible de un fallo.
    return NextResponse.json({ ok: true, desde, hasta, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 502 })
  }
}

export const POST = handler
export const GET = handler
