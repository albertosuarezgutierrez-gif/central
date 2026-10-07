import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { guardarMoteClienteAsegura, moteClienteAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente-mote — el MOTE de la ficha («mamá», «Benito Pintor»): cómo se llama el
 * contacto en la agenda de Google de Alberto. Reenvía a asegura (`/api/operador/cliente/mote`).
 * 🚨 AISLADO: no viaja con la ficha; nunca a correos, portal, PDF ni envíos.
 *   GET ?clienteId=  → { estado:'ok', mote }
 *   PUT { clienteId, mote } → el `actor` lo pone el SERVIDOR (la sesión).
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = new URL(req.url).searchParams.get('clienteId')?.trim() ?? ''
  if (!id) return NextResponse.json({ estado: 'invalido', motivo: 'Falta la ficha.' }, { status: 400 })
  const r = await moteClienteAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function PUT(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.clienteId !== 'string' || !(typeof b.mote === 'string' || b.mote === null)) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta la ficha o el mote.' }, { status: 400 })
  }
  const r = await guardarMoteClienteAsegura({ clienteId: b.clienteId, mote: b.mote, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
