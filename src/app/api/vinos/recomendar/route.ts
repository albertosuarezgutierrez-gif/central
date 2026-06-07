export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { plato } = await req.json()
  if (!plato?.trim()) return NextResponse.json({ error: 'Plato requerido' }, { status: 400 })

  // Leer configuración del restaurante
  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('configuracion, modulos_activos')
    .eq('id', rid)
    .single()

  const modulosActivos: string[] = restaurante?.modulos_activos ?? []
  if (!modulosActivos.includes('carta_vinos')) {
    return NextResponse.json({ recomendacion: 'Módulo carta_vinos no activo.', tiene_carta: false })
  }

  // Leer vinos desde productos (arquitectura unificada)
  const { data: vinos } = await supabase
    .from('productos')
    .select('nombre, precio, precio_copa, copas_por_botella, familia, metadata')
    .eq('local_id', rid)
    .eq('categoria', 'vino')
    .eq('activo', true)
    .order('nombre')
    .limit(60)

  const lineas = (vinos ?? []).map((v: Record<string, unknown>) => {
    const m = (v.metadata as Record<string, unknown>) ?? {}
    const stock = (m.stock_botellas as number) ?? 0
    if (stock === 0 && m.tipo_stock !== 'consignacion') return null
    const precios = [
      v.precio_copa ? `copa ${v.precio_copa}€` : null,
      v.precio ? `botella ${v.precio}€` : null,
    ].filter(Boolean).join(' / ')
    const aviso = stock > 0 && stock <= 2 ? ' [últimas unidades]' : ''
    return `- ${v.nombre} | ${m.bodega ?? ''} | ${m.tipo_vino ?? ''} | D.O. ${m.denominacion_origen ?? ''}` +
      (m.varietal ? ` | ${m.varietal}` : '') +
      (m.maridaje_texto ? ` | maridaje: ${m.maridaje_texto}` : '') +
      (precios ? ` | ${precios}` : '') + aviso
  }).filter(Boolean).join('\n')

  const system = lineas.length > 0
    ? `Eres un sumiller experto. El restaurante tiene esta carta de vinos:\n${lineas}\n\nResponde SOLO con una recomendación corta (2-3 frases). Usa vinos de la carta con nombre exacto, D.O. y precio. No recomiendes vinos agotados. Menciona si quedan últimas unidades. Sin introducciones.`
    : `Eres un sumiller experto. No hay carta de vinos. Recomienda tipo y D.O. española genérica. Máx 2 frases.`

  try {
    const respuesta = await callAI(system, [{ role: 'user', content: `Recomienda vino para: ${plato}` }], 150)
    return NextResponse.json({
      recomendacion: respuesta.trim().slice(0, 300),
      tiene_carta: lineas.length > 0,
      modo_vinos: restaurante?.configuracion?.modo_vinos ?? 'basico'
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener recomendación' }, { status: 500 })
  }
}
