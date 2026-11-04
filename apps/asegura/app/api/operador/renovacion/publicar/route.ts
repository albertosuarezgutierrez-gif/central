import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { publicarRenovacion } from '@/lib/renovacion-alternativas'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Publicar en la APP del cliente un borrador de renovación con alternativas: el ✅ de Alberto (Telegram o plataforma).
 *
 *   POST { presupuestoId, actor, via:'telegram'|'pantalla', telegramMessageId? } → { estado:'publicado'|'ya_publicado' }
 *
 * Sella `enviado_at` + `canal_aviso = 'app'`; la campana del portal y el correo de aviso de acceso (`avisos-intranet`, sin
 * título ni datos) se derivan de ahí. Sin nadie del tomador en la app: 503 `canal_no_disponible` (≠ fallo de envío, 502).
 * Desde Telegram (por defecto) es obligatorio `telegramMessageId` y solo vale el ÚLTIMO mensaje de revisión (409 `no_vigente`).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const presupuestoId = typeof b?.presupuestoId === 'string' ? b.presupuestoId.trim() : ''
    const actor = typeof b?.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const telegramMessageId = typeof b?.telegramMessageId === 'number' && Number.isInteger(b.telegramMessageId) ? b.telegramMessageId : null
    // Fail-closed: si no dice que viene de la PANTALLA (sesión de plataforma), es el botón de Telegram y exige el message_id.
    const via = b?.via === 'pantalla' ? 'pantalla' : 'telegram'
    const r = await publicarRenovacion(correduria.id, { presupuestoId, actor, via, telegramMessageId })
    if (r.estado === 'publicado' || r.estado === 'ya_publicado') return NextResponse.json(r)
    if ('motivo' in r) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/renovacion/publicar', e) }, { status: 500 })
  }
})
