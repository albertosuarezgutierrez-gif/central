import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { borrarCursoAsegura, formacionAsegura, registrarCursoAsegura } from '@/lib/formacion-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/formacion — formación continua IDD. Reenvía al puerto de asegura
 * (`/api/operador/formacion`) y devuelve el MISMO status y json.
 *
 *   GET    ?año=YYYY
 *   POST   { persona, curso, entidad?, fecha, horas, documentoId? }   (actor lo pone el servidor, el último)
 *   DELETE ?id=
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const añoHoy = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 4))
  const año = Number(new URL(req.url).searchParams.get('año') ?? añoHoy)
  const r = await formacionAsegura(año)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ estado: 'invalida', motivos: ['Cuerpo vacío.'] }, { status: 422 })
  const r = await registrarCursoAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function DELETE(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await borrarCursoAsegura(new URL(req.url).searchParams.get('id') ?? '')
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
