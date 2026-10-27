import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { escribirModuloPortalAsegura, modulosPortalAsegura } from '@/lib/portal-cliente-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/portal-modulos — los módulos del portal de UN cliente.
 *   GET  ?clienteId=…                       → catálogo con estado y si se puede activar (y por qué no)
 *   POST { clienteId, modulo, accion }      → 'activar' | 'retirar'
 *   POST { identidadId, modulo, accion: 'activar' } → (27/10/2026) persona del portal SIN ficha: asegura crea la ficha de
 *                                           prospecto y activa. Exactamente uno de los dos ids.
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura con el secreto de operador. Las reglas
 * (desde el 27/10/2026 activar = autorizar, sin exigir póliza) las vuelve a decidir asegura al escribir. El `actor` lo pone el
 * SERVIDOR desde la sesión; no se hace spread del body.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('clienteId') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  const r = await modulosPortalAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const clienteId = typeof b?.clienteId === 'string' && b.clienteId.trim() !== '' ? b.clienteId.trim() : null
  const identidadId = typeof b?.identidadId === 'string' && b.identidadId.trim() !== '' ? b.identidadId.trim() : null
  if (!b || (clienteId === null) === (identidadId === null) || typeof b.modulo !== 'string' || (b.accion !== 'activar' && b.accion !== 'retirar')) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan clienteId o identidadId (uno), modulo o accion.' }, { status: 422 })
  }
  const r = await escribirModuloPortalAsegura({
    ...(clienteId !== null ? { clienteId } : { identidadId: identidadId! }),
    modulo: b.modulo,
    accion: b.accion,
    actor: guarda.session.email,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
