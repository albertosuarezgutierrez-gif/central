import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/owner/carta/analisis?dias=30
 *
 * Análisis BCG de la carta:
 * - estrella:     alto volumen + alto margen   → vender más
 * - vaca:         alto volumen + bajo margen   → mantener
 * - interrogante: bajo volumen + alto margen   → empujar
 * - perro:        bajo volumen + bajo margen   → revisar/retirar
 *
 * Umbrales adaptativos: mediana de ventas y mediana de margen del restaurante
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const url = new URL(req.url)
  const dias = Math.min(Number(url.searchParams.get('dias') ?? 30), 90)

  const { data, error } = await supabase.rpc('analisis_carta', {
    p_restaurante_id: rid,
    p_dias: dias,
  })

  if (error) {
    // Si la RPC no existe aún, usar query directa
    return analisisDirecto(supabase, rid, dias)
  }

  return NextResponse.json({ ok: true, productos: data ?? [], dias })
}

async function analisisDirecto(
  supabase: ReturnType<typeof createServerClient>,
  rid: string,
  dias: number
) {
  // 1. Ventas del período
  const { data: ventas } = await supabase
    .from('comanda_items')
    .select('producto_id, cantidad, precio_unitario, comandas!inner(created_at, estado)')
    .eq('restaurante_id', rid)
    .in('comandas.estado', ['cerrada', 'en_cocina', 'en_curso'])
    .gte('comandas.created_at', new Date(Date.now() - dias * 86400000).toISOString())

  // Agrupar ventas por producto
  const ventasMap: Record<string, { unidades: number; ingresos: number; ultima: string }> = {}
  for (const v of ventas ?? []) {
    if (!v.producto_id) continue
    const cmd = (Array.isArray(v.comandas) ? v.comandas[0] : v.comandas) as { created_at: string } | null
    if (!ventasMap[v.producto_id]) {
      ventasMap[v.producto_id] = { unidades: 0, ingresos: 0, ultima: '' }
    }
    ventasMap[v.producto_id].unidades += Number(v.cantidad)
    ventasMap[v.producto_id].ingresos += Number(v.cantidad) * Number(v.precio_unitario ?? 0)
    if (cmd?.created_at && cmd.created_at > ventasMap[v.producto_id].ultima) {
      ventasMap[v.producto_id].ultima = cmd.created_at
    }
  }

  // 2. Productos activos
  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, precio, categoria, activo')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .eq('es_fuera_carta', false)

  // 3. Escandallos (margen)
  const { data: escandallos } = await supabase
    .from('v_escandallos')
    .select('producto_id, margen_pct, margen_eur, coste_por_racion')
    .eq('restaurante_id', rid)
    .eq('activo', true)

  const escandalloMap: Record<string, { margen_pct: number; margen_eur: number }> = {}
  for (const e of escandallos ?? []) {
    if (e.producto_id) {
      escandalloMap[e.producto_id] = {
        margen_pct: Number(e.margen_pct ?? 0),
        margen_eur: Number(e.margen_eur ?? 0),
      }
    }
  }

  // 4. Calcular umbrales adaptativos (mediana de ventas)
  const todasUnidades = (productos ?? []).map(p => ventasMap[p.id]?.unidades ?? 0).sort((a, b) => a - b)
  const medianaVentas = todasUnidades[Math.floor(todasUnidades.length / 2)] ?? 5
  const umbralVentas = Math.max(medianaVentas, 3) // mínimo 3 para evitar umbral demasiado bajo

  // 5. Clasificar
  const resultado = (productos ?? []).map(p => {
    const v = ventasMap[p.id] ?? { unidades: 0, ingresos: 0, ultima: '' }
    const e = escandalloMap[p.id]
    const margen = e?.margen_pct ?? null
    const margenAlto = margen !== null ? margen >= 55 : null // null = sin datos

    let clasificacion: 'estrella' | 'vaca' | 'interrogante' | 'perro' | 'sin_datos'
    if (margenAlto === null) {
      clasificacion = v.unidades >= umbralVentas ? 'vaca' : 'perro'
    } else if (v.unidades >= umbralVentas && margenAlto) {
      clasificacion = 'estrella'
    } else if (v.unidades >= umbralVentas && !margenAlto) {
      clasificacion = 'vaca'
    } else if (v.unidades < umbralVentas && margenAlto) {
      clasificacion = 'interrogante'
    } else {
      clasificacion = 'perro'
    }

    return {
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio),
      categoria: p.categoria,
      unidades: v.unidades,
      ingresos: Math.round(v.ingresos * 100) / 100,
      margen_pct: margen,
      margen_eur: e?.margen_eur ?? null,
      ultima_venta: v.ultima || null,
      sin_ventas: v.unidades === 0,
      clasificacion,
    }
  }).sort((a, b) => b.ingresos - a.ingresos)

  // 6. Resumen
  const total = resultado.length
  const estrellas = resultado.filter(p => p.clasificacion === 'estrella').length
  const perros    = resultado.filter(p => p.clasificacion === 'perro').length
  const sinVentas = resultado.filter(p => p.sin_ventas).length
  const ingresoTotal = resultado.reduce((s, p) => s + p.ingresos, 0)

  return NextResponse.json({
    ok: true,
    dias,
    umbral_ventas: umbralVentas,
    resumen: { total, estrellas, perros, sin_ventas: sinVentas, ingreso_total: Math.round(ingresoTotal * 100) / 100 },
    productos: resultado,
  })
}
