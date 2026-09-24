import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { marcarContactoAsegura } from '@/lib/companias-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/companias/contactado — marca `ultimo_contacto_en` de
 * un contacto de compañía. Lo dispara el botón de WhatsApp/mail al pulsarse;
 * best-effort, sin bloquear la apertura del enlace.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const contactoId = typeof body?.contactoId === 'string' ? body.contactoId : null
  if (!contactoId) return NextResponse.json({ error: 'falta contactoId' }, { status: 400 })
  const r = await marcarContactoAsegura(contactoId)
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
