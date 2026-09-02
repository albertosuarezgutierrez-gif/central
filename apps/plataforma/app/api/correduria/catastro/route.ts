import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { consultarHogar, type ConsultaHogar } from '@/lib/correduria-hogar'

export const dynamic = 'force-dynamic'
// El Catastro puede tardar (varias consultas encadenadas con cerrojo de 350 ms).
export const maxDuration = 30

// POST /api/correduria/catastro — m², año y uso de una vivienda para el
// presupuesto de hogar. Gratis (servicio público) y read-only.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'cuerpo ilegible' }, { status: 400 })

  const texto = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  let consulta: ConsultaHogar
  if (texto('referencia')) {
    consulta = { por: 'referencia', referencia: texto('referencia') }
  } else if (texto('direccion') && texto('municipio') && texto('provincia')) {
    consulta = { por: 'direccion', direccion: texto('direccion'), municipio: texto('municipio'), provincia: texto('provincia') }
  } else {
    return NextResponse.json({ error: 'hace falta la referencia catastral, o dirección + municipio + provincia' }, { status: 400 })
  }
  return NextResponse.json(await consultarHogar(consulta))
}
