import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import {
  listarPresupuestosAsegura,
  prepararPresupuestoAsegura,
  retirarPresupuestoAsegura,
} from '@/lib/presupuesto-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/presupuesto — el presupuesto que se le enseña a un cliente.
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`/api/operador/presupuesto`) con el secreto de operador y devuelve el MISMO
 * status y json, para que la pantalla lea el contrato del puerto tal cual.
 *
 * 🚨 NADA DE ESTO SALE AL CLIENTE NI GASTA UN EURO: prepara el presupuesto
 * sobre una cotización YA PAGADA. El envío (correo / enlace de WhatsApp) es el
 * PR 3 del §6 de la spec y todavía no existe.
 *
 * 🚨 El `actor` lo pone el SERVIDOR con el email de la sesión y va el ÚLTIMO
 * del cuerpo reenviado: así un cuerpo que trajera su propio `actor` no puede
 * firmar el presupuesto a nombre de otro.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const u = new URL(req.url)
  const clienteId = u.searchParams.get('clienteId') ?? undefined
  const polizaId = u.searchParams.get('polizaId') ?? undefined
  if (!clienteId && !polizaId) {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }

  const r = await listarPresupuestosAsegura({ clienteId, polizaId })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })

  const r = await prepararPresupuestoAsegura({ ...cuerpo, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })

  const r = await retirarPresupuestoAsegura({ ...cuerpo, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
