import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { invalidarCache } from '@/lib/brain-cache'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

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

// POST ?action=bulk — inserción masiva desde onboarding (incluye alérgenos y formatos)
export async function POST_BULK(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { productos } = await req.json()
  if (!Array.isArray(productos) || productos.length === 0)
    return NextResponse.json({ error: 'Sin productos' }, { status: 400 })

  type ProdInput = {
    nombre: unknown; descripcion?: unknown; precio?: unknown
    categoria?: unknown; alergenos?: unknown
    formatos?: { nombre: string; precio: number }[]
  }

  const rows = (productos as ProdInput[]).map((p, i) => ({
    nombre: p.nombre, descripcion: p.descripcion || null,
    // Si hay formatos, precio base = ración (último formato) o null
    precio: Array.isArray(p.formatos) && p.formatos.length > 0
      ? (p.formatos[p.formatos.length - 1].precio ?? null)
      : (p.precio ?? null),
    categoria: p.categoria || 'Sin categoría',
    alergenos: Array.isArray(p.alergenos) ? p.alergenos : [],
    activo: true, orden: i, restaurante_id: rid,
  }))

  const { data, error } = await supabase.from('productos').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Crear producto_formatos para productos con múltiples precios
  const formatosToInsert: {
    producto_id: string; restaurante_id: string
    nombre: string; precio: number; orden: number; activo: boolean
  }[] = []

  for (let i = 0; i < (productos as ProdInput[]).length; i++) {
    const p = (productos as ProdInput[])[i]
    const inserted = data?.[i]
    if (!inserted || !Array.isArray(p.formatos) || p.formatos.length < 2) continue
    p.formatos.forEach((f, j) => {
      if (f.nombre && f.precio != null) {
        formatosToInsert.push({
          producto_id: inserted.id,
          restaurante_id: rid,
          nombre: f.nombre,
          precio: Number(f.precio),
          orden: j,
          activo: true,
        })
      }
    })
  }

  if (formatosToInsert.length > 0) {
    const { error: fmtErr } = await supabase.from('producto_formatos').insert(formatosToInsert)
    if (fmtErr) console.error('[POST_BULK] Error insertando formatos:', fmtErr.message)
  }

  invalidarCache(rid)
  return NextResponse.json({ productos: data, formatos_creados: formatosToInsert.length })
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
    const normalizeType = (t: string): string => {
      if (t === 'image/jpg') return 'image/jpeg'
      const VALID = ['image/jpeg','image/png','image/gif','image/webp']
      return VALID.includes(t) ? t : 'image/jpeg'
    }
    const imageInputs = images.map((img: { data: string; mediaType: string }) => ({
      data: img.data,
      mediaType: normalizeType(img.mediaType),
    }))
    const extractPrompt = `Eres un experto en hostelería española. Extrae TODOS los platos, tapas, bebidas y postres de esta carta de restaurante.

IMPORTANTE — FORMATOS DE PRECIO (muy común en cartas españolas):
Muchos productos aparecen con 2 o 3 precios en columnas: Tapa / Media / Ración, o T / M / R, o 1/2 / Entera.
En ese caso, usa el campo "formatos" con los precios de cada tamaño. Deja "precio" como null.

Devuelve SOLO un JSON válido sin texto adicional ni markdown:
{"productos":[{
  "nombre": "string",
  "descripcion": "string|null",
  "precio": null,
  "categoria": "string",
  "alergenos": ["string"],
  "formatos": [
    {"nombre": "Tapa", "precio": 4.50},
    {"nombre": "Media ración", "precio": 8.00},
    {"nombre": "Ración", "precio": 14.00}
  ]
}]}

Reglas:
- Si el producto tiene UN SOLO precio: pon el número en "precio" y "formatos": []
- Si el producto tiene VARIOS PRECIOS: pon "precio": null y rellena "formatos"
- categoria: infiere de la sección (Entrantes, Tapas, Principales, Carnes, Pescados, Mariscos, Postres, Bebidas, Vinos, Cervezas, Raciones, etc.)
- alergenos: exactamente: ["Gluten","Crustáceos","Huevo","Pescado","Cacahuetes","Soja","Lácteos","Frutos de cáscara","Apio","Mostaza","Sésamo","Dióxido de azufre","Altramuces","Moluscos"]. Array vacío [] si no hay.
- Incluye ABSOLUTAMENTE TODOS los productos visibles en todas las páginas`
    const raw = await callAIVision('Extrae productos de carta de restaurante. Responde SOLO con JSON.', imageInputs, extractPrompt, 6000)
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
