import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { revisarCuerpoBorrador, RAMOS_BORRADOR_SERVIDOR } from '@/lib/correduria/borrador-servidor'
import {
  borradoresPresupuestoAsegura,
  borrarBorradorPresupuestoAsegura,
  guardarBorradorPresupuestoAsegura,
} from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/borrador-presupuesto — lo tecleado en una pantalla de presupuesto, en servidor
 * (05/10/2026). Reenvía al puerto de asegura; el `actor` lo pone el servidor. No crea oportunidades.
 *   GET    ?clienteId=&ramo=                → { borradores: [{ oportunidadId, datos, guardadoEn }] }
 *   POST   { clienteId, oportunidadId?, ramo, datos, guardadoEn }   (también con `keepalive` al cerrar)
 *   DELETE ?clienteId=&ramo=&oportunidadId= → al pagar con éxito
 */
function ramoValido(r: string | null): r is (typeof RAMOS_BORRADOR_SERVIDOR)[number] {
  return r !== null && (RAMOS_BORRADOR_SERVIDOR as readonly string[]).includes(r)
}

export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = new URL(req.url).searchParams
  const clienteId = (q.get('clienteId') ?? '').trim()
  const ramo = q.get('ramo')
  if (clienteId === '' || !ramoValido(ramo)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el cliente o el ramo.' }, { status: 422 })
  const r = await borradoresPresupuestoAsegura(clienteId, ramo)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const v = revisarCuerpoBorrador(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
  const r = await guardarBorradorPresupuestoAsegura({ ...v.valor, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function DELETE(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = new URL(req.url).searchParams
  const clienteId = (q.get('clienteId') ?? '').trim()
  const ramo = q.get('ramo')
  if (clienteId === '' || !ramoValido(ramo)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el cliente o el ramo.' }, { status: 422 })
  const r = await borrarBorradorPresupuestoAsegura(clienteId, ramo, q.get('oportunidadId')?.trim() || null)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
