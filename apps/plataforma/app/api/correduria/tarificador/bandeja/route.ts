import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerBandejaTarificador } from '@/lib/tarificador-asegura'
import { paginacionBandeja } from '@/lib/tarificador-bandeja'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/tarificador/bandeja[?limite=50&desde=0] — «Necesita tu atención»: trabajos del bot parados
 * (requiere humano / error definitivo), leídos del puerto de operador de asegura. Solo lectura.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = new URL(req.url).searchParams
  const { limite, desde } = paginacionBandeja(q.get('limite'), q.get('desde'))
  const r = await leerBandejaTarificador(limite, desde)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
