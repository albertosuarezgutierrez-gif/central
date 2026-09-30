import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { buscarAsegura } from '@/lib/correduria-puerto'
import { buscarReferenciaAsegura } from '@/lib/referencia-presupuesto-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/buscar?q=… — el buscador de TODO. Read-only.
// Si lo tecleado tiene forma de REFERENCIA de presupuesto (AS-26-0042, 30/09/2026), además se pide
// ese presupuesto a asegura y viaja aparte, en `presupuestoRef`: el contrato de `bloques` no cambia.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  const [busqueda, presupuestoRef] = await Promise.all([buscarAsegura(q), buscarReferenciaAsegura(q)])
  return NextResponse.json(presupuestoRef.estado === 'no_aplica' ? busqueda : { ...busqueda, presupuestoRef })
}
