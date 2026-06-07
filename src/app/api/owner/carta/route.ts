export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { invalidarCache } from '@/lib/brain-cache'
import { callAIVision, cleanJSON } from '@/lib/ai-client'
import { generarAliasFoneticos } from '@/lib/fuzzy-comanda'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase.from('productos')
    .select('*, producto_formatos(id, nombre, precio, orden, activo)')
    .eq('local_id', rid)
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
  const aliases: string[] = Array.isArray(nombre_alternativo) ? nombre_alternativo : []
  const { data, error } = await supabase.from('productos')
    .insert({ nombre: nombre.trim(), descripcion, precio: precio ?? null,
      categoria: categoria || 'Sin categoría', activo: activo ?? true, orden: orden ?? 0,
      familia: familia ?? null,
      nombre_alternativo: aliases,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      restaurante_id: rid })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Generar alias IA en background si el owner no los escribió manualmente
  if (aliases.length === 0 && data?.id) {
    generarAliasFoneticos(nombre.trim()).then(async (generados) => {
      if (!generados.length) return
      await supabase.from('productos').update({ alias_ia: generados }).eq('id', data.id).eq('local_id', rid)
      invalidarCache(rid)
      console.log(`[ALIAS-IA] ${nombre}: ${generados.join(', ')}`)
    }).catch(() => {})
  }
  return NextResponse.json({ producto: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { data, error } = await supabase.from('productos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).eq('local_id', rid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  invalidarCache(rid)
  // Si se cambió nombre y alias vacíos → regenerar alias IA en alias_ia
  if (updates.nombre && data?.id && (!updates.nombre_alternativo || (updates.nombre_alternativo as string[]).length === 0)) {
    generarAliasFoneticos(updates.nombre.trim()).then(async (generados) => {
      if (!generados.length) return
      await supabase.from('productos').update({ alias_ia: generados }).eq('id', data.id).eq('local_id', rid)
      invalidarCache(rid)
      console.log(`[ALIAS-IA] ${updates.nombre} (edit): ${generados.join(', ')}`)
    }).catch(() => {})
  }
  if (updates.activo === false && data) {
    const { data: turno } = await supabase.from('turnos').select('id')
      .eq('estado', 'activo').eq('local_id', rid).order('created_at', { ascending: false }).limit(1).single()
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
  const { error } = await supabase.from('productos').delete().eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function handleExtract(req: NextRequest) {
  // SELECCIÓN DE MODELO: callAIVision() — NIM visión → Haiku fallback
  // Tarea: OCR estructurado de cartas de restaurante (imágenes)
  // noFallback=false: si NIM visión falla, Haiku hace el OCR con igual calidad
  try {
    const { images } = await req.json()
    if (!images?.length) return NextResponse.json({ error: 'Sin imágenes' }, { status: 400 })
    if (images.length > 10) return NextResponse.json({ error: 'Máximo 10 páginas' }, { status: 400 })

    const system = `Eres un experto en hostelería española analizando cartas de bar/restaurante.
Devuelve SOLO JSON válido sin texto adicional ni markdown.`

    const userText = `PATRÓN MUY COMÚN EN CARTAS ESPAÑOLAS — LEE CON ATENCIÓN:
Las cartas suelen tener una fila de encabezados de precio UNA SOLA VEZ arriba de cada sección, y luego cada producto solo tiene los números en columnas alineadas. Ejemplos reales:

Ejemplo 1 (3 columnas):
         TAPA    MEDIA   RACIÓN
Jamón    4,50    8,00    14,00

Ejemplo 2 (2 columnas):
         TAPA    PLATO
Gambas   5,50    12,00

Ejemplo 3 (solo números, header implícito):
TAPAS Y RACIONES      T      R
Patatas bravas       3,50   8,50

Tu trabajo: detectar qué columna corresponde a qué formato mirando el encabezado de la sección.

Variantes de nombres de formato:
- Tapa / T / Tpa → "Tapa"
- Media / M / 1/2 / Med → "Media ración"
- Ración / R / Racion / Plato / Plt / P → "Ración"
- Copa / C → "Copa" | Botella / Bot / B → "Botella"
- Pequeño / Pqño / S → "Pequeño" | Grande / G / L → "Grande"

Devuelve SOLO este JSON:
{"productos":[{"nombre":"string","descripcion":"string|null","precio":null,"categoria":"string","alergenos":["string"],"formatos":[{"nombre":"Tapa","precio":4.50}]}]}

Reglas:
- UN precio → "precio": número, "formatos": []
- VARIOS precios → "precio": null, "formatos": array con los formatos del encabezado
- Formato sin precio (—, -, vacío): omitir del array
- categoria: Tapas/Raciones/Carnes/Pescados/Postres/Bebidas/Vinos/Cervezas/Bocadillos/Entrantes/Ensaladas/Arroces
- alergenos EU visibles: Gluten/Crustáceos/Huevo/Pescado/Cacahuetes/Soja/Lácteos/Frutos de cáscara/Apio/Mostaza/Sésamo/Dióxido de azufre/Altramuces/Moluscos. [] si no aparecen.
- TODOS los productos visibles. Varias páginas: un único array sin duplicados.`

    const raw = await callAIVision(system, images, userText, 6000, 45_000, false)
    try {
      const parsed = JSON.parse(cleanJSON(raw))
      return NextResponse.json({ productos: parsed.productos || [] })
    } catch {
      return NextResponse.json({ error: 'Error al parsear respuesta IA', raw }, { status: 500 })
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    console.error('[carta/extract] error:', e.status, e.message)
    return NextResponse.json({ error: e.message || 'Error al extraer la carta' }, { status: 500 })
  }
}
