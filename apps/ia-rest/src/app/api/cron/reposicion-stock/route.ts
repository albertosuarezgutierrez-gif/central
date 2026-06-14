// /api/cron/reposicion-stock — Aviso diario de materiales bajo mínimo.
// Lee `materiales` (Supabase propia de ia-rest), filtra stock_disponible < stock_minimo
// y manda un aviso por Telegram (tgAlert) para reponer. Auth: Bearer CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { formatAvisoStock, type MaterialBajo } from '@/lib/reposicion-stock'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createServerClient()
  const { data, error } = await sb
    .from('materiales')
    .select('nombre, cantidad_disponible, stock_minimo, proveedor_nombre, coste_reposicion')
    .eq('activo', true)
    .not('stock_minimo', 'is', null)

  // Si la columna stock_minimo aún no está desplegada, degrada sin romper (no spamea 500).
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

  const bajos: MaterialBajo[] = (data ?? [])
    .filter(m => typeof m.stock_minimo === 'number' && m.stock_minimo > 0 && m.cantidad_disponible < m.stock_minimo)
    .map(m => ({
      nombre: m.nombre,
      cantidad_disponible: m.cantidad_disponible,
      stock_minimo: m.stock_minimo as number,
      proveedor_nombre: m.proveedor_nombre,
      coste_reposicion: m.coste_reposicion,
    }))
  if (bajos.length === 0) return NextResponse.json({ ok: true, bajos: 0 })

  await tgAlert(formatAvisoStock(bajos), 'aviso')
  return NextResponse.json({ ok: true, bajos: bajos.length })
}
