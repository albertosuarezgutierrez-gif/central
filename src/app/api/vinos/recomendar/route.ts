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

  // Cargar restaurante para saber modo_vinos
  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('configuracion, modulos_activos')
    .eq('id', rid)
    .single()

  const modulosActivos: string[] = restaurante?.modulos_activos ?? []
  const modoVinos: string = restaurante?.configuracion?.modo_vinos ?? 'basico'

  // Si carta_vinos no está activo → respuesta genérica
  if (!modulosActivos.includes('carta_vinos')) {
    return NextResponse.json({
      recomendacion: 'El módulo de carta de vinos no está activo. Actívalo en /owner → Módulos.',
      tiene_carta: false
    })
  }

  let cartaVinos = ''

  if (modoVinos === 'carta') {
    // Modo carta: consultar vinos_catalogo con stock y disponibilidad
    const { data: vinos } = await supabase
      .from('vinos_catalogo')
      .select('nombre, bodega, tipo, denominacion_origen, varietal, maridaje_texto, maridaje_tags, precio_copa, precio_botella, stock_botellas, activo')
      .eq('restaurante_id', rid)
      .eq('activo', true)
      .order('nombre')
      .limit(60)

    cartaVinos = (vinos ?? []).map((v: Record<string, unknown>) => {
      const stock = (v.stock_botellas as number) ?? 0
      const disponibilidad = stock === 0 ? ' | AGOTADO' : stock <= 2 ? ' | últimas unidades' : ''
      return `- ${v.nombre} | ${v.bodega} | ${v.tipo} | D.O. ${v.denominacion_origen} | ${v.varietal}${v.maridaje_texto ? ` | maridaje: ${v.maridaje_texto}` : ''}${v.precio_copa ? ` | copa ${v.precio_copa}€` : ''}${v.precio_botella ? ` | botella ${v.precio_botella}€` : ''}${disponibilidad}`
    }).join('\n')

  } else {
    // Modo básico: vinos en productos con familia vino*
    const { data: vinosProductos } = await supabase
      .from('productos')
      .select('nombre, precio, precio_copa, familia, descripcion')
      .eq('restaurante_id', rid)
      .eq('activo', true)
      .like('familia', 'vino%')
      .limit(20)

    cartaVinos = (vinosProductos ?? []).map((p: Record<string, unknown>) =>
      `- ${p.nombre}${p.precio_copa ? ` | copa ${p.precio_copa}€` : p.precio ? ` | ${p.precio}€` : ''}${p.descripcion ? ` | ${p.descripcion}` : ''}`
    ).join('\n')
  }

  const system = cartaVinos.length > 0
    ? `Eres un sumiller experto. El restaurante tiene esta carta de vinos:\n${cartaVinos}\n\nResponde SOLO con una recomendación corta (máx 2-3 frases). Usa vinos de la carta con nombre exacto, D.O. y precio copa/botella. Si un vino está AGOTADO no lo recomiendes. Si hay pocas unidades, menciónalo. Sin introducciones.`
    : `Eres un sumiller experto. No hay carta de vinos configurada. Recomienda un tipo y D.O. española genérica para el plato. Máx 2 frases. Sin introducciones.`

  try {
    const respuesta = await callAI(system, [{ role: 'user', content: `Recomienda vino para: ${plato}` }], 150)
    return NextResponse.json({
      recomendacion: respuesta.trim().slice(0, 300),
      tiene_carta: cartaVinos.length > 0,
      modo_vinos: modoVinos
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener recomendación' }, { status: 500 })
  }
}
