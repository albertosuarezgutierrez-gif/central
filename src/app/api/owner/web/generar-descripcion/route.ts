import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nombre, direccion, ciudad, tipo_cocina')
    .eq('id', restauranteId)
    .single()

  if (!rest) return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })

  const { data: productos } = await supabase
    .from('productos')
    .select('nombre')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .limit(12)

  const productosCtx = productos?.map(p => p.nombre).join(', ') ?? ''

  const prompt = `Genera dos textos cortos para la web de este restaurante:

Restaurante: ${rest.nombre}
Dirección: ${rest.direccion ?? ''}, ${rest.ciudad ?? ''}
Tipo de cocina: ${rest.tipo_cocina ?? 'española'}
Algunos platos: ${productosCtx}

Responde SOLO con JSON válido, sin texto extra ni bloques de código:
{
  "descripcion_local": "Texto de 2-3 frases sobre el restaurante, cálido y auténtico. Sin clichés genéricos.",
  "descripcion_barrio": "Texto de 1-2 frases situando el restaurante en su barrio o zona."
}`

  try {
    const resultado = await callAI('Eres un copywriter especializado en hostelería española.', prompt, 400)
    const json = JSON.parse(resultado.replace(/```json|```/g, '').trim())
    return NextResponse.json({ ok: true, ...json })
  } catch {
    return NextResponse.json({ error: 'Error generando descripción' }, { status: 500 })
  }
}
