import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerDocumentoOportunidadAsegura } from '@/lib/documentos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Por debajo del corte de cuerpo de Vercel (4,5 MB): el navegador encoge las fotos antes. */
const TOPE_BASE64 = 3_600_000

/**
 * POST /api/correduria/oportunidad/leer — `{ base64, mimeType, fileName }` → lo que el
 * agente lee del documento (ramo, compañía, vencimiento, prima) para rellenar el
 * formulario de oportunidad. Va en JSON y no en multipart porque el navegador ya
 * lo tiene en base64 tras encoger la foto (`prepararAdjunto`). No guarda nada.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const base64 = typeof b?.base64 === 'string' ? b.base64 : ''
  const mimeType = typeof b?.mimeType === 'string' ? b.mimeType : ''
  const fileName = typeof b?.fileName === 'string' && b.fileName.trim() ? b.fileName.trim().slice(0, 200) : 'documento'
  if (!base64 || !mimeType) return NextResponse.json({ error: 'falta el documento' }, { status: 400 })
  if (base64.length > TOPE_BASE64) {
    return NextResponse.json({ error: 'el documento pesa demasiado (máx. ~2,5 MB); sube una foto o un PDF más ligero' }, { status: 413 })
  }
  try {
    const r = await leerDocumentoOportunidadAsegura({ contenido: Buffer.from(base64, 'base64'), mimeType, nombre: fileName })
    return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
  } catch (e) {
    const tiempo = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return NextResponse.json({ error: tiempo ? 'la lectura ha tardado demasiado; prueba con una foto más clara o solo la primera página' : (e instanceof Error ? e.message : String(e)) }, { status: 502 })
  }
}
