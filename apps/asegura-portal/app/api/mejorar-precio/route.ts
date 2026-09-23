import { NextResponse } from 'next/server'
import { tgSend } from '@central/core-telegram'

import { pedirPrecio } from '@/lib/mejorar-precio'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/mejorar-precio — «Quiero que me mejores el precio» (pieza 1-5).
 * Cuerpo: `{ polizaId, prioridad, canal, momento?, nota? }`.
 *
 * El portal no escribe en la cartera: lo reenvía por el puente de asegura, que
 * comprueba que la póliza es SUYA y en vigor y crea la oportunidad con su tarea
 * de hoy. Aquí solo se pone la identidad —de la sesión, nunca del cuerpo— y se
 * avisa a Alberto por Telegram (best-effort).
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  // Vista de corredor: solo lectura. Alberto no puede pedir por el cliente.
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof cuerpo?.polizaId === 'string' ? cuerpo.polizaId.trim() : ''
  if (!cuerpo || polizaId === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta la póliza.' }, { status: 422 })

  const r = await pedirPrecio(identidad.id, polizaId, cuerpo)
  if (r.estado === 'ok' && !r.yaExistia) {
    try {
      const id = await tgSend(`💶 Un cliente pide desde el portal que le mejores el precio de una póliza que renueva pronto. Lo tienes en «Hoy · Tareas de hoy».\nIdentidad ${identidad.id}`)
      // `null` = sin canal (falta TELEGRAM_*): la tarea de hoy sigue creada, pero se dice.
      if (id === null) console.warn('[portal/mejorar-precio] aviso sin enviar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
    } catch (e) {
      console.error('[portal/mejorar-precio] Telegram no salió:', e instanceof Error ? e.message : e)
    }
  }
  const status = r.estado === 'ok' ? 200 : r.estado === 'invalido' ? 422 : r.estado === 'no_disponible' ? 409 : 502
  return NextResponse.json(r, { status })
}
