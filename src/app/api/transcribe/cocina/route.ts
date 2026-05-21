export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { transcribir } from '@/lib/ear'

/**
 * POST /api/transcribe/cocina
 * FormData: audio (Blob)
 *
 * Igual que /api/transcribe pero con prompt Whisper específico
 * para el vocabulario del jefe de cocina — mejora el reconocimiento
 * de términos hosteleros y los patrones de consulta del asistente IA.
 */

// Cache del prompt de cocina por restaurante (5 min)
const cocinaPromptCache = new Map<string, { ts: number; prompt: string }>()
const TTL = 5 * 60_000

async function buildCocinaPrompt(rid: string, supabase: ReturnType<typeof createServerClient>): Promise<string> {
  const cached = cocinaPromptCache.get(rid)
  if (cached && Date.now() - cached.ts < TTL) return cached.prompt

  // Cargar productos de carta + elaboraciones activas + secciones
  const [{ data: productos }, { data: elaboraciones }, { data: secciones }] = await Promise.all([
    supabase.from('productos').select('nombre').eq('restaurante_id', rid).eq('activo', true).limit(50),
    supabase.from('elaboraciones_propias').select('nombre').eq('restaurante_id', rid).eq('estado', 'activa').limit(20),
    supabase.from('secciones_cocina').select('nombre').eq('restaurante_id', rid).eq('activa', true).limit(10),
  ])

  const nombreProductos = (productos ?? []).map((p: { nombre: string }) => p.nombre).join(', ')
  const nombreElab      = (elaboraciones ?? []).map((e: { nombre: string }) => e.nombre).join(', ')
  const nombreSecciones = (secciones ?? []).map((s: { nombre: string }) => s.nombre).join(', ')

  // Vocabulario hostelero de cocina + patrones de consulta
  const vocab = [
    'pendientes, marchar, pase, partida, comanda, mesa, turno, mesa caliente, mesa fría, barra',
    'alérgico, sin gluten, sin lactosa, alergia, intolerancia, celíaco',
    'caducar, caducidad, elaboración, lote, conservar, nevera',
    'stock, queda, quedan, agotado, 86, cuánto queda',
    'cocina caliente, cocina fría, barra, postres, entrantes',
    'minutos, tiempo, lleva, espera, más tiempo, antiguo',
    nombreProductos, nombreElab, nombreSecciones,
  ].filter(Boolean).join(', ')

  const prompt = `Preguntas del jefe de cocina sobre el estado de la cocina. Vocabulario: ${vocab}`

  cocinaPromptCache.set(rid, { ts: Date.now(), prompt })
  return prompt
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const rid      = getRestauranteId(req)
    if (!rid) return NextResponse.json({ error: 'Sin restaurante' }, { status: 401 })

    const fd    = await req.formData()
    const audio = fd.get('audio') as File | null
    if (!audio) return NextResponse.json({ error: 'audio requerido' }, { status: 400 })

    const [prompt, idioma] = await Promise.all([
      buildCocinaPrompt(rid, supabase),
      supabase.from('restaurantes').select('idioma_whisper').eq('id', rid).single()
        .then(r => (r.data?.idioma_whisper ?? 'es') as string),
    ])

    const resultado = await transcribir(audio, prompt, idioma)

    return NextResponse.json({ ok: true, texto: resultado?.texto?.trim() ?? '' })

  } catch (err) {
    console.error('[transcribe/cocina]', err)
    return NextResponse.json({ error: 'Error al transcribir' }, { status: 500 })
  }
}
