import { NextRequest, NextResponse } from 'next/server'
import { callAIVision, cleanJSON } from '@/lib/ai-client'
import { getSession } from '@/lib/session'

export const maxDuration = 90

// Límite por restaurante (memoria de instancia; primera capa — la auth es la barrera real).
const VENTANA_MS = 60 * 60 * 1000
const MAX_POR_VENTANA = 20
const usos = new Map<string, number[]>()
function dentroDeLimite(clave: string): boolean {
  const ahora = Date.now()
  const recientes = (usos.get(clave) ?? []).filter(t => ahora - t < VENTANA_MS)
  if (recientes.length >= MAX_POR_VENTANA) { usos.set(clave, recientes); return false }
  recientes.push(ahora); usos.set(clave, recientes)
  return true
}

export async function POST(req: NextRequest) {
  // Visión IA de pago: solo owner/super_admin con sesión FIRMADA (antes era un POST público).
  const session = getSession(req)
  if (!session?.restaurante_id || !['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!dentroDeLimite(session.restaurante_id)) {
    return NextResponse.json({ error: 'Demasiadas peticiones, prueba en un rato' }, { status: 429 })
  }
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
