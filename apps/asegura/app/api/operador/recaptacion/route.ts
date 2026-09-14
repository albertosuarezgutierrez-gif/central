import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { colaRecaptacion } from '@/lib/cartera-recaptacion'

export const dynamic = 'force-dynamic'

// GET /api/operador/recaptacion — la cola de recaptación: leads del volcado
// sin vencimiento, con contacto disponible, que no son ya cliente vivo por
// CIMA. Read-only. Ver docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', ...(await colaRecaptacion(correduria.id)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/recaptacion', e) })
  }
}
