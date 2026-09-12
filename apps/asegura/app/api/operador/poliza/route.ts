import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { fichaPoliza } from '@/lib/cartera-poliza'
import { establecerModalidadRc } from '@/lib/cartera-poliza-editar'

export const dynamic = 'force-dynamic'

// GET /api/operador/poliza?id=<uuid> — la ficha de UNA póliza: coberturas,
// todos los recibos, siniestros, intervinientes, documentos y la copia gemela
// del volcado. Read-only, gratis. Mismos cuatro estados que `/cliente`.
//
// 🔒 Igual que allí: DNI, IBAN y la dirección del TOMADOR no cruzan. La
// dirección del RIESGO (dónde está la casa asegurada) sí: sin ella una póliza
// de hogar no se puede ni identificar.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const poliza = await fichaPoliza(correduria.id, id)
    if (!poliza) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', poliza })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/poliza', e) })
  }
}

// PATCH /api/operador/poliza — ÚNICA escritura de esta ruta: anotar a mano la
// MODALIDAD de una RC cuando la compañía no manda coberturas por CIMA. Body
// `{ id, modalidad, nota?, actor }`. Nunca sobre otro campo ni otro ramo.
export async function PATCH(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ estado: 'error', motivo: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const actor = typeof body?.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim() : 'desconocido'
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id de la póliza.' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const r = await establecerModalidadRc(correduria.id, id, { modalidad: body?.modalidad, nota: body?.nota, actor })
    return NextResponse.json(r, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/poliza-patch', e) }, { status: 500 })
  }
}
