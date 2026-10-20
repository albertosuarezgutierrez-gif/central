import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { analizarStaging } from '@/lib/envio-documentos'

export const maxDuration = 60

/**
 * Subida asistida, fase 2: la IA PROPONE (tipo, carpeta, título, firma, resumen, destinatarios).
 * No escribe nada: el responsable confirma después en `/asignar`. Lo que la IA no sabe va a null.
 */
export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const { path, nombre } = await req.json().catch(() => ({}))
    const analisis = await analizarStaging(empresa_id, String(path ?? ''), String(nombre ?? ''))
    return NextResponse.json(analisis)
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no válida/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
