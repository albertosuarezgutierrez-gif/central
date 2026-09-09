import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { confirmarContactoPropio } from '@/lib/contacto-portal'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/portal/contacto-confirmar — el CLIENTE dice «mis datos de contacto
 * siguen igual». Cuerpo: `{ identidadId }`. Sella `contacto_confirmado_at` en
 * su ficha y deja la línea en `historial_interno`, sin valores.
 *
 * 🚨 No acepta `clienteId` (la ficha la resuelve `portal_vinculo`) y no escribe
 * ningún dato de contacto: solo el sello. `sin_ficha` y `varias_fichas` son
 * 409 —no hay una ficha suya donde sellarlo, y eso lo resuelve el corredor—.
 */
export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })

    const identidadId = typeof body.identidadId === 'string' ? body.identidadId.trim() : ''
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 503 })

    const r = await confirmarContactoPropio(correduria.id, identidadId)
    const status = r.estado === 'ok' ? 200 : r.estado === 'error' ? 503 : 409
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/contacto-confirmar', e) },
      { status: 503 },
    )
  }
}
