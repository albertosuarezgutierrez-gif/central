import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 60

/**
 * POST /api/owner/stock/ocr
 * Body: { images: [{ data: string (base64), mediaType: string }] }
 *
 * Claude lee el albarán/factura y extrae artículos, cantidades y precios.
 * Devuelve array para que el dueño confirme antes de entrar en stock.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { images } = await req.json()
  if (!images?.length) return NextResponse.json({ error: 'Sin imagen' }, { status: 400 })
  if (images.length > 4) return NextResponse.json({ error: 'Máximo 4 imágenes' }, { status: 400 })

  const normalizeType = (t: string): string => {
    if (t === 'image/jpg') return 'image/jpeg'
    const VALID = ['image/jpeg','image/png','image/gif','image/webp']
    return VALID.includes(t) ? t : 'image/jpeg'
  }
  const imageInputs = images.map((img: { data: string; mediaType: string }) => ({
    data: img.data,
    mediaType: normalizeType(img.mediaType),
  }))

  const prompt = `Eres asistente de gestión de restaurante español. Analiza este albarán o factura de proveedor.

Extrae TODOS los artículos o productos que aparezcan con sus cantidades.

Devuelve SOLO un JSON válido, sin texto adicional ni markdown:
{
  "proveedor": "Nombre del proveedor si aparece, null si no",
  "fecha": "DD/MM/YYYY si aparece, null si no",
  "articulos": [
    {
      "nombre": "nombre exacto del producto tal como aparece",
      "cantidad": 3.5,
      "unidad": "unidad inferida: unidad|kg|litro|barril|caja|botella|pieza|sobre|lata|bolsa",
      "precio_unitario": 12.50
    }
  ]
}

Reglas:
- cantidad: número decimal (obligatorio, usa 1 si no aparece)
- unidad: infiere del contexto (ej: "caja 12u" → caja, "5kg" → kg, "3 botellas" → botella)
- precio_unitario: número decimal o null si no aparece
- Incluye TODOS los artículos visibles aunque sean difíciles de leer
- Si hay totales o subtotales, NO los incluyas como artículos`

  try {
    const raw = await callAIVision('Analiza albaranes y facturas de proveedor. Responde SOLO con JSON.', imageInputs, prompt, 2000)
    const parsed = JSON.parse(cleanJSON(raw))

    return NextResponse.json({
      ok: true,
      proveedor: parsed.proveedor ?? null,
      fecha: parsed.fecha ?? null,
      articulos: parsed.articulos ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el albarán' }, { status: 500 })
  }
}
