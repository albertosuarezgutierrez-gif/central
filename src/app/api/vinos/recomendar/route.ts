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

  // Cargar carta de vinos del restaurante
  const { data: vinos } = await supabase
    .from('vinos_catalogo')
    .select('nombre, bodega, tipo, denominacion_origen, varietal, maridaje_texto, maridaje_tags, precio_copa, precio_botella')
    .eq('restaurante_id', rid)
    .order('nombre')
    .limit(40)

  // Cargar también vinos de productos (familia vino*)
  const { data: vinosProductos } = await supabase
    .from('productos')
    .select('nombre, precio, familia, descripcion')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .like('familia', 'vino%')
    .limit(20)

  const cartaVinos = [
    ...(vinos ?? []).map((v: Record<string, unknown>) =>
      `- ${v.nombre} | ${v.bodega} | ${v.tipo} | D.O. ${v.denominacion_origen} | ${v.varietal}${v.maridaje_texto ? ` | maridaje: ${v.maridaje_texto}` : ''}${v.precio_copa ? ` | copa ${v.precio_copa}€` : ''}${v.precio_botella ? ` | botella ${v.precio_botella}€` : ''}`
    ),
    ...(vinosProductos ?? []).map((p: Record<string, unknown>) =>
      `- ${p.nombre}${p.precio ? ` | ${p.precio}€` : ''}${p.descripcion ? ` | ${p.descripcion}` : ''}`
    ),
  ].join('\n')

  const system = cartaVinos.length > 0
    ? `Eres un sumiller experto. El restaurante tiene esta carta de vinos:\n${cartaVinos}\n\nResponde SOLO con una recomendación corta (máx 2 frases). Usa vinos de la carta con nombre, D.O. y precio. Si no hay vino perfecto, recomienda tipo/D.O. Sin introducciones.`
    : `Eres un sumiller experto. No hay carta de vinos configurada. Recomienda un tipo y D.O. española genérica para el plato. Máx 2 frases. Sin introducciones.`

  try {
    const respuesta = await callAI(system, [{ role: 'user', content: `Recomienda vino para: ${plato}` }], 120)
    // Truncar a 200 chars por si el LLM se extiende
    const texto = respuesta.trim().slice(0, 200)
    return NextResponse.json({ recomendacion: texto, tiene_carta: (vinos?.length ?? 0) > 0 })
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener recomendación' }, { status: 500 })
  }
}
