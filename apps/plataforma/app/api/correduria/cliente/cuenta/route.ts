import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cuentaFichaAsegura, ponerCuentaFichaAsegura } from '@/lib/cliente-edicion-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/cliente/cuenta?id=<uuid> — la cuenta de cargo de la ficha, ENMASCARADA.
// PUT /api/correduria/cliente/cuenta { id, iban } — la pone (módulo 97, cifrada, historial).
// Reenvían al puerto de asegura con el mismo status/json. El `actor` sale de la SESIÓN y va el
// último: un cuerpo que traiga su propio `actor` no puede firmar el cambio con otro nombre.

export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  const r = await cuentaFichaAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function PUT(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const iban = typeof body?.iban === 'string' ? body.iban.slice(0, 64) : ''
  if (id === '' || iban.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente o el IBAN.' }, { status: 422 })
  }
  const r = await ponerCuentaFichaAsegura({ id, iban, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
