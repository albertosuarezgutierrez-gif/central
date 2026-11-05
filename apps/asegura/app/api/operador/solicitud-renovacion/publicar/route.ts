import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { publicarSolicitudRenovacion } from '@/lib/solicitud-renovacion'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Enviar a la APP del cliente la solicitud de datos de la renovación: el ✅ de Alberto (Telegram `cdr_env:<id>` o plataforma).
 *
 *   POST { solicitudId, actor, via:'telegram'|'pantalla', telegramMessageId? } → { estado:'publicada'|'ya_publicada', solicitudId }
 *
 * Sella `publicada_at`: de ahí salen la campana del portal (tomador que opera y autorizados con Gestión/Total) y el correo de
 * aviso sin datos (`avisos-intranet`). Nadie que pueda contestar en la app: 503 `canal_no_disponible` (≠ fallo de envío).
 * Desde Telegram (por defecto) es obligatorio `telegramMessageId` y solo vale el ÚLTIMO mensaje de revisión (409 `no_vigente`).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const solicitudId = typeof b?.solicitudId === 'string' ? b.solicitudId.trim() : ''
    const actor = typeof b?.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const telegramMessageId = typeof b?.telegramMessageId === 'number' && Number.isInteger(b.telegramMessageId) ? b.telegramMessageId : null
    // Fail-closed: si no dice que viene de la PANTALLA (sesión de plataforma), es el botón de Telegram y exige el message_id.
    const via = b?.via === 'pantalla' ? 'pantalla' : 'telegram'
    const r = await publicarSolicitudRenovacion(correduria.id, { solicitudId, actor, via, telegramMessageId })
    if (r.estado === 'publicada' || r.estado === 'ya_publicada') return NextResponse.json(r)
    if ('motivo' in r) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/solicitud-renovacion/publicar', e) }, { status: 500 })
  }
})
