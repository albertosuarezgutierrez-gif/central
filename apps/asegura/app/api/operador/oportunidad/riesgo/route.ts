import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { leerRiesgo } from '@/lib/oportunidad-riesgo'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/oportunidad/riesgo?id=` — el riesgo entero para su pantalla (29/09/2026):
 * la oportunidad, sus figuras (con el vínculo y lo que les falta), los vínculos del cliente para
 * elegir y las variantes P1…Pn con su mejor precio, su presupuesto y lo que cambió entre ellas.
 * Sin DNI ni petición al vendor: solo nombres y diferencias.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'falta id' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await leerRiesgo(correduria.id, id)
    if (!r) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/riesgo', e) }, { status: 500 })
  }
}
