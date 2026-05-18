import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const { producto_id } = await req.json()
  if (!producto_id) return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data: prod, error } = await supabase
    .from('productos').select('nombre, precio, categoria, alergenos')
    .eq('id', producto_id).eq('restaurante_id', restauranteId).single()

  if (error || !prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const alergenos = (prod.alergenos?.length)
    ? `Contiene: ${prod.alergenos.join(', ')}.`
    : 'Sin alérgenos declarados.'

  const descripcion = await callAI(
    'Eres copywriter de hostelería española. Escribe descripciones atractivas y breves para cartas digitales. Solo la descripción, sin comillas ni explicaciones.',
    `Escribe una descripción de máximo 2 frases (30 palabras) para: "${prod.nombre}". Categoría: ${prod.categoria ?? 'plato'}. Precio: ${prod.precio}€. ${alergenos} Tono: cálido, apetitoso.`
  )
  if (!descripcion) return NextResponse.json({ error: 'NIM sin respuesta' }, { status: 500 })

  await supabase.from('productos').update({
    descripcion_storefront: descripcion.trim(),
    descripcion_nim_at: new Date().toISOString(),
  }).eq('id', producto_id).eq('restaurante_id', restauranteId)

  return NextResponse.json({ ok: true, descripcion: descripcion.trim() })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const { producto_id } = await req.json()
  if (!producto_id) return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })

  const supabase = createServerClient()
  await supabase.from('productos')
    .update({ descripcion_storefront: null, descripcion_nim_at: null })
    .eq('id', producto_id).eq('restaurante_id', restauranteId)

  return NextResponse.json({ ok: true })
}
