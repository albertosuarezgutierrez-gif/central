export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { alertasVencimiento } from '@central/module-materiales'

// GET — alertas activas del restaurante:
//   - stock por debajo del mínimo
//   - garantía de unidad próxima a vencer
// Query: ?dias=30 (default 30)

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)
  const dias = Math.max(1, Number(url.searchParams.get('dias') ?? 30))

  const [{ data: matsRaw }, { data: unidadesRaw }] = await Promise.all([
    supabase
      .from('materiales')
      .select('id, nombre, categoria, tipo, estado, cantidad_total, cantidad_disponible, stock_minimo, precio_compra, coste_reposicion, activo')
      .eq('restaurante_id', rid).eq('activo', true),
    supabase
      .from('materiales_unidades')
      .select('id, material_id, codigo_qr, estado, garantia_hasta, activo')
      .eq('restaurante_id', rid).eq('activo', true),
  ])

  const mats = (matsRaw ?? []).map(r => ({
    id: r.id, negocioId: rid, nombre: r.nombre, categoria: r.categoria,
    tipo: (r.tipo ?? 'activo') as 'activo' | 'consumible',
    estado: (r.estado ?? 'operativo') as 'operativo' | 'deteriorado' | 'en_reparacion' | 'baja',
    cantidadTotal: r.cantidad_total ?? 0,
    cantidadDisponible: r.cantidad_disponible ?? 0,
    stockMinimo: r.stock_minimo ?? null,
    precioCompra: r.precio_compra ?? 0,
    costeReposicion: r.coste_reposicion ?? 0,
    activo: r.activo ?? true,
  }))

  const unidades = (unidadesRaw ?? []).map(r => ({
    id: r.id, negocioId: rid, materialId: r.material_id,
    codigoQr: r.codigo_qr,
    estado: (r.estado ?? 'operativo') as 'operativo' | 'deteriorado' | 'en_reparacion' | 'baja',
    garantiaHasta: r.garantia_hasta ?? null,
    activo: r.activo ?? true,
  }))

  const alertas = alertasVencimiento(mats, unidades, dias)

  return NextResponse.json({ alertas, total: alertas.length })
}
