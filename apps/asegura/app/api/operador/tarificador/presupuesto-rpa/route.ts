import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado, anotarCambio } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { prepararPresupuestoRpa } from '@/lib/presupuesto-rpa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La narrativa IA tiene 45 s de tope; el resto es BD.
export const maxDuration = 90

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/presupuesto-rpa { oportunidadId, avisar? }` (18/10/2026) — prepara A MANO el presupuesto
 * en BORRADOR de las ofertas RPA de una oportunidad (lo mismo que hace solo el resultado del worker): para oportunidades
 * tarificadas ANTES de que existiera el automático. Idempotente: con las mismas ofertas devuelve el borrador que ya hay
 * (`ya_existe`) y no avisa. No espera a trabajos abiertos (lo pide el operador). `avisar: true` → Telegram a Alberto.
 * NO ENVÍA NADA AL CLIENTE: el borrador sale de ofertas `extraida` y el trigger no lo deja salir hasta revisarlas.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const oportunidadId = typeof body?.oportunidadId === 'string' ? body.oportunidadId.trim() : ''
  if (!UUID.test(oportunidadId)) return NextResponse.json({ estado: 'error', mensaje: 'oportunidadId (uuid) es obligatorio' }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const quien = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await prepararPresupuestoRpa(correduria.id, oportunidadId, { esperarAbiertos: false, avisar: body?.avisar === true, actor: quien })
    if (r.estado === 'error') return NextResponse.json(r, { status: 503 })
    if (r.estado === 'nada' && r.motivo === 'oportunidad_no_encontrada') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'nada') return NextResponse.json(r, { status: 409 })
    if (r.estado === 'creado') anotarCambio({ entidad: 'presupuesto', id: r.presupuestoId, campo: 'origen', antes: null, despues: 'ofertas' })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/presupuesto-rpa', e) }, { status: 503 })
  }
})
