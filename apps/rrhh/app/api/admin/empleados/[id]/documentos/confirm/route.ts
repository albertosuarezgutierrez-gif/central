import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { ACTOR_GESTOR } from '@/lib/carpetas'
import { confirmarSubidaDirecta } from '@/lib/documental'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/** Fase 2: el cliente ya subió a Storage; registra la fila en BD. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const { path, carpeta, nombre, tipo, tamano, requiere_firma_empresa } = await req.json()
    if (!path || !carpeta || !nombre) return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    const doc = await confirmarSubidaDirecta(empresa_id, id, ACTOR_GESTOR, { path, carpeta, nombre, tipo, tamano })
    if (requiere_firma_empresa) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE rrhh.documentos
        SET requiere_firma_empresa = true, estado_firma = 'pendiente_empresa'
        WHERE id = ${doc.id}::uuid`)
    }
    return NextResponse.json({ documento: { ...doc, estado_firma: requiere_firma_empresa ? 'pendiente_empresa' : 'no_requiere' } }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /permiso|obligatorio|máximo|desconocida|no encontrado/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
