import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { validarSubida } from '@central/module-documental'
import { CARPETAS_IDX, ACTOR_GESTOR } from '@/lib/carpetas'
import { subirObjeto, borrarObjeto } from '@/lib/storage'
import { pathStaging, esPathStagingDe } from '@/lib/envio-staging'

/**
 * Subida asistida/masiva, fase 1: el archivo se sube UNA vez al staging de la empresa de la
 * sesión (`staging/<empresa_id>/…`). Mismos límites (nombre, tamaño) que la subida normal.
 * Pasa por la función (como la subida del expediente): tope práctico ~4 MB de Vercel.
 */
export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    validarSubida(CARPETAS_IDX, ACTOR_GESTOR, { carpeta: 'otros', nombre: file.name, tipo: file.type, tamano: file.size })
    const path = pathStaging(empresa_id, file.name, crypto.randomUUID())
    await subirObjeto(path, await file.arrayBuffer(), file.type || 'application/octet-stream')
    return NextResponse.json({ path, nombre: file.name, tipo: file.type || null, tamano: file.size }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /obligatorio|máximo/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    if (e instanceof Error && /Storage upload/.test(e.message)) return NextResponse.json({ error: 'Error al guardar el archivo. Inténtalo de nuevo.' }, { status: 502 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Descarta un archivo del staging (el responsable lo quita antes de confirmar). */
export async function DELETE(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const path = new URL(req.url).searchParams.get('path')
    if (!esPathStagingDe(empresa_id, path)) return NextResponse.json({ error: 'Ruta de subida no válida' }, { status: 400 })
    await borrarObjeto(path)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
