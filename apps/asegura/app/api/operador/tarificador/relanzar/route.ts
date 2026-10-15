import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { lanzarPendientes } from '@/lib/tarificador'
import { relanzarTrabajo } from '@/lib/tarificador-robustez'
import { rpaActivo } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/relanzar { trabajoId }` — devuelve a `pendiente` un trabajo `atascado`
 * de tarificar con su MISMO riesgo (descarta antes sus atascos esperando). Para iterar arreglo→prueba sin la pantalla.
 * 409 si el estado no es relanzable, si hay un trabajo vivo de la compañía o está en pausa; 429 si se pasó el tope de
 * relanzamientos por compañía en 24 h. 503 si no hay BD de auditoría (de ella sale el recuento del tope) o el RPA está apagado. Respuesta sin PII.
 * TARIFICAR ≠ EMITIR: nada de esto contrata.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const trabajoId = typeof body?.trabajoId === 'string' ? body.trabajoId.trim() : ''
  if (!UUID.test(trabajoId)) return NextResponse.json({ estado: 'error', mensaje: 'trabajoId (uuid) es obligatorio' }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const quien = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await relanzarTrabajo(correduria.id, trabajoId, quien)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'sin_esquema') return NextResponse.json({ estado: 'sin_esquema', mensaje: 'sin la BD de auditoría no se puede contar el tope de relanzamientos' }, { status: 503 })
    if (r.estado === 'conflicto') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    const l = await lanzarPendientes(correduria.id, r.compania).catch(() => null)
    return NextResponse.json({ estado: 'relanzado', trabajoId: r.trabajoId, atascosDescartados: r.atascosDescartados, lanzado: !!l?.lanzados.includes(r.trabajoId) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/relanzar', e) }, { status: 503 })
  }
})
