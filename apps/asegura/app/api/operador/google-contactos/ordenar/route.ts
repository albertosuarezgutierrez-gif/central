import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { ordenarAgendaGoogle } from '@/lib/google-contactos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/operador/google-contactos/ordenar — informe «Ordenar agenda», SOLO LECTURA: duplicados por
 * teléfono fuera de la etiqueta, sin nombre, no E.164, fichas guardadas con otro nombre y contactos
 * que parecen de trabajo. Lee la agenda entera (como la simulación) y no escribe nada en ningún sitio.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await ordenarAgendaGoogle(correduria.id)
    const status = r.estado === 'ok' ? 200 : r.estado === 'sin_conexion' ? 404 : r.estado === 'revocada' ? 409 : 503
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/ordenar', e) }, { status: 500 })
  }
}
