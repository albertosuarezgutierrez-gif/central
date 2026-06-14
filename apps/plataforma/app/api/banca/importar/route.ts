import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { parseNorma43 } from '@/lib/norma43'
import { importarExtracto } from '@/lib/banca'
import { analizarMovimientos } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'

// POST multipart/form-data { sociedadId, file(.n43) } — importa un extracto Norma 43
// en una sociedad de la cuenta. Scoped por cuenta_id (la sociedad debe ser del dueño).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Esperado multipart/form-data' }, { status: 400 })

  const sociedadId = form.get('sociedadId')
  const file = form.get('file')
  if (typeof sociedadId !== 'string' || !sociedadId) {
    return NextResponse.json({ error: 'Falta sociedadId' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el fichero .n43' }, { status: 400 })
  }

  // La sociedad debe pertenecer a la cuenta en sesión.
  const soc = await prisma.sociedad.findFirst({ where: { id: sociedadId, cuentaId: session.id } })
  if (!soc) return NextResponse.json({ error: 'Sociedad no encontrada' }, { status: 404 })

  // Norma 43 es ISO-8859-1 (latin1) en la práctica; lo leemos como tal.
  const buf = Buffer.from(await file.arrayBuffer())
  const contenido = buf.toString('latin1')

  const extractos = parseNorma43(contenido)
  if (extractos.length === 0) {
    return NextResponse.json({ error: 'El fichero no parece un Norma 43 válido' }, { status: 422 })
  }

  const resultado = await importarExtracto(session.id, sociedadId, extractos)

  // Capa IA (F2): categoriza los recién importados. Degrada limpio sin NVIDIA_API_KEY
  // o si la IA falla — el import ya está guardado, esto solo enriquece.
  const { categorizados } = await analizarMovimientos(session.id).catch(() => ({ categorizados: 0 }))

  return NextResponse.json({ ok: true, ...resultado, categorizados })
}
