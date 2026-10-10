import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { lanzarPendientes } from '@/lib/tarificador'
import { autorizarEmision } from '@/lib/tarificador-emision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/emision/autorizar` `{ trabajoId, decision: 'ok' | 'no', autorizadoPor }` — el botón
 * «✅ Emitir» / «❌ Cancelar» del Telegram (lo reenvía el webhook de plataforma, que ya comprobó `from.id`). Aquí se
 * vuelve a comprobar: `autorizadoPor` tiene que ser EXACTAMENTE `TARIFICADOR_EMISION_TELEGRAM_ID` (sin env → nadie),
 * la solicitud tiene que tener menos de 24 h y el presupuesto seguir aceptado y vigente. Idempotente (doble pulsación
 * = `sin_cambios`). Autorizar NO emite: deja el permiso (15 min) y relanza la máquina, que canjea el token.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const trabajoId = typeof body?.trabajoId === 'string' ? body.trabajoId.trim() : ''
  const decision = body?.decision
  const autorizadoPor = typeof body?.autorizadoPor === 'string' ? body.autorizadoPor.trim() : ''
  if (!UUID.test(trabajoId) || (decision !== 'ok' && decision !== 'no') || !autorizadoPor) {
    return NextResponse.json({ estado: 'error', mensaje: "trabajoId (uuid), decision ('ok'|'no') y autorizadoPor son obligatorios" }, { status: 400 })
  }
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await autorizarEmision({ correduriaId: correduria.id, trabajoId, decision, autorizadoPor })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    let lanzado = false
    if (r.estado === 'autorizado') {
      const l = await lanzarPendientes(correduria.id, r.compania).catch(() => null)
      lanzado = !!l?.lanzados.includes(trabajoId)
    }
    return NextResponse.json({ estado: r.estado, trabajoId, lanzado })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/emision/autorizar', e) }, { status: 503 })
  }
})
