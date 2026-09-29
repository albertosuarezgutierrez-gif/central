import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { abrirRiesgoDePoliza } from '@/lib/oportunidad-riesgo'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * `POST { polizaId, actor }` — abre (o devuelve la abierta) la oportunidad de retarificar ESTA
 * póliza, con las personas que la póliza ya tiene enlazadas (29/09/2026). Gratis: no pide precio.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim() : 'plataforma'
  const polizaId = typeof b.polizaId === 'string' ? b.polizaId.trim() : ''
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await abrirRiesgoDePoliza(correduria.id, { polizaId, actor })
    return r.ok
      ? NextResponse.json({ estado: 'ok', oportunidadId: r.oportunidadId, nueva: r.nueva })
      : NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/de-poliza', e) }, { status: 500 })
  }
})
