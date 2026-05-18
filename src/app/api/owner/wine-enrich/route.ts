import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

// Tags canónicos de maridaje que usamos en todo el sistema
export const MARIDAJE_TAGS = [
  'carne_roja',
  'carne_blanca',
  'pescado',
  'marisco',
  'pasta',
  'arroz',
  'queso',
  'verduras',
  'postre',
  'aperitivo',
  'cualquier_plato',
] as const

export type MaridajeTag = typeof MARIDAJE_TAGS[number]

/**
 * POST /api/owner/wine-enrich
 * Body: { nombre, bodega?, tipo?, do?, varietal?, añada? }
 *
 * Flujo:
 *   1. Busca en vinos_catalogo (caché global).
 *   2. Si existe → devuelve directo, suma +1 consulta.
 *   3. Si no → llama a Claude como sommelier → guarda en catálogo → devuelve.
 *
 * Coste: ~0,001€ solo la primera vez por cada vino único.
 */
export async function POST(req: NextRequest) {
  // Auth
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { nombre, bodega, tipo, do: doVino, varietal, añada } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const supabase = createServerClient()

  // ── 1. Buscar en caché global ────────────────────────────────────
  const nombreNorm = nombre.trim().toLowerCase()
  const bodegaNorm = (bodega ?? '').trim().toLowerCase()

  const { data: cached } = await supabase
    .from('vinos_catalogo')
    .select('*')
    .eq('nombre_norm', nombreNorm)
    .eq('bodega_norm', bodegaNorm)
    .maybeSingle()

  if (cached) {
    // Incrementar contador de consultas (no crítico, ignoramos error)
    await supabase
      .from('vinos_catalogo')
      .update({ consultas: (cached.consultas ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq('id', cached.id)

    return NextResponse.json({
      ok: true,
      fuente: 'cache',
      descripcion_cata: cached.descripcion_cata,
      maridaje_tags: cached.maridaje_tags ?? [],
      maridaje_texto: cached.maridaje_texto,
      temperatura_servicio: cached.temperatura_servicio,
    })
  }

  // ── 2. Llamar a Claude como sommelier ───────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const partes = [
    `Nombre: ${nombre.trim()}`,
    bodega   ? `Bodega: ${bodega.trim()}`   : null,
    tipo     ? `Tipo: ${tipo}`               : null,
    doVino   ? `D.O.: ${doVino}`             : null,
    varietal ? `Varietal: ${varietal}`       : null,
    añada    ? `Añada: ${añada}`             : null,
  ].filter(Boolean).join('\n')

  const prompt = `Eres sommelier experto en vinos españoles. Para este vino:
${partes}

Responde SOLO con JSON válido, sin markdown ni texto adicional:
{
  "descripcion_cata": "2 frases máximo. Primera frase: aromas principales. Segunda frase: sensación en boca y final.",
  "maridaje_tags": ["carne_roja"],
  "maridaje_texto": "Carnes rojas, caza mayor",
  "temperatura_servicio": "16-18°C"
}

Para maridaje_tags usa ÚNICAMENTE estos valores (uno o varios):
carne_roja, carne_blanca, pescado, marisco, pasta, arroz, queso, verduras, postre, aperitivo, cualquier_plato

Si el vino es muy versátil, añade "cualquier_plato".`

  let enriched: {
    descripcion_cata: string
    maridaje_tags: string[]
    maridaje_texto: string
    temperatura_servicio: string
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    enriched = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // Sanear tags: solo los canónicos
    enriched.maridaje_tags = (enriched.maridaje_tags ?? [])
      .filter((t: string) => (MARIDAJE_TAGS as readonly string[]).includes(t))

  } catch {
    return NextResponse.json({ error: 'Error IA al enriquecer vino' }, { status: 500 })
  }

  // ── 3. Guardar en catálogo global ───────────────────────────────
  const { data: saved } = await supabase
    .from('vinos_catalogo')
    .upsert({
      nombre:              nombre.trim(),
      bodega:              bodega?.trim() ?? null,
      tipo:                tipo ?? null,
      denominacion_origen: doVino ?? null,
      varietal:            varietal ?? null,
      descripcion_cata:    enriched.descripcion_cata,
      maridaje_tags:       enriched.maridaje_tags,
      maridaje_texto:      enriched.maridaje_texto,
      temperatura_servicio: enriched.temperatura_servicio,
      fuente:              'ia',
      consultas:           1,
      updated_at:          new Date().toISOString(),
    }, {
      onConflict: 'nombre_norm,bodega_norm',
      ignoreDuplicates: false,
    })
    .select('id')
    .single()

  return NextResponse.json({
    ok: true,
    fuente: 'ia',
    id_catalogo: saved?.id ?? null,
    descripcion_cata:    enriched.descripcion_cata,
    maridaje_tags:       enriched.maridaje_tags,
    maridaje_texto:      enriched.maridaje_texto,
    temperatura_servicio: enriched.temperatura_servicio,
  })
}
