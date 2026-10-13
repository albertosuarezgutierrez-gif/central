import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { lanzarPendientes } from '@/lib/tarificador'
import { autorizarEmision } from '@/lib/tarificador-emision'
import { comprobarFirmaAutorizar } from '@/lib/tarificador-emision-reglas'
import { requireSecret } from '@central/core-identity'
import { ENV_FIRMA_AUTORIZACION } from '@central/module-tarificacion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/operador/tarificador/emision/autorizar` `{ trabajoId, decision: 'ok' | 'no', hashCorto, autorizadoPor, ts, firma }`
 * — el botón «✅ Emitir» / «❌ Cancelar» del Telegram (lo reenvía el webhook de plataforma, que ya comprobó `from.id`).
 * 🔐 DOS factores: el Bearer de operador Y la firma HMAC del cuerpo con `TARIFICADOR_EMISION_WEBHOOK_SECRET` (solo lo
 * tiene el webhook de plataforma; `requireSecret`, sin fallback). Con el Bearer solo → 403. Firma de más de 90 s → 403.
 * Aquí se vuelve a comprobar: `autorizadoPor` tiene que ser EXACTAMENTE `TARIFICADOR_EMISION_TELEGRAM_ID` (sin env → nadie),
 * `hashCorto` el de la pantalla previa que se le enseñó, la solicitud de menos de 24 h y el presupuesto aceptado y vigente.
 * Idempotente (doble pulsación = `sin_cambios`). Autorizar NO emite: deja el permiso (15 min) y relanza la máquina.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  let secreto: string | null
  try {
    secreto = requireSecret(ENV_FIRMA_AUTORIZACION)
  } catch {
    secreto = null
  }
  const f = comprobarFirmaAutorizar(body, secreto, Date.now())
  if (!f.ok) return NextResponse.json({ estado: 'rechazado', motivo: f.motivo }, { status: f.status })
  const { trabajoId, decision, hashCorto, autorizadoPor } = f.campos
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await autorizarEmision({ correduriaId: correduria.id, trabajoId, decision, hashCorto, autorizadoPor })
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
