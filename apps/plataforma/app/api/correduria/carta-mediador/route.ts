import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { accionCartaAsegura, leerCartas, leerCartasPorTramitar } from '@/lib/carta-mediador-asegura'

export const dynamic = 'force-dynamic'

/** GET ?polizaId= — cartas de nombramiento de esa póliza; ?pendientes=1 — las de «Hoy». `sin_datos` ≠ «no hay». */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = new URL(req.url).searchParams
  if (q.get('pendientes') === '1') return NextResponse.json(await leerCartasPorTramitar())
  const polizaId = q.get('polizaId') ?? ''
  if (!polizaId) return NextResponse.json({ estado: 'sin_datos', causa: 'falta la póliza' }, { status: 422 })
  return NextResponse.json(await leerCartas(polizaId))
}

/** PATCH { id, accion:'enviada'|'aceptada'|'rechazada'|'desistida', motivo? } */
export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ ok: false, motivo: 'cuerpo vacío' }, { status: 422 })
  // El actor sale de la SESIÓN; lo que venga en el cuerpo se pisa.
  const r = await accionCartaAsegura(b, guarda.session.email)
  return NextResponse.json({ ok: r.ok, motivo: r.motivo }, { status: r.status })
}
