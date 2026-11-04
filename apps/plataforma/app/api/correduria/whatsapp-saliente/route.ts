import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { salientePrevistoAsegura } from '@/lib/seguimiento-asegura'
import { cuerpoSaliente, type RegistroSaliente } from '@/lib/correduria/saliente-whatsapp'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/whatsapp-saliente — registra el `wa.me` que Alberto acaba de abrir (spec 2026-11-04 §4).
 * Reenvía a `POST /api/operador/whatsapp/saliente-previsto` de asegura y devuelve el MISMO status y json.
 *   { telefono, origen, texto?, clienteId?, reciboId?, oportunidadId?, polizaId?, solicitudId? }
 * El botón NO espera esta respuesta (fire-and-forget): registrar no es enviar, y si falla WhatsApp ya está abierto.
 * El actor lo pone el servidor desde la sesión (`cabecerasPuerto`), nunca el cuerpo.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as (RegistroSaliente & { telefono?: unknown; texto?: unknown }) | null
  const cuerpo = b && typeof b === 'object'
    ? cuerpoSaliente(b, typeof b.telefono === 'string' ? b.telefono : null, typeof b.texto === 'string' ? b.texto : null)
    : null
  if (!cuerpo) return NextResponse.json({ estado: 'invalido', motivo: 'teléfono u origen no válidos' }, { status: 422 })
  const r = await salientePrevistoAsegura(cuerpo)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
