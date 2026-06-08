import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/[id]/stock-check — simulador stock pre-evento
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  // RPC stock disponible para el evento
  const { data: stock, error } = await supabase.rpc('stock_disponible_para_evento', {
    p_evento_id: id,
    p_restaurante_id: restauranteId
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcular transferencias necesarias
  const insuficientes = (stock || []).filter((s: { suficiente: boolean }) => !s.suficiente)
  const ok = (stock || []).filter((s: { suficiente: boolean }) => s.suficiente)

  return NextResponse.json({
    stock,
    resumen: {
      total: stock?.length || 0,
      ok: ok.length,
      insuficientes: insuficientes.length,
      bloqueante: insuficientes.length > 0
    },
    transferencias_necesarias: insuficientes.map((s: {
      producto_id: string; nombre: string; stock_necesario: number; stock_disponible: number
    }) => ({
      producto_id: s.producto_id,
      nombre: s.nombre,
      cantidad_necesaria: Math.ceil(s.stock_necesario - s.stock_disponible),
      accion: s.stock_disponible === 0 ? 'pedir_proveedor' : 'transferir_almacen'
    }))
  })
}
