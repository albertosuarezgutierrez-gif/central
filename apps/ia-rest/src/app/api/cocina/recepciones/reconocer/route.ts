export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 60

const PROMPT = `Eres un asistente de cocina central (catering) experto en recepción de mercancía y APPCC.
Analiza la imagen: puede ser la ETIQUETA de un producto alimentario o un ALBARÁN de entrega de proveedor con varios productos.

Responde ÚNICAMENTE con JSON válido, sin markdown ni texto:
{
  "tipo": "etiqueta" | "albaran",
  "proveedor": "nombre del proveedor o null",
  "productos": [
    {
      "producto": "nombre del producto tal como aparece",
      "lote": "nº de lote si aparece, o null",
      "caducidad": "fecha de consumo preferente / caducidad en formato YYYY-MM-DD, o null",
      "temperatura": número en °C si aparece (ej. conservación o de entrada), o null,
      "conforme": true
    }
  ],
  "confianza": 0.85
}

- Si es una sola etiqueta, "productos" tiene 1 elemento.
- Si es un albarán, incluye TODOS los productos visibles.
- Interpreta fechas en cualquier formato y devuélvelas como YYYY-MM-DD.
- Si un dato no aparece, pon null (no inventes).
- Responde SOLO el JSON.`

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const rid = getRestauranteId(req)
  if (!session || !rid) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { imagen, mediaType = 'image/jpeg' } = await req.json()
  if (!imagen || typeof imagen !== 'string')
    return NextResponse.json({ error: 'imagen requerida (base64)' }, { status: 400 })
  if (imagen.length > 5_000_000)
    return NextResponse.json({ error: 'Imagen demasiado grande. Máx 4MB.' }, { status: 400 })

  const mt = mediaType === 'image/jpg' ? 'image/jpeg'
    : ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg'

  try {
    const raw = await callAIVision(PROMPT, [{ data: imagen, mediaType: mt }], 'Extrae los datos de recepción de esta imagen.', 1200)
    const parsed = JSON.parse(cleanJSON(raw))
    const productos = (Array.isArray(parsed.productos) ? parsed.productos : [])
      .filter((p: { producto?: string }) => p && String(p.producto ?? '').trim())
      .map((p: Record<string, unknown>) => ({
        producto: String(p.producto).trim(),
        proveedor: parsed.proveedor ?? null,
        lote: p.lote ? String(p.lote) : null,
        caducidad: typeof p.caducidad === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.caducidad) ? p.caducidad : null,
        temperatura: p.temperatura != null && p.temperatura !== '' ? Number(p.temperatura) : null,
        conforme: p.conforme !== false,
      }))
    return NextResponse.json({
      ok: true,
      tipo: parsed.tipo === 'albaran' ? 'albaran' : 'etiqueta',
      proveedor: parsed.proveedor ?? null,
      productos,
      confianza: Math.min(1, Math.max(0, Number(parsed.confianza) || 0)),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cocina/recepciones/reconocer] Error:', msg)
    return NextResponse.json({ error: 'No se pudo leer la imagen. Inténtalo de nuevo.' }, { status: 500 })
  }
}
