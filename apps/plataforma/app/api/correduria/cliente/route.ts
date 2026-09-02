import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { altaClienteAsegura, editarClienteAsegura } from '@/lib/cliente-edicion-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/cliente?id=<uuid> — ficha completa (puerto a asegura).
// Read-only: aquí no se gasta ni un céntimo. Retarificar vive en asegura.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'respuesta_ilegible' }, { status: 400 })
  return NextResponse.json(await fichaAsegura(id))
}

// POST /api/correduria/cliente — ALTA de una ficha. Reenvía al puerto
// (`POST /api/operador/cliente`) con `actor` = quien está en sesión, y devuelve
// el mismo status/json (201 ok · 409 conflicto · 422 invalido).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })
  const r = await altaClienteAsegura({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

// PATCH /api/correduria/cliente — EDICIÓN (`identidad` solo con documento
// acreditativo; `libre` sin él). Mismo reenvío con `actor`.
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || body.id.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  }
  const r = await editarClienteAsegura({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
