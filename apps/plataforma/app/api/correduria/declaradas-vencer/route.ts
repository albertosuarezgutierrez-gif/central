import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { declaradasVencerAsegura } from '@/lib/cartera-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/declaradas-vencer?dias=60 — pólizas declaradas (de otra
// compañía) que vencen pronto, para llamar antes de que renueven solas.
// Puerto HTTP a central-asegura. Read-only.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : 60
  return NextResponse.json(await declaradasVencerAsegura(dias))
}
