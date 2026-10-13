import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerIntegracionesTarificador } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'

/** GET /api/correduria/tarificador/integraciones — compañía+ramo que el bot puede tarificar hoy (solo lectura). */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await leerIntegracionesTarificador()
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
