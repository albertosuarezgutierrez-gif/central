import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { ACTOR_GESTOR } from '@/lib/carpetas'
import { prepararSubidaDirecta } from '@/lib/documental'

/** Fase 1: valida permisos y devuelve URL firmada para subida directa a Storage. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const carpeta = searchParams.get('carpeta') ?? ''
    const nombre = searchParams.get('nombre') ?? ''
    const tipo = searchParams.get('tipo') || null
    const tamano = searchParams.get('tamano') ? Number(searchParams.get('tamano')) : null
    const { signedUrl, path, validado } = await prepararSubidaDirecta(empresa_id, id, ACTOR_GESTOR, { carpeta, nombre, tipo, tamano })
    return NextResponse.json({ signedUrl, path, validado })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /permiso|obligatorio|máximo|desconocida|no encontrado/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
