import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .order('categoria', { ascending: true })
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ productos: data })
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  if (url.searchParams.get('action') === 'extract') return handleExtract(req)

  const supabase = createServerClient()
  const { nombre, descripcion, precio, categoria, activo, orden } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('productos')
    .insert({ nombre: nombre.trim(), descripcion, precio: precio ?? null, categoria: categoria || 'Sin categoría', activo: activo ?? true, orden: orden ?? 0 })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ producto: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('productos').update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si se marca como inactivo (86 manual), registrar en productos_86 para el turno activo
  if (updates.activo === false && data) {
    const { data: turno } = await supabase
      .from('turnos').select('id').eq('estado', 'activo').order('created_at', { ascending: false }).limit(1).single()
    if (turno) {
      await supabase.from('productos_86').insert({ nombre: data.nombre, turno_id: turno.id })
    }
  }

  return NextResponse.json({ producto: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const url = new URL(req.url)

  if (url.searchParams.get('action') === 'bulk') {
    const { productos } = await req.json()
    if (!Array.isArray(productos) || productos.length === 0)
      return NextResponse.json({ error: 'Sin productos' }, { status: 400 })
    const rows = productos.map((p: Record<string, unknown>, i: number) => ({
      nombre: p.nombre, descripcion: p.descripcion || null,
      precio: p.precio ?? null, categoria: p.categoria || 'Sin categoría',
      activo: true, orden: i,
    }))
    const { data, error } = await supabase.from('productos').insert(rows).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ productos: data })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function handleExtract(req: NextRequest) {
  const { images } = await req.json()
  if (!images?.length) return NextResponse.json({ error: 'Sin imágenes' }, { status: 400 })
  if (images.length > 10) return NextResponse.json({ error: 'Máximo 10 páginas' }, { status: 400 })

  const anthropic = new Anthropic()
  const imageBlocks = images.map((img: { data: string; mediaType: string }) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
  }))

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `Eres un asistente de restauración española. Extrae TODOS los platos, tapas, bebidas y postres de esta carta.

Devuelve SOLO un JSON válido con esta estructura exacta, sin texto adicional ni markdown:
{"productos":[{"nombre":"Nombre tal como aparece","descripcion":"Descripción o null","precio":9.50,"categoria":"Entrantes"}]}

Reglas:
- precio: número decimal o null si no aparece
- categoria: infiere de la sección (Entrantes, Principales, Postres, Bebidas, Tapas, Bocadillos, Pizzas, Ensaladas, Carnes, Pescados, etc.)
- Incluye TODOS los productos visibles
- Si hay varias páginas, combina todo en un único array`,
        },
      ],
    }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json({ productos: parsed.productos || [] })
  } catch {
    return NextResponse.json({ error: 'Error al parsear respuesta IA', raw }, { status: 500 })
  }
}
