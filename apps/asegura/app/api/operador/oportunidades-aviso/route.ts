import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { oportunidadesEnAviso } from '@/lib/oportunidades-aviso'

export const dynamic = 'force-dynamic'

// GET /api/operador/oportunidades-aviso — oportunidades abiertas a ≤45 días de su vencimiento
// (regla única `DIAS_AVISO_OPORTUNIDAD`). Read-only; la idempotencia del aviso la lleva plataforma.
// Mismos estados que el resto del puerto: un fallo NUNCA sale como lista vacía.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ estado: 'error' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    const r = await oportunidadesEnAviso(correduria.id, hoy)
    return NextResponse.json({ estado: 'ok', hoy, ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidades-aviso', e) })
  }
}
