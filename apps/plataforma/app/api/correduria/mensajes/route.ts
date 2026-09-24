import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { escribirMensaje, leerHilo, leerPendientesMensajes } from '@/lib/mensajes-asegura'

export const dynamic = 'force-dynamic'

/** GET ?clienteId= — el hilo de esa ficha; sin él, las fichas con mensajes sin leer. `sin_datos` ≠ «no hay». */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const clienteId = new URL(req.url).searchParams.get('clienteId')
  return NextResponse.json(clienteId ? await leerHilo(clienteId) : await leerPendientesMensajes())
}

/** POST { accion:'responder', clienteId, polizaId?, cuerpo, avisar? } · { accion:'leidos', clienteId } */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ desenlace: 'invalido', aviso: 'no_pedido' }, { status: 422 })
  // El actor sale de la SESIÓN; lo que venga en el cuerpo se pisa.
  const r = await escribirMensaje(b, guarda.session.email)
  return NextResponse.json({ desenlace: r.desenlace, aviso: r.aviso }, { status: r.status })
}
