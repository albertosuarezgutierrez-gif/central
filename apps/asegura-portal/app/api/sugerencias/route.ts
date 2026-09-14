import { NextResponse } from 'next/server'

import { sugerenciasDeSesion } from '@/lib/sugerencias'

export const runtime = 'nodejs'

/**
 * «También conocemos a…» — relaciones YA CARGADAS por Alberto sobre tus
 * propias fichas (`cliente_relaciones`) que todavía no puedes ver. La pantalla
 * las ofrece como un atajo a «Pedir acceso» sin escribir un correo.
 *
 * Sin `try/catch`: si `sugerenciasDeIdentidad` falla, que suba como error. Un
 * `{ sugerencias: [] }` de consuelo diría «no tienes a nadie que ofrecerte»
 * cuando puede que sí — la misma regla que ya sigue `GET /api/autorizaciones`.
 */
export async function GET() {
  const sugerencias = await sugerenciasDeSesion()
  if (sugerencias === null) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ sugerencias })
}
