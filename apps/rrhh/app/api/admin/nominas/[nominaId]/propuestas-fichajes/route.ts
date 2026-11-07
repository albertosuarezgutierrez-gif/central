import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { proponerDesdeFichajes, aprobarPropuestas, SinContratoError } from '@/lib/fichajes-nomina'
import { MesNoCerradoError, FichajeAjenoError } from '@central/module-nominas'

// N2: GET = propuestas de horas extra/ausencias/retrasos desde los fichajes APROBADOS del mes (no escribe nada).
//     POST { claves: string[] } = el responsable aprueba esas propuestas (se recalculan aquí; del cliente solo llegan claves).
// empresa_id SIEMPRE de la sesión.
function errorDe(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
  if (e instanceof MesNoCerradoError) return NextResponse.json({ error: e.message, codigo: 'mes_no_cerrado' }, { status: 409 })
  if (e instanceof SinContratoError) return NextResponse.json({ error: e.message }, { status: 409 })
  if (e instanceof FichajeAjenoError) return NextResponse.json({ error: 'Datos de fichajes inconsistentes: se aborta' }, { status: 500 })
  if (e instanceof Error && e.message.includes('confirmada')) return NextResponse.json({ error: e.message }, { status: 409 })
  if (e instanceof Error && (e.name === 'CifraPendienteError' || e.name === 'CifraDesconocidaError')) return NextResponse.json({ error: e.message }, { status: 422 })
  throw e
}

export async function GET(_req: Request, { params }: { params: Promise<{ nominaId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { nominaId } = await params
    const p = await proponerDesdeFichajes(empresa_id, nominaId)
    if (!p) return NextResponse.json({ error: 'Nómina no encontrada' }, { status: 404 })
    return NextResponse.json(p)
  } catch (e) { return errorDe(e) }
}

export async function POST(req: Request, { params }: { params: Promise<{ nominaId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { nominaId } = await params
    const body = await req.json().catch(() => ({}))
    const claves: unknown = body?.claves
    if (!Array.isArray(claves) || !claves.length || claves.length > 100 || !claves.every(c => typeof c === 'string' && c.length <= 80)) {
      return NextResponse.json({ error: 'claves (lista de textos) obligatorias' }, { status: 400 })
    }
    const r = await aprobarPropuestas(empresa_id, nominaId, claves as string[])
    if (!r) return NextResponse.json({ error: 'Nómina no encontrada' }, { status: 404 })
    return NextResponse.json(r)
  } catch (e) { return errorDe(e) }
}
