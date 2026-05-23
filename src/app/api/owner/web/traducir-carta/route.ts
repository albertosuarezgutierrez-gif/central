import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

const IDIOMAS = { en: 'English', fr: 'French', de: 'German' }

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { idiomas }: { idiomas: string[] } = await req.json()
  const idiomasValidos = (idiomas ?? ['en', 'fr', 'de']).filter(i => Object.keys(IDIOMAS).includes(i))

  if (!idiomasValidos.length) return NextResponse.json({ error: 'Idiomas no válidos' }, { status: 400 })

  // Obtener carta actual
  const { data: productos } = await supabase
    .from('productos')
    .select('nombre, descripcion, precio, categoria')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .order('categoria')

  if (!productos?.length) return NextResponse.json({ error: 'No hay productos en la carta' }, { status: 400 })

  const cartaES = productos.map(p => ({ nombre: p.nombre, descripcion: p.descripcion, precio: p.precio, categoria: p.categoria }))

  // Traducir a todos los idiomas solicitados en paralelo
  const traducciones: Record<string, any[]> = {}

  await Promise.all(idiomasValidos.map(async (idioma) => {
    const nombreIdioma = IDIOMAS[idioma as keyof typeof IDIOMAS]
    const prompt = `Translate this Spanish restaurant menu to ${nombreIdioma}.
Keep category names, dish names and descriptions natural and appealing for ${nombreIdioma} speakers.
Keep prices and structure exactly the same.
Menu JSON: ${JSON.stringify(cartaES)}

Respond ONLY with a JSON array with the same structure, translated to ${nombreIdioma}. No extra text.`

    try {
      const resultado = await callAI(
        `You are a professional restaurant menu translator specializing in gastronomy. Translate accurately and appetizingly.`,
        prompt,
        1200
      )
      const json = JSON.parse(cleanJSON(resultado))
      if (Array.isArray(json)) traducciones[idioma] = json
    } catch (e) {
      console.warn(`[traducir-carta] Error traduciendo a ${idioma}:`, e)
    }
  }))

  if (!Object.keys(traducciones).length) {
    return NextResponse.json({ error: 'Error al traducir la carta' }, { status: 500 })
  }

  // Guardar traducciones en web_restaurante
  const { data: webActual } = await supabase
    .from('web_restaurante')
    .select('carta_traducciones, idiomas_activos')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()

  const cartaActual = webActual?.carta_traducciones ?? {}
  const idiomasActivos = ['es', ...idiomasValidos]

  await supabase.from('web_restaurante')
    .update({
      carta_traducciones: { ...cartaActual, ...traducciones },
      idiomas_activos: idiomasActivos,
    })
    .eq('restaurante_id', restauranteId)

  return NextResponse.json({
    ok: true,
    idiomas: idiomasValidos,
    platos_traducidos: cartaES.length,
  })
}
