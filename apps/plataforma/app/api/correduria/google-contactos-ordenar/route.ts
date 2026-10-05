import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { ordenarAgendaGoogleAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET /api/correduria/google-contactos-ordenar — informe «Ordenar agenda» (SOLO LECTURA; reenvía a
 * `/api/operador/google-contactos/ordenar` y devuelve el MISMO status y json).
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await ordenarAgendaGoogleAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
