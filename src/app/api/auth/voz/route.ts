export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob | null
    const restaurante_code = formData.get('restaurante_code') as string | null

    if (!audio) {
      return NextResponse.json({ error: 'Sin audio' }, { status: 400 })
    }

    // 1. Transcribir con Groq Whisper
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const file = new File([audio], 'audio.webm', { type: audio.type || 'audio/webm' })

    // 2. Resolver restaurante y su idioma
    const supabase = createServerClient()
    let restaurante_id = '00000000-0000-0000-0000-000000000001'
    let restaurante_nombre = 'Restaurante Demo'
    let idiomaWhisper = 'es'

    if (restaurante_code && restaurante_code !== 'ia-rest') {
      const { data: rest } = await supabase
        .rpc('resolve_restaurante', { p_slug_or_code: restaurante_code })
      if (rest?.length) {
        restaurante_id = rest[0].id
        restaurante_nombre = rest[0].nombre
        // Leer idioma del restaurante
        const { data: rData } = await supabase
          .from('restaurantes').select('idioma_whisper').eq('id', restaurante_id).maybeSingle()
        idiomaWhisper = (rData as { idioma_whisper?: string } | null)?.idioma_whisper ?? 'es'
      }
    }

    const tx = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      ...(idiomaWhisper !== 'auto' ? { language: idiomaWhisper } : {}),
      response_format: 'json',
    })
    const texto = tx.text.trim()
    if (!texto) {
      return NextResponse.json({ error: 'No se entendió nada', texto: '' }, { status: 422 })
    }

    // 3. Obtener camareros del restaurante
    const { data: camareros } = await supabase
      .from('personal')
      .select('id, nombre, rol, seccion_id')
      .eq('restaurante_id', restaurante_id)
      .eq('activo', true)

    if (!camareros?.length) {
      return NextResponse.json({ error: 'Sin camareros en este restaurante' }, { status: 404 })
    }

    // 4. Extraer nombre con BRAIN (NVIDIA/Anthropic)
    const { callAI: aiCall, cleanJSON } = await import('@/lib/ai-client')
    const nombresDisponibles = camareros.map(c => c.nombre).join(', ')
    const system_voz = `Eres un asistente de reconocimiento de identidad para un restaurante.
El usuario ha dicho algo por voz. Tu tarea: extraer el nombre de la persona que quiere iniciar sesión.
Camareros registrados en este restaurante: ${nombresDisponibles}
Responde SOLO con JSON: {"nombre_detectado": "nombre exacto del camarero o null si no se identifica", "confianza": 0.0-1.0}
Si el texto menciona un nombre que se parece a algún camarero (ignorando mayúsculas/acentos), devuelve el nombre exacto del registro.
Si no se identifica ningún nombre, devuelve null.`

    let brainResult: { nombre_detectado: string | null; confianza: number }
    try {
      const raw = await aiCall(system_voz, `Texto de voz: "${texto}"`, 128)
      brainResult = JSON.parse(cleanJSON(raw))
    } catch {
      return NextResponse.json({ error: 'Error parseo BRAIN', texto }, { status: 500 })
    }

    if (!brainResult.nombre_detectado || brainResult.confianza < 0.6) {
      // No identificado con suficiente confianza — devolver lista para que el usuario elija
      return NextResponse.json({
        identificado: false,
        texto,
        confianza: brainResult.confianza,
        sugerencias: camareros.map(c => ({ id: c.id, nombre: c.nombre, rol: c.rol, seccion_id: c.seccion_id })),
        restaurante_id,
        restaurante_nombre,
      })
    }

    // 5. Encontrar el camarero exacto
    const camarero = camareros.find(
      c => c.nombre.toLowerCase() === brainResult.nombre_detectado!.toLowerCase()
    )

    if (!camarero) {
      return NextResponse.json({
        identificado: false,
        texto,
        confianza: brainResult.confianza,
        sugerencias: camareros.map(c => ({ id: c.id, nombre: c.nombre, rol: c.rol, seccion_id: c.seccion_id })),
        restaurante_id,
        restaurante_nombre,
      })
    }

    // 6. Login exitoso
    return NextResponse.json({
      identificado: true,
      texto,
      confianza: brainResult.confianza,
      camarero: {
        id: camarero.id,
        nombre: camarero.nombre,
        rol: camarero.rol,
        seccion_id: camarero.seccion_id ?? null,
        restaurante_id,
        restaurante_nombre,
      },
    })

  } catch (err) {
    console.error('[AUTH/VOZ]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}
