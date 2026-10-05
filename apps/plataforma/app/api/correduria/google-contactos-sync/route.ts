import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { activarGoogleContactosAsegura, estadoGoogleContactosAsegura, simularGoogleContactosAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * /api/correduria/google-contactos-sync — simular y activar la sincronización CRM → Google Contacts.
 * Reenvía al puerto de asegura y devuelve el MISMO status y json.
 *
 *   GET                       → estado de la conexión (`/api/operador/google-contactos`)
 *   POST { accion:'simular' } → informe SOLO LECTURA (`…/simular`), nada se escribe en Google
 *   POST { accion:'activar' } → marca «simulación revisada» (`…/activar`); el `actor` es la SESIÓN
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await estadoGoogleContactosAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const accion = body?.accion
  if (accion !== 'simular' && accion !== 'activar') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Acción: simular o activar.' }, { status: 400 })
  }
  const r = accion === 'simular' ? await simularGoogleContactosAsegura() : await activarGoogleContactosAsegura(guarda.session.email)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
