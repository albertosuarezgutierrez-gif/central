import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

// Analiza el logo con NIM Vision y extrae identidad de marca
async function analizarLogo(buffer: Buffer, mediaType: string): Promise<{
  color_acento: string
  color_fondo: string
  estilo: string
  template_sugerido: string
  descripcion: string
} | null> {
  // SVG no soportado por vision — skip
  if (mediaType === 'image/svg+xml') return null

  const base64 = buffer.toString('base64')

  const prompt = `Analiza este logo de restaurante y extrae su identidad visual corporativa.

Responde SOLO con JSON válido, sin texto extra:
{
  "color_acento": "#RRGGBB",
  "color_fondo": "#RRGGBB",
  "estilo": "elegante|moderno|tradicional|mediterraneo|premium",
  "template_sugerido": "clasico|urbano|mediterraneo|taberna|finedining",
  "descripcion": "Una frase corta describiendo el estilo del logo"
}

Reglas para color_acento: extrae el color más representativo y corporativo del logo (no negro puro ni blanco).
Reglas para template_sugerido:
- Logo con serif clásico, dorado o elegante → clasico o finedining
- Logo moderno, minimalista, sans-serif → urbano
- Logo colorido, cálido, mediterráneo → mediterraneo
- Logo tradicional, rojo/negro, taberna → taberna
- Logo negro, sofisticado, alta cocina → finedining`

  try {
    const resultado = await callAIVision(
      'Eres un experto en diseño gráfico e identidad de marca para hostelería.',
      [{ data: base64, mediaType: mediaType as any }],
      prompt,
      300
    )
    const json = JSON.parse(cleanJSON(resultado))
    // Validar que color_acento sea hex válido
    if (!/^#[0-9A-Fa-f]{6}$/.test(json.color_acento)) json.color_acento = '#D9442B'
    return json
  } catch (e) {
    console.warn('[upload-logo] Análisis IA falló:', e)
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Formato no válido. Usa PNG, JPG, WebP o SVG' }, { status: 400 })
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'El logo no puede superar 2MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `web/${restauranteId}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // 1. Subir a Storage
  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
  const url = `${publicUrl}?v=${Date.now()}`

  // 2. Analizar logo con IA (en paralelo no bloqueamos la subida)
  const identidad = await analizarLogo(buffer, file.type)

  // 3. Guardar url + colores corporativos si los tenemos
  const update: Record<string, any> = { logo_url: url }
  if (identidad) {
    update.color_acento = identidad.color_acento
    // Guardamos el template sugerido solo si el owner no tenía uno ya
    const { data: webActual } = await supabase
      .from('web_restaurante')
      .select('template')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    if (!webActual?.template) {
      update.template = identidad.template_sugerido
    }
  }

  await supabase
    .from('web_restaurante')
    .update(update)
    .eq('restaurante_id', restauranteId)

  return NextResponse.json({
    ok: true,
    logo_url: url,
    identidad: identidad ?? null,
    // Devuelve colores para que el frontend actualice el estado sin recargar
    color_acento: identidad?.color_acento ?? null,
    template: update.template ?? null,
  })
}
