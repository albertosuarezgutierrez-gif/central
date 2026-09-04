import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fichaAsegura } from '@/lib/ficha-asegura'
import {
  altaClienteAsegura,
  descartarClienteAsegura,
  editarClienteAsegura,
  restaurarClienteAsegura,
} from '@/lib/cliente-edicion-asegura'

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
//
// POST /api/correduria/cliente?restaurar — deshace un descarte. Mismo reenvío.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restaurar = new URL(req.url).searchParams.has('restaurar')
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })
  if (restaurar) {
    if (typeof body.id !== 'string' || body.id.trim() === '') {
      return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
    }
    const rr = await restaurarClienteAsegura({ id: body.id.trim(), motivo: body.motivo, actor: session.email })
    return NextResponse.json(rr.json ?? { estado: 'error', motivo: `HTTP ${rr.status}` }, { status: rr.status })
  }
  const r = await altaClienteAsegura({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

// DELETE /api/correduria/cliente — DESCARTA la ficha (borrado suave, reversible).
//
// 🚨 No borra nada en la base de la correduría: asegura pone `activo = false` y
// la ficha deja de salir en el buscador, la lista y los contadores. Se deshace
// con `POST ?restaurar`. Un borrado duro se lo comería la ingesta de CIMA (que
// recrearía la ficha) y se llevaría por delante historial, pólizas y documentos.
//
// El `actor` sale de la SESIÓN, nunca del body: es quien queda en el historial
// de asegura como responsable de haber quitado la ficha de la vista.
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  const r = await descartarClienteAsegura({ id, motivo: body?.motivo, actor: session.email })
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
