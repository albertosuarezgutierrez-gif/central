import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { ACTOR_GESTOR } from '@/lib/carpetas'
import { confirmarSubidaDirecta } from '@/lib/documental'

/** Fase 2: el cliente ya subió a Storage; registra la fila en BD. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const { path, carpeta, nombre, tipo, tamano } = await req.json()
    if (!path || !carpeta || !nombre) return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    const doc = await confirmarSubidaDirecta(empresa_id, id, ACTOR_GESTOR, { path, carpeta, nombre, tipo, tamano })
    return NextResponse.json({ documento: doc }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /permiso|obligatorio|máximo|desconocida|no encontrado/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
