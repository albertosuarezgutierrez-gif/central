import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { crearVistaPresupuesto } from '@/lib/vista-corredor'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * «Ver como el cliente» un presupuesto (plataforma → asegura, Bearer), también un BORRADOR sin enviar.
 *
 *   POST { presupuestoId, actor } → { estado:'ok', url }  la vista de corredor (UN uso, 10 min) que aterriza en la
 *                                    página del presupuesto en el portal, en solo lectura.
 *
 * No envía nada a nadie, no marca el presupuesto como visto/enviado y no crea sesión de CLIENTE: es la sesión del
 * corredor, que el portal no deja escribir (middleware) ni sellar `visto_at`. La ficha sale del presupuesto.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.presupuestoId !== 'string' || body.presupuestoId.trim() === '') {
      return NextResponse.json({ estado: 'invalido', motivo: 'falta presupuestoId' }, { status: 422 })
    }
    const actor = typeof body.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim().slice(0, 120) : 'plataforma'

    const r = await crearVistaPresupuesto(correduria.id, { presupuestoId: body.presupuestoId.trim(), actor })
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', url: r.url })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/vista-cliente', e) }, { status: 500 })
  }
})
