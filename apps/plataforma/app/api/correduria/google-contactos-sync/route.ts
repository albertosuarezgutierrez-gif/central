import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import {
  activarGoogleContactosAsegura, desconectarGoogleContactosAsegura, estadoGoogleContactosAsegura,
  simularGoogleContactosAsegura, ticketGoogleContactosAsegura,
} from '@/lib/seguimiento-asegura'
import { urlConectarValida } from '@/lib/google-contactos-conexion'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * /api/correduria/google-contactos-sync — simular y activar la sincronización CRM → Google Contacts.
 * Reenvía al puerto de asegura y devuelve el MISMO status y json.
 *
 *   GET                       → estado de la conexión (`/api/operador/google-contactos`)
 *   POST { accion:'simular' } → informe SOLO LECTURA (`…/simular`), nada se escribe en Google
 *   POST { accion:'activar' } → marca «simulación revisada» (`…/activar`); el `actor` es la SESIÓN
 *   POST { accion:'conectar' } → ticket de un solo uso (`…/ticket`, `x-actor` = la sesión) →
 *                                `{ estado:'ok', url }`; el navegador va a esa URL de asegura
 *   POST { accion:'desconectar', borrarContactos: boolean } → `…/desconectar`
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
  if (accion === 'conectar') {
    const r = await ticketGoogleContactosAsegura()
    const j = (r.json ?? {}) as Record<string, unknown>
    if (r.status !== 200 || j.estado !== 'ok') {
      return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status === 200 ? 502 : r.status })
    }
    // Solo se devuelve al navegador una URL de `conectar` con su ticket: nada más sale de aquí.
    const url = urlConectarValida(j.url)
    if (!url) return NextResponse.json({ estado: 'error', motivo: 'url_no_valida' }, { status: 502 })
    return NextResponse.json({ estado: 'ok', url })
  }
  if (accion === 'desconectar') {
    if (typeof body?.borrarContactos !== 'boolean') {
      return NextResponse.json({ estado: 'invalido', motivo: 'borrarContactos: boolean' }, { status: 400 })
    }
    const r = await desconectarGoogleContactosAsegura(body.borrarContactos)
    return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
  }
  if (accion !== 'simular' && accion !== 'activar') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Acción: simular, activar, conectar o desconectar.' }, { status: 400 })
  }
  const r = accion === 'simular' ? await simularGoogleContactosAsegura() : await activarGoogleContactosAsegura(guarda.session.email)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
