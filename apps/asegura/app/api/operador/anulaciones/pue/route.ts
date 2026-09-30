import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { bajasPendientesPue, marcarBajaTramitadaPue } from '@/lib/baja-pue'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Bajas de Allianz para tramitar a mano en el PUE (extranet de mediadores). Allianz no las recibe por
 * correo: ver `docs/ALLIANZ-PUE.md`.
 *
 *   GET  → { estado:'ok', bajas:[{ anulacionId, polizaId, clienteId, cliente, desde, ficha, documentoId, esperaEmision }] }
 *   POST { anulacionId, actor } → la marca `comunicada` + nota en el historial. 404 · 409 no_permitida.
 *
 * El GET sirve también para MEDIR el volumen antes de plantearse automatizar el PUE.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    return NextResponse.json({ estado: 'ok', bajas: await bajasPendientesPue(correduria.id) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/anulaciones/pue', e) }, { status: 500 })
  }
}

const STATUS: Record<string, number> = { hecho: 200, no_encontrada: 404, no_permitida: 409 }

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const anulacionId = typeof cuerpo?.anulacionId === 'string' ? cuerpo.anulacionId.trim() : ''
  const actor = typeof cuerpo?.actor === 'string' && cuerpo.actor.trim() ? cuerpo.actor.trim() : 'corredor'
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anulacionId)) return NextResponse.json({ estado: 'invalida', motivo: 'anulacionId no válido' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await marcarBajaTramitadaPue(correduria.id, anulacionId, actor)
    return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/anulaciones/pue', e) }, { status: 500 })
  }
})
