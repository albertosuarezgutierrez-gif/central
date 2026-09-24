import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { borrarContactoPropio, cambiarContactoPropio } from '@/lib/contacto-portal'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * PATCH /api/portal/contactos/[id] — re-etiquetar un contacto o marcarlo
 * como principal. Cuerpo: `{ identidadId, etiqueta?, principal? }`. NUNCA
 * cambia el valor (eso es `/api/portal/contacto`, «Mis datos»).
 *
 * DELETE /api/portal/contactos/[id] — lo quita de la lista. Cuerpo:
 * `{ identidadId }`. Si era el principal, asciende el más antiguo que quede.
 *
 * `[id]` puede ser un uuid o `col:telefono`/`col:email` (el valor que solo
 * vive en la columna de `clientes`, sin fila hija todavía) — las funciones de
 * `cartera-edicion.ts` ya saben resolverlo.
 */
function statusDe(estado: string): number {
  if (estado === 'ok') return 200
  if (estado === 'invalido') return 422
  if (estado === 'error') return 503
  if (estado === 'no_encontrado') return 404
  return 409 // conflicto · sin_ficha · varias_fichas
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })

    const identidadId = typeof body.identidadId === 'string' ? body.identidadId.trim() : ''
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await cambiarContactoPropio(correduria.id, identidadId, {
      id,
      etiqueta: typeof body.etiqueta === 'string' ? body.etiqueta : undefined,
      principal: body.principal === true ? true : undefined,
    })
    return NextResponse.json(r, { status: statusDe(r.estado) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/contactos/[id]', e) }, { status: 503 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const { id } = await params
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof body?.identidadId === 'string' ? body.identidadId.trim() : ''
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await borrarContactoPropio(correduria.id, identidadId, { id })
    return NextResponse.json(r, { status: statusDe(r.estado) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/contactos/[id]', e) }, { status: 503 })
  }
}
