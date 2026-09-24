import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { escribirAnulacion, leerAnulaciones } from '@/lib/anulaciones-asegura'

export const dynamic = 'force-dynamic'

/** GET ?polizaId= — expedientes de esa póliza; sin él, los abiertos. `sin_datos` ≠ «no hay». */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const polizaId = new URL(req.url).searchParams.get('polizaId') ?? undefined
  return NextResponse.json(await leerAnulaciones(polizaId))
}

async function escribir(req: Request, metodo: 'POST' | 'PATCH') {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ desenlace: 'invalida', motivo: 'cuerpo vacío' }, { status: 422 })
  // El actor sale de la SESIÓN; lo que venga en el cuerpo se pisa.
  const r = await escribirAnulacion(metodo, b, guarda.session.email)
  return NextResponse.json({ desenlace: r.desenlace, motivo: r.motivo, advertencia: r.advertencia }, { status: r.status })
}

/** POST { polizaId, tipo, solicitadaPor, motivo, motivoTexto?, fechaEfecto } — abre el expediente. */
export async function POST(req: Request) {
  return escribir(req, 'POST')
}

/** PATCH { id, accion:'marcar_firmada'|'marcar_comunicada'|'confirmar'|'desistir', nota? } */
export async function PATCH(req: Request) {
  return escribir(req, 'PATCH')
}
