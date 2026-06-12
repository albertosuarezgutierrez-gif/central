export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const restauranteId = getRestauranteId(req)
  const { pregunta, historial } = await req.json()
  if (!pregunta?.trim()) return NextResponse.json({ error: 'pregunta requerida' }, { status: 400 })

  const supabase = createServerClient()

  const [
    { data: stockCritico },
    { data: stockTotal },
    { data: pedidosPendientes },
    { data: restaurante },
  ] = await Promise.all([
    supabase.from('stock_articulos')
      .select('nombre, stock_actual, stock_minimo, unidad_medida, proveedor_preferente_id')
      .eq('restaurante_id', restauranteId)
      .order('stock_actual', { ascending: true })
      .limit(50),
    supabase.from('stock_articulos')
      .select('id', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId),
    supabase.from('pedidos_proveedor')
      .select('id, estado, total_estimado, created_at, proveedor:proveedores(nombre)')
      .eq('restaurante_id', restauranteId)
      .in('estado', ['pendiente', 'enviado'])
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('restaurantes')
      .select('nombre')
      .eq('id', restauranteId)
      .single(),
  ])

  const criticos = (stockCritico ?? [])
    .filter(a => a.stock_actual != null && a.stock_minimo != null && a.stock_actual <= a.stock_minimo)
    .slice(0, 20)
    .map(a => `${a.nombre}: ${a.stock_actual}${a.unidad_medida ?? ''} (mín: ${a.stock_minimo})`)

  const pedidosStr = (pedidosPendientes ?? []).map(p =>
    `Pedido ${p.estado} — ${(p.proveedor as any)?.nombre ?? 'Proveedor'} · ${p.total_estimado ? p.total_estimado + '€' : 'importe n/d'}`
  )

  const system = `Eres el asistente de compras y almacén de "${restaurante?.nombre ?? 'el restaurante'}".

DATOS DE STOCK (en tiempo real):
- Artículos totales en inventario: ${(stockTotal as any) ?? '?'}
- Artículos BAJO MÍNIMO (${criticos.length}): ${criticos.length > 0 ? '\n  ' + criticos.join('\n  ') : 'ninguno — todo en orden ✅'}
- Pedidos en curso: ${pedidosStr.length > 0 ? '\n  ' + pedidosStr.join('\n  ') : 'ninguno'}

FUNCIONES DEL MÓDULO:
- Crear pedido: Almacén → Pedidos → Nuevo pedido.
- Recepción de mercancía: Almacén → Recepciones → Registrar.
- OCR de albarán: botón cámara al registrar recepción.
- Escandallos: coste real de cada plato según consumo.

Responde en español, tono directo y práctico. Máximo 3-4 frases. No inventes cifras.`

  const msgs: { role: 'user' | 'assistant'; content: string }[] = [
    ...((historial ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-6),
    { role: 'user', content: pregunta },
  ]

  const respuesta = await callAI(system, msgs, 350)
  return NextResponse.json({ respuesta: respuesta?.trim() ?? 'Sin respuesta disponible.' })
}
