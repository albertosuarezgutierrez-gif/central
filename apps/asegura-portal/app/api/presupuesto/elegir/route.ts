import { NextResponse } from 'next/server'

import { presupuestoAbiertoAlCliente } from '@/lib/presupuesto'
import { pedirEleccion } from '@/lib/renovacion-vista'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/presupuesto/elegir — RENOVACIÓN CON ALTERNATIVAS (04/11/2026): el cliente elige SIN firmar.
 *   { presupuestoId, eleccion:'opcion', opcionId } | { presupuestoId, eleccion:'renovacion' }
 *
 * NO contrata, NO firma, NO emite: asegura (puente) resuelve la ficha por `portal_vinculo` con la identidad de la SESIÓN,
 * anota la elección y manda él mismo el Telegram a Alberto (si no sale, queda en el historial de la ficha: `avisarEleccion`).
 * La vista de corredor no elige (403).
 * 503 = no disponible (falta la migración o el puente): nunca se finge una elección guardada.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof b?.presupuestoId === 'string' ? b.presupuestoId.trim() : ''
  if (!UUID.test(presupuestoId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  const eleccion = b?.eleccion === 'renovacion'
    ? { eleccion: 'renovacion' as const }
    : b?.eleccion === 'opcion' && typeof b.opcionId === 'string' && UUID.test(b.opcionId.trim()) ? { eleccion: 'opcion' as const, opcionId: b.opcionId.trim() } : null
  if (!eleccion) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  // Un borrador no se elige: 404 neutro, como la pantalla.
  if (!(await presupuestoAbiertoAlCliente(presupuestoId))) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })

  const r = await pedirEleccion(identidad.id, presupuestoId, eleccion)
  if (r.estado === 'ok') return NextResponse.json({ estado: 'ok' })
  const status = r.estado === 'limite' ? 429 : r.estado === 'caducado' ? 410 : r.estado === 'no_disponible' ? 503 : 502
  return NextResponse.json({ estado: r.estado }, { status })
}
