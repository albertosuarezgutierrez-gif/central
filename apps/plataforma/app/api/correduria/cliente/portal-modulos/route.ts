import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { escribirModuloPortalAsegura, modulosPortalAsegura } from '@/lib/portal-cliente-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/portal-modulos — los módulos del portal de UN cliente.
 *   GET  ?clienteId=…                       → catálogo con estado y si se puede activar (y por qué no)
 *   POST { clienteId, modulo, accion }      → 'activar' | 'retirar'
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura con el secreto de operador. Las reglas
 * (p. ej. Patrimonio solo con póliza en vigor) las vuelve a decidir asegura al escribir. El `actor` lo pone el
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
  if (!b || typeof b.clienteId !== 'string' || b.clienteId.trim() === '' || typeof b.modulo !== 'string' || (b.accion !== 'activar' && b.accion !== 'retirar')) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan clienteId, modulo o accion.' }, { status: 422 })
  }
  const r = await escribirModuloPortalAsegura({ clienteId: b.clienteId.trim(), modulo: b.modulo, accion: b.accion, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
