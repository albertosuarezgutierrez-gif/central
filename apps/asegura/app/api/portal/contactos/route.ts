import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anadirContactoPropio, listarContactosPropios } from '@/lib/contacto-portal'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/portal/contactos?identidadId= — TODOS los teléfonos/emails de la
 * ficha de esa identidad (no solo el principal, a diferencia de
 * `/api/portal/contacto`). Es la lista que alimenta «Configuración» en el
 * portal, para que el cliente se autogestione sin depender de Alberto.
 *
 * POST /api/portal/contactos — añade uno NUEVO. Cuerpo:
 * `{ identidadId, tipo: 'telefono'|'email', valor, etiqueta?, principal? }`.
 *
 * 🚨 Mismo borde que `/api/portal/contacto`: no acepta `clienteId` (la ficha
 * sale de `portal_vinculo`) ni ningún campo de identidad.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = (new URL(req.url).searchParams.get('identidadId') ?? '').trim()
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await listarContactosPropios(correduria.id, identidadId)
    const status = r.estado === 'ok' ? 200 : r.estado === 'error' ? 503 : 409
    return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/contactos', e) }, { status: 503 })
  }
}

export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })

    const identidadId = typeof body.identidadId === 'string' ? body.identidadId.trim() : ''
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const tipo = body.tipo === 'email' ? 'email' : body.tipo === 'telefono' ? 'telefono' : null
    if (!tipo) return NextResponse.json({ estado: 'invalido', motivo: 'tipo no reconocido' }, { status: 422 })
    if (typeof body.valor !== 'string' || body.valor.trim() === '') {
      return NextResponse.json({ estado: 'invalido', motivo: 'sin valor', campo: tipo }, { status: 422 })
    }

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await anadirContactoPropio(correduria.id, identidadId, {
      tipo,
      valor: body.valor,
      etiqueta: typeof body.etiqueta === 'string' ? body.etiqueta : null,
      principal: body.principal === true,
    })
    const status =
      r.estado === 'ok' ? 201
        : r.estado === 'invalido' ? 422
          : r.estado === 'error' ? 503
            : r.estado === 'no_encontrado' ? 404
              : 409 // conflicto · sin_ficha · varias_fichas
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/contactos', e) }, { status: 503 })
  }
}
