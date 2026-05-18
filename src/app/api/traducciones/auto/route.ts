// app/api/traducciones/auto/route.ts
// POST { producto_id, nombre, descripcion? }
// → Claude traduce a EN/FR/DE/IT/PT y guarda en producto_traducciones
// v1

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

export const runtime = 'nodejs'
export const maxDuration = 30

const IDIOMAS = ['en', 'fr', 'de', 'it', 'pt'] as const

export async function POST(req: NextRequest) {
  try {
    const rid = getRestauranteId(req)
    const { producto_id, nombre, descripcion } = await req.json()

    if (!producto_id || !nombre?.trim()) {
      return NextResponse.json(
        { error: 'producto_id y nombre son obligatorios' },
        { status: 400 }
      )
    }

    const prompt = `Eres un experto en hostelería y traducción gastronómica.
Traduce el siguiente producto de carta de restaurante español a los idiomas indicados.
Responde SOLO con JSON válido, sin markdown ni texto extra.

Producto:
- Nombre: ${nombre.trim()}
${descripcion?.trim() ? `- Descripción: ${descripcion.trim()}` : ''}

Devuelve exactamente este formato JSON:
{
  "en": { "nombre": "...", "descripcion": "..." },
  "fr": { "nombre": "...", "descripcion": "..." },
  "de": { "nombre": "...", "descripcion": "..." },
  "it": { "nombre": "...", "descripcion": "..." },
  "pt": { "nombre": "...", "descripcion": "..." }
}

Reglas:
- Si no hay descripción original, deja "descripcion" como cadena vacía ""
- Usa terminología gastronómica auténtica de cada idioma
- Mantén nombres propios y técnicos (ej: gazpacho, jamón ibérico, pulpo a la gallega)
- Sé conciso y natural, como aparecería en una carta real`

    const raw = await callAI('Eres experto en hostelería y traducción gastronómica. Responde SOLO con JSON válido.', prompt, 800)
    let traducciones: Record<string, { nombre: string; descripcion: string }>

    try {
      traducciones = JSON.parse(cleanJSON(raw))
    } catch {
      return NextResponse.json(
        { error: 'Claude devolvió respuesta no parseable', raw },
        { status: 502 }
      )
    }

    // Guardar en BD
    const supabase = createServerClient()
    const rows = IDIOMAS
      .filter(lang => traducciones[lang]?.nombre?.trim())
      .map(lang => ({
        producto_id,
        restaurante_id: rid,
        idioma: lang,
        nombre: traducciones[lang].nombre.trim(),
        descripcion: traducciones[lang].descripcion?.trim() || null,
        updated_at: new Date().toISOString(),
      }))

    const { error } = await supabase
      .from('producto_traducciones')
      .upsert(rows, { onConflict: 'producto_id,idioma' })

    if (error) throw error

    return NextResponse.json({ ok: true, traducciones })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
