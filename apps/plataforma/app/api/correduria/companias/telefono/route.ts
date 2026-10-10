import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { telefonoContactoAsegura } from '@/lib/companias-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/companias/telefono `{ contactoId, telefono: string | null }` — pone o quita el
 * teléfono de un contacto de compañía (05/10/2026). asegura lo valida y lo guarda en E.164; un texto
 * que no es teléfono vuelve 400 sin tocar nada.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const contactoId = typeof body?.contactoId === 'string' ? body.contactoId : null
  const telefono = body?.telefono
  if (!contactoId || !(telefono === null || typeof telefono === 'string')) {
    return NextResponse.json({ estado: 'invalido', error: '{ contactoId, telefono: string | null }' }, { status: 400 })
  }
  const r = await telefonoContactoAsegura(contactoId, telefono)
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
