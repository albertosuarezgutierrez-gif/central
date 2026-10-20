import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { firmarComoEmpresa } from '@/lib/firma-empresa'
import { avisarSolicitudFirma } from '@/lib/avisos'

export async function POST(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const { id: empleado_id, docId } = await params

    const users = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre FROM rrhh.usuarios_rrhh WHERE id = ${usuario_id}::uuid LIMIT 1`)
    const nombre = users[0]?.nombre ?? 'Responsable'

    const { sello_tiempo } = await firmarComoEmpresa(empresa_id, docId, { usuario_id, nombre })

    // Ahora firma el empleado: se le avisa (intranet + email + push), salvo que al enviarlo se
    // desmarcara «Avisar» (`avisar = false`). NULL = documento anterior a 0023: se avisa como siempre.
    const pref = await prisma.$queryRaw<{ avisar: boolean | null }[]>(Prisma.sql`
      SELECT avisar FROM rrhh.documentos
      WHERE id = ${docId}::uuid AND empresa_id = ${empresa_id}::uuid AND empleado_id = ${empleado_id}::uuid LIMIT 1`)
    const aviso = pref[0]?.avisar === false
      ? null
      : await avisarSolicitudFirma(empresa_id, empleado_id, docId, usuario_id, new URL(req.url).origin)

    return NextResponse.json({ ok: true, sello_tiempo, aviso })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no encontrado|no requiere|no está pendiente/.test(e.message))
      return NextResponse.json({ error: e.message }, { status: 400 })
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
