import { NextResponse } from 'next/server'

import { guardarMatriculacion } from '@/lib/flota'
import { requireIdentidad } from '@/lib/session'

import { ESTADO_HTTP_FLOTA } from '../estado-http'

export const runtime = 'nodejs'

/**
 * Anota (o borra con `null`) la fecha de matriculación de un vehículo de la flota,
 * que es de lo que sale la próxima ITV. Dueño o jefe de flota. El vehículo se busca
 * DENTRO de la flota autorizada por la sesión; el ancla se guarda en `portal_bien`
 * de la EMPRESA, por matrícula.
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
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }
  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  // `undefined` (no lo mandó) no es «bórrala»: solo `null` explícito borra.
  if (!('fechaMatriculacion' in c)) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  const r = await guardarMatriculacion({
    identidadId: identidad.id,
    empresaId: c.empresaId,
    polizaId: c.polizaId,
    fecha: c.fechaMatriculacion,
  })
  if (!r.ok) return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP_FLOTA[r.error] })
  return NextResponse.json({ ok: true })
}
