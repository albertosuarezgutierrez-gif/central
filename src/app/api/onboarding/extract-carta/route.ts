import { NextRequest, NextResponse } from 'next/server'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 90

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json()
    if (!images?.length) return NextResponse.json({ error: 'Sin imágenes' }, { status: 400 })
    if (images.length > 15) return NextResponse.json({ error: 'Máximo 15 páginas' }, { status: 400 })



    const normalizeType = (t: string): string => {
      if (t === 'image/jpg') return 'image/jpeg'
      const VALID = ['image/jpeg','image/png','image/gif','image/webp']
      return VALID.includes(t) ? t : 'image/jpeg'
    }
    const imageInputs = images.map((img: { data: string; mediaType: string }) => ({
      data: img.data,
      mediaType: normalizeType(img.mediaType),
    }))
    const onboardingPrompt = `Eres un experto en hostelería española. Extrae TODOS los platos, tapas, bebidas y postres de esta carta de restaurante.

Devuelve SOLO un JSON válido sin texto adicional ni markdown:
{"productos":[{"nombre":"string","descripcion":"string|null","precio":0.00,"categoria":"string","alergenos":["string"]}]}

Reglas:
- precio: número decimal o null si no aparece
- categoria: Entrantes, Tapas, Principales, Carnes, Pescados, Mariscos, Postres, Bebidas, Vinos, Cervezas, etc.
- alergenos: exactamente: ["Gluten","Crustáceos","Huevo","Pescado","Cacahuetes","Soja","Lácteos","Frutos de cáscara","Apio","Mostaza","Sésamo","Dióxido de azufre","Altramuces","Moluscos"]. [] si no hay.
- Incluye ABSOLUTAMENTE TODOS los productos visibles en todas las páginas`
    const msg = await callAIVision('Extrae carta de restaurante. Responde SOLO con JSON.', imageInputs, onboardingPrompt, 6000)

    const raw = msg ?? ''
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return NextResponse.json({ productos: parsed.productos || [] })
    } catch {
      return NextResponse.json({ error: 'Error al parsear respuesta IA', raw }, { status: 500 })
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    console.error('[onboarding/extract-carta] error:', e.status, e.message)
    return NextResponse.json({ error: e.message || 'Error al extraer la carta' }, { status: 500 })
  }
}
