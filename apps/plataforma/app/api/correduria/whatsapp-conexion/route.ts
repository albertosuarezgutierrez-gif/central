import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { altaWhatsappAsegura, conexionWhatsappAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/correduria/whatsapp-conexion — conexión del WhatsApp Business de la correduría (Coexistence).
 * Reenvía al puerto de asegura y devuelve el MISMO status y json. Doc: apps/asegura/docs/WHATSAPP.md.
 *
 *   GET                                                   → `/api/operador/whatsapp/conexion`
 *   POST { code, waba_id, phone_number_id, business_id }  → `/api/operador/whatsapp/alta`
 * El `code` lo da el Embedded Signup en el navegador; se canjea SOLO en asegura (aquí no hay App Secret).
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await conexionWhatsappAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

const ID = /^\d{1,30}$/

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const code = b?.code
  const businessId = b?.business_id ?? null
  if (
    typeof code !== 'string' || code.length < 8 || code.length > 4096 ||
    typeof b?.waba_id !== 'string' || !ID.test(b.waba_id) ||
    typeof b?.phone_number_id !== 'string' || !ID.test(b.phone_number_id) ||
    (businessId !== null && (typeof businessId !== 'string' || !ID.test(businessId)))
  ) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan el code o los ids de WhatsApp que devuelve Meta.' }, { status: 400 })
  }
  const r = await altaWhatsappAsegura({ code, waba_id: b.waba_id, phone_number_id: b.phone_number_id, business_id: businessId as string | null })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
