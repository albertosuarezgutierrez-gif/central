import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const VALID_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
  type ValidType = typeof VALID_TYPES[number]
  const normalizeType = (t: string): ValidType => {
    if (t === 'image/jpg') return 'image/jpeg'
    if (VALID_TYPES.includes(t as ValidType)) return t as ValidType
    return 'image/jpeg'
  }

  const imageBlocks = images.map((img: { data: string; mediaType: string }) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: normalizeType(img.mediaType),
      data: img.data,
    },
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
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: prompt },
        ],
      }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())

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
