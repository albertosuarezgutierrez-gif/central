import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { crearGrabacionAsegura, listarGrabacionesAsegura } from '@/lib/tarificador-grabaciones-asegura'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'private, no-store' }

/**
 * GET /api/correduria/tarificador/grabaciones — las grabaciones del GRABADOR del tarificador (pantallas de un
 * presupuesto ficticio hecho a mano en el portal de una compañía nueva). Puerto de operador de asegura;
 * reenvía estado y JSON tal cual (503 `tabla_sin_crear` si falta el SQL).
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await listarGrabacionesAsegura()
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: NO_STORE })
}

/** POST { compania, ramo, producto?, nota? } → 201 { id }. Lo valida asegura. */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const r = await crearGrabacionAsegura({ compania: b.compania, ramo: b.ramo, producto: b.producto, nota: b.nota })
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
