import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { solicitarCambioCuenta } from '@/lib/cambio-cuenta'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/portal/cuenta — el CLIENTE pide cambiar la cuenta de sus recibos. Cuerpo:
 * `{ identidadId, iban, identidadCreadaEn? }`. El portal ya ha comprobado el código de un solo uso al correo.
 *
 * 🚨 Como `/api/portal/contacto`: no acepta `clienteId` (la ficha sale del vínculo de la identidad) y
 * la respuesta no devuelve el IBAN, solo la máscara.
 */
export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof body?.identidadId === 'string' ? body.identidadId.trim() : ''
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const creada = typeof body?.identidadCreadaEn === 'string' ? new Date(body.identidadCreadaEn) : null
    const r = await solicitarCambioCuenta(correduria.id, identidadId, body?.iban, creada && !Number.isNaN(creada.getTime()) ? creada : null)
    const status =
      r.estado === 'ok' || r.estado === 'sin_cambios' ? 200
        : r.estado === 'iban_invalido' ? 422
          : r.estado === 'error' ? 503
            : 409 // sin_ficha · varias_fichas
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/cuenta', e) }, { status: 503 })
  }
}
