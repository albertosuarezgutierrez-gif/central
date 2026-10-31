import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSituacionFiscal, guardarCampoPerfil } from '@/lib/situacion-fiscal-db'
import { CAMPOS_EDITABLES, validarCampo } from '@/lib/situacion-fiscal'

export const dynamic = 'force-dynamic'

// Radiografía de lo personal que usa el motor fiscal. Siempre scoped por la cuenta de la sesión.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await getSituacionFiscal(session.id))
}

// Edita campos sueltos (cuota de autónomos de Pilar, meses exonerados, retenciones). Cuerpo: { campo, valor|null }.
// La familia/hijos/modalidad/planes se editan por PUT /api/finanzas/perfil (mismo formulario de siempre).
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.campo !== 'string') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  const v = validarCampo(body.campo, body.valor === undefined ? NaN : body.valor)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    await guardarCampoPerfil(session.id, CAMPOS_EDITABLES[body.campo].columna, v.valor)
  } catch (e) {
    console.error('[finanzas/situacion-fiscal] PATCH', e)
    return NextResponse.json({ error: 'No se pudo guardar (¿falta aplicar prisma/sql/2026-10-31_situacion_fiscal.sql?)' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
