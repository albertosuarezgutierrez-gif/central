import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerUltimoRiesgoTarificador } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/correduria/tarificador/ultimo-riesgo?cliente_id= — el riesgo del último trabajo del bot de ese
 * cliente, para PRE-RELLENAR el modal «Precio Allianz (bot)». Solo lectura. Error de red → 502, falta de
 * secreto → 503 (lo resuelve `puerto()`); la pantalla lo trata como «sin datos previos».
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const clienteId = (new URL(req.url).searchParams.get('cliente_id') ?? '').trim()
  if (!UUID.test(clienteId)) return NextResponse.json({ estado: 'error', mensaje: 'cliente_id no es un uuid' }, { status: 400 })
  const r = await leerUltimoRiesgoTarificador(clienteId)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
