import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { invalidarCache } from '@/lib/brain-cache'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase.from('productos').select('*')
    .eq('restaurante_id', rid)
    .order('categoria').order('orden').order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ productos: data })
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.get('action') === 'extract') return handleExtract(req)
  if (url.searchParams.get('action') === 'bulk') return POST_BULK(req)
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { nombre, descripcion, precio, categoria, activo, orden, familia, nombre_alternativo, metadata } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  const { data, error } = await supabase.from('productos')
    .insert({ nombre: nombre.trim(), descripcion, precio: precio ?? null,
      categoria: categoria || 'Sin categoría', activo: activo ?? true, orden: orden ?? 0,
      familia: familia ?? null,
      nombre_alternativo: Array.isArray(nombre_alternativo) ? nombre_alternativo : [],
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      restaurante_id: rid })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ producto: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { data, error } = await supabase.from('productos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).eq('restaurante_id', rid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidarCache(rid)
  if (updates.activo === false && data) {
    const { data: turno } = await supabase.from('turnos').select('id')
      .eq('estado', 'activo').eq('restaurante_id', rid).order('created_at', { ascending: false }).limit(1).single()
    if (turno) await supabase.from('productos_86')
      .insert({ nombre: data.nombre, turno_id: turno.id, restaurante_id: rid })
  }
  return NextResponse.json({ producto: data })
}

// POST ?action=bulk — inserción masiva desde onboarding (incluye alérgenos)
export async function POST_BULK(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { productos } = await req.json()
  if (!Array.isArray(productos) || productos.length === 0)
    return NextResponse.json({ error: 'Sin productos' }, { status: 400 })
  const rows = productos.map((p: Record<string, unknown>, i: number) => ({
    nombre: p.nombre, descripcion: p.descripcion || null,
    precio: p.precio ?? null, categoria: p.categoria || 'Sin categoría',
    alergenos: Array.isArray(p.alergenos) ? p.alergenos : [],
    activo: true, orden: i, restaurante_id: rid,
  }))
  const { data, error } = await supabase.from('productos').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ productos: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const url = new URL(req.url)
  // Mantener bulk por retrocompatibilidad (ahora lo usa POST pero algunos clientes viejos pueden llamar a DELETE)
  if (url.searchParams.get('action') === 'bulk') {
    return POST_BULK(req)
  }
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { error } = await supabase.from('productos').delete().eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function handleExtract(req: NextRequest) {
  try {
    const { images } = await req.json()
    if (!images?.length) return NextResponse.json({ error: 'Sin imágenes' }, { status: 400 })
    if (images.length > 10) return NextResponse.json({ error: 'Máximo 10 páginas' }, { status: 400 })
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    // Normalize media types — some browsers send 'image/jpg' which Anthropic rejects
    const VALID_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
    type ValidType = typeof VALID_TYPES[number]
    const normalizeType = (t: string): ValidType => {
      if (t === 'image/jpg') return 'image/jpeg'
      if (VALID_TYPES.includes(t as ValidType)) return t as ValidType
      return 'image/jpeg'
    }
    const imageBlocks = images.map((img: { data: string; mediaType: string }) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: normalizeType(img.mediaType), data: img.data },
    }))
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text',
        text: `Eres un asistente de restauración española. Extrae TODOS los platos, tapas, bebidas y postres de esta carta.\n\nDevuelve SOLO un JSON válido con esta estructura exacta, sin texto adicional ni markdown:\n{"productos":[{"nombre":"Nombre tal como aparece","descripcion":"Descripción o null","precio":9.50,"categoria":"Entrantes"}]}\n\nReglas:\n- precio: número decimal o null si no aparece\n- categoria: infiere de la sección (Entrantes, Principales, Postres, Bebidas, Tapas, Bocadillos, Pizzas, Ensaladas, Carnes, Pescados, etc.)\n- Incluye TODOS los productos visibles\n- Si hay varias páginas, combina todo en un único array`,
      }] }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return NextResponse.json({ productos: parsed.productos || [] })
    } catch { return NextResponse.json({ error: 'Error al parsear respuesta IA', raw }, { status: 500 }) }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: unknown }
    console.error('[carta/extract] Anthropic error:', e.status, e.message, JSON.stringify(e.error))
    const msg = e.message || 'Error al extraer la carta'
    return NextResponse.json({ error: msg, status: e.status }, { status: 500 })
  }
}
