import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { bandejaPendientes, conversacionesDeCliente } from '@/lib/whatsapp/conversaciones'
import { borrarConversacion } from '@/lib/whatsapp/retencion'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Conversaciones de WhatsApp de la correduría (para que plataforma las pinte). Doc: docs/WHATSAPP.md.
 *   GET ?clienteId=<uuid>        → las de esa ficha (y de las fusionadas en ella), con sus últimos 50 mensajes
 *   GET ?bandeja=pendientes      → las que no tienen ficha y siguen `pendiente_clasificar` (10 mensajes c/u)
 *   DELETE ?id=<conversacionId>  → derecho de supresión: borra conversación, mensajes y crudo de Meta
 * El texto y el teléfono se devuelven descifrados (el teléfono sí cruza el puerto: es para llamar).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const p = new URL(req.url).searchParams
  const clienteId = (p.get('clienteId') ?? '').trim()
  const bandeja = p.get('bandeja')
  if (clienteId === '' && bandeja !== 'pendientes') {
    return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId o bandeja=pendientes' }, { status: 400 })
  }
  if (clienteId !== '' && !UUID.test(clienteId)) return NextResponse.json({ estado: 'invalido', motivo: 'clienteId no válido' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const conversaciones = clienteId !== '' ? await conversacionesDeCliente(correduria.id, clienteId) : await bandejaPendientes(correduria.id)
    return NextResponse.json({ estado: 'ok', conversaciones })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/conversaciones', e) })
  }
}

export const DELETE = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (!UUID.test(id)) return NextResponse.json({ estado: 'invalido', motivo: 'falta id de conversación' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await borrarConversacion(correduria.id, id)
    if (!r.ok) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', mensajes: r.mensajes, crudos: r.crudos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/conversaciones:delete', e) }, { status: 500 })
  }
})
