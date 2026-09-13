import { NextResponse } from 'next/server'

import { crearRecordatorio } from '@/lib/recordatorios'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Alta de un recordatorio PROPIO (ITV, carnet, caldera… o texto libre). La
 * identidad SIEMPRE sale de la cookie, nunca del cuerpo: es lo único que
 * impide que alguien escriba en el calendario de otro. La validación de los
 * campos vive en `normalizarRecordatorio()` (módulo puro) y se comparte con
 * cualquier otra puerta que se abra a esto en el futuro.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }

  const resultado = await crearRecordatorio(identidad.id, (cuerpo ?? {}) as Record<string, unknown>)
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 })
  return NextResponse.json({ id: resultado.id }, { status: 201 })
}
