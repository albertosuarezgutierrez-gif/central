export const dynamic = 'force-dynamic'

// v1 — Sugerir ingredientes de escandallo con IA (NIM → Haiku fallback)
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { logTraining } from '@/lib/training-log'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const body = await req.json().catch(() => ({}))
  const nombre: string = (body.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const supabase = createServerClient()

  // Traer artículos del almacén del restaurante
  const { data: articulos } = await supabase
    .from('almacen_articulos')
    .select('id, nombre, unidad_compra')
    .eq('restaurante_id', restauranteId)
    .order('nombre')

  if (!articulos?.length) {
    return NextResponse.json({ error: 'sin_articulos' })
  }

  const listaArticulos = articulos
    .map(a => `- ${a.nombre} (unidad: ${a.unidad_compra ?? 'ud'})`)
    .join('\n')

  const system = `Eres un chef profesional español experto en escandallos de cocina hostelera.
Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin backticks, sin explicaciones.`

  const user = `El restaurante tiene estos artículos en su almacén:
${listaArticulos}

Crea el escandallo para el plato: "${nombre}"

Devuelve este JSON exacto:
{
  "ingredientes": [
    { "articulo_nombre": "nombre exacto del artículo del almacén", "cantidad": número }
  ],
  "raciones": número,
  "advertencia": "texto si falta algún ingrediente esencial, o null"
}

Reglas:
- Usa ÚNICAMENTE artículos que aparezcan exactamente en la lista del almacén
- Las cantidades en la misma unidad que ya tiene el artículo (para hostelería, no cocina doméstica)
- Raciones típicas para un servicio de restaurante
- Si el nombre incluye varios platos separados por · , haz el escandallo del primero`

  let raw = ''
  try {
    raw = await callAI(system, user, 800)
  } catch (e) {
    console.error('[sugerir-escandallo] IA no disponible:', e)
    return NextResponse.json({ error: 'ia_no_disponible' }, { status: 503 })
  }

  let data: { ingredientes: { articulo_nombre: string; cantidad: number }[]; raciones: number; advertencia: string | null }
  try {
    data = JSON.parse(cleanJSON(raw))
  } catch {
    console.error('[sugerir-escandallo] parse error, raw:', raw.substring(0, 200))
    return NextResponse.json({ error: 'parse_error' }, { status: 500 })
  }

  // Enriquecer con IDs reales — match insensible a mayúsculas
  const ingredientesConId = (data.ingredientes ?? []).map(ing => {
    const articulo = articulos.find(
      a => a.nombre.toLowerCase().trim() === ing.articulo_nombre?.toLowerCase().trim()
    )
    return {
      articulo_id:     articulo?.id ?? null,
      articulo_nombre: ing.articulo_nombre,
      cantidad:        ing.cantidad,
    }
  })

  // Log training (calidad 3 — nim_analitico)
  const resueltos = ingredientesConId.filter(i => i.articulo_id).length
  if (resueltos > 0) {
    await logTraining({
      local_id:  restauranteId,
      input_raw:       `Sugerir escandallo: ${nombre}`,
      input_context:   { modulo: 'escandallos_sugerir', articulos_disponibles: articulos.length },
      output_brain:    { ingredientes: ingredientesConId, raciones: data.raciones },
      fuente:          'nim_analitico',
      calidad:         3,
      confianza:       resueltos / (ingredientesConId.length || 1),
      modelo_usado:    'nvidia/llama-3.3-70b',
    }).catch(() => { /* no bloquear si falla el log */ })
  }

  return NextResponse.json({
    ingredientes: ingredientesConId,
    raciones:     data.raciones ?? 1,
    advertencia:  data.advertencia ?? null,
  })
}
