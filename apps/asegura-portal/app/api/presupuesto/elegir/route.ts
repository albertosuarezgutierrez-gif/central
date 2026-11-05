import { NextResponse } from 'next/server'

import { accesoPuenteDe, presupuestoAbiertoAlCliente } from '@/lib/presupuesto'
import { pedirEleccion } from '@/lib/renovacion-vista'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/presupuesto/elegir — RENOVACIÓN CON ALTERNATIVAS (04/11/2026): el cliente elige SIN firmar.
 *   { presupuestoId, eleccion:'opcion', opcionId } | { presupuestoId, eleccion:'renovacion' }
 *
 * NO contrata, NO firma, NO emite: asegura (puente) resuelve la ficha con el ACCESO de la cookie —la identidad de la SESIÓN
 * o, si entró con el código del WhatsApp, el token de ESE presupuesto (05/11/2026)—, anota la elección y manda él mismo
 * el Telegram a Alberto (si no sale, queda en el historial de la ficha: `avisarEleccion`). Nunca una ficha que venga en el cuerpo.
 * La vista de corredor no elige (403); una persona de contacto tampoco (403 `sin_permiso`; asegura también lo niega).
 * Vale la primera elección: si ya eligió otra persona, 409 `ya_elegida` con su nombre de pila.
 * 503 = no disponible (falta la migración o el puente): nunca se finge una elección guardada.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof b?.presupuestoId === 'string' ? b.presupuestoId.trim() : ''
  if (!UUID.test(presupuestoId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  const puerta = await accesoPuenteDe(presupuestoId)
  if (!puerta) return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  if (puerta.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })
  if (puerta.tercero) return NextResponse.json({ estado: 'sin_permiso' }, { status: 403 })
  const eleccion = b?.eleccion === 'renovacion'
    ? { eleccion: 'renovacion' as const }
    : b?.eleccion === 'opcion' && typeof b.opcionId === 'string' && UUID.test(b.opcionId.trim()) ? { eleccion: 'opcion' as const, opcionId: b.opcionId.trim() } : null
  if (!eleccion) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  // Un borrador no se elige: 404 neutro, como la pantalla.
  if (!(await presupuestoAbiertoAlCliente(presupuestoId))) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })

  const r = await pedirEleccion(puerta.acceso, presupuestoId, eleccion)
  if (r.estado === 'ok') return NextResponse.json({ estado: 'ok' })
  if (r.estado === 'ya_elegida') return NextResponse.json({ estado: 'ya_elegida', por: r.por }, { status: 409 })
  const status = r.estado === 'limite' ? 429 : r.estado === 'caducado' ? 410 : r.estado === 'no_disponible' ? 503 : r.estado === 'sin_permiso' ? 403 : 502
  return NextResponse.json({ estado: r.estado }, { status })
}
