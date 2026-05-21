export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { invalidarCache } from '@/lib/brain-cache'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase.from('productos')
    .select('*, producto_formatos(id, nombre, precio, orden, activo)')
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
      model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text',
        text: `Eres un experto en hostelería española analizando cartas de bar/restaurante.

PATRÓN MUY COMÚN EN CARTAS ESPAÑOLAS — LEE CON ATENCIÓN:
Las cartas suelen tener una fila de encabezados de precio UNA SOLA VEZ arriba de cada sección, y luego cada producto solo tiene los números en columnas alineadas. Ejemplos reales:

Ejemplo 1 (3 columnas):
         TAPA    MEDIA   RACIÓN
Jamón    4,50    8,00    14,00
Queso    3,50    6,50    11,00

Ejemplo 2 (2 columnas):
         TAPA    PLATO
Gambas   5,50    12,00
Croquetas 2,50   9,00

Ejemplo 3 (solo números, header implícito):
TAPAS Y RACIONES      T      R
Patatas bravas       3,50   8,50

Tu trabajo: detectar qué columna corresponde a qué formato mirando el encabezado de la sección, y asignarlo a cada producto.

Variantes de nombres de formato que debes reconocer:
- Tapa / T / Tpa → "Tapa"
- Media / M / 1/2 / Med → "Media ración"
- Ración / R / Racion / Plato / Plt / P → "Ración"
- Copa / C → "Copa"  |  Botella / Bot / B → "Botella"  |  Media botella / 1/2 Bot → "Media botella"
- Pequeño / Pqño / S → "Pequeño"  |  Grande / G / L → "Grande"

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
- Si el producto tiene UN SOLO precio: "precio": número, "formatos": []
- Si tiene VARIOS precios en columnas: "precio": null, "formatos": array con los formatos del encabezado
- Si un formato no tiene precio para ese producto (—, -, vacío): omítelo del array de formatos
- categoria: infiere de la sección visible (Tapas, Raciones, Carnes, Pescados, Postres, Bebidas, Vinos, Cervezas, Bocadillos, Entrantes, Ensaladas, Arroces, etc.)
- alergenos EU cuando sean visibles: ["Gluten","Crustáceos","Huevo","Pescado","Cacahuetes","Soja","Lácteos","Frutos de cáscara","Apio","Mostaza","Sésamo","Dióxido de azufre","Altramuces","Moluscos"]. [] si no aparecen.
- Incluye ABSOLUTAMENTE TODOS los productos visibles
- Si hay varias páginas, combina en un único array sin duplicados
- No inventes productos que no estén en la carta`,
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
