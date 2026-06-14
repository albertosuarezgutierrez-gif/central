import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { parseNorma43 } from '@/lib/norma43'
import { parseExtractoXls } from '@/lib/extracto-xls'
import { importarExtracto } from '@/lib/banca'
import { analizarMovimientos } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST multipart/form-data { sociedadId, file, iban?, banco? } — importa un extracto
// bancario en una sociedad de la cuenta. Detecta el formato por extensión:
//   .xls/.xlsx → Excel (Kutxa, BBVA, Santander…)   ·   otro → Norma 43 (Cuaderno 43)
// Scoped por cuenta_id (la sociedad debe ser del dueño).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Esperado multipart/form-data' }, { status: 400 })

  const sociedadId = form.get('sociedadId')
  const file = form.get('file')
  const iban = (form.get('iban') as string | null)?.trim() || undefined
  const banco = (form.get('banco') as string | null)?.trim() || undefined
  if (typeof sociedadId !== 'string' || !sociedadId) {
    return NextResponse.json({ error: 'Falta sociedadId' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el fichero' }, { status: 400 })
  }

  // La sociedad debe pertenecer a la cuenta en sesión.
  const soc = await prisma.sociedad.findFirst({ where: { id: sociedadId, cuentaId: session.id } })
  if (!soc) return NextResponse.json({ error: 'Sociedad no encontrada' }, { status: 404 })

  const buf = Buffer.from(await file.arrayBuffer())
  const esExcel = /\.xlsx?$/i.test(file.name)

  let extractos
  let origen: string
  if (esExcel) {
    extractos = parseExtractoXls(buf, { iban, banco })
    origen = 'xls'
  } else {
    extractos = parseNorma43(buf.toString('latin1'))   // Norma 43 suele venir en ISO-8859-1
    origen = 'norma43'
  }

  if (extractos.length === 0) {
    return NextResponse.json({ error: 'No se reconocieron movimientos en el fichero' }, { status: 422 })
  }

  const resultado = await importarExtracto(session.id, sociedadId, extractos, origen)

  // Capa IA (F2): categoriza los recién importados. Degrada limpio sin NVIDIA_API_KEY.
  const { categorizados } = await analizarMovimientos(session.id).catch(() => ({ categorizados: 0 }))

  return NextResponse.json({ ok: true, ...resultado, categorizados })
}
