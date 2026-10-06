import { NextResponse } from 'next/server'

import { leerEscrituraCarnet } from '@/lib/carnets-escritura'
import { requireIdentidad } from '@/lib/session'

import { escribirYResponder } from '@/lib/carnets-api'

export const runtime = 'nodejs'

/**
 * POST /api/mis-datos/carnets — el cliente añade un carné de conducir. `{ fichaId, tipo, fecha }`.
 *
 * 🚨 La identidad sale de la COOKIE (`requireIdentidad`), nunca del cuerpo. `fichaId` es el titular que ha
 * elegido y lo comprueba `apps/asegura` contra sus vínculos (`lib/carnets-escritura.ts`). La vista de
 * corredor no llega aquí: el `middleware` veta toda escritura de `/api/*` con 403 `modo_corredor`.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }
  const op = leerEscrituraCarnet('alta', await req.json().catch(() => null))
  if (!op) return NextResponse.json({ estado: 'invalido', motivo: 'Faltan el titular, el tipo o la fecha del carné.' }, { status: 400 })
  return escribirYResponder(identidad.id, op)
}
