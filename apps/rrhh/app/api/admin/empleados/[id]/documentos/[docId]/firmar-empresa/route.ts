import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { firmarComoEmpresa } from '@/lib/firma-empresa'
import { pushEmpleado } from '@/lib/push'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { id: empleado_id, docId } = await params

    const users = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM rrhh.usuarios_rrhh WHERE id = ${usuario_id}::uuid LIMIT 1`)
    const nombre = users[0]?.nombre ?? 'Responsable'

    const { sello_tiempo } = await firmarComoEmpresa(empresa_id, docId, { usuario_id, nombre })

    try {
      const docs = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT nombre FROM rrhh.documentos WHERE id = ${docId}::uuid LIMIT 1`)
      const docNombre = docs[0]?.nombre ?? 'documento'
      await pushEmpleado(empresa_id, empleado_id, 'Documento listo para firmar', `"${docNombre}" ya ha sido firmado por la empresa`)
    } catch { /* notificaciones no bloquean */ }

    return NextResponse.json({ ok: true, sello_tiempo })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no encontrado|no requiere|no está pendiente/.test(e.message))
      return NextResponse.json({ error: e.message }, { status: 400 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
