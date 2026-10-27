import { NextRequest, NextResponse } from 'next/server'
import { exigirTokenPublico } from '@/lib/sivra/facturas/acceso-publico'
import { buscarViasCatastro } from '@/lib/sivra/facturas/vias-catastro'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

// GET /api/publico/factura/<token>/vias?provincia=&municipio=&q= → { vias } (autocompletado de calle del Catastro).
// Mismo contrato que /api/correduria/catastro/vias, pero abierto SOLO con un token de factura válido y con rate limit.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const g = await exigirTokenPublico(req, token, 'vias', 60, 10 * 60_000)
  if (!g.ok) return g.respuesta
  const p = req.nextUrl.searchParams
  const r = await buscarViasCatastro(p.get('provincia') ?? '', p.get('municipio') ?? '', p.get('q') ?? '')
  return NextResponse.json({ vias: r.vias, ...(r.error ? { error: r.error } : {}) }, { status: r.status })
}
