import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { parseNorma43 } from '@/lib/norma43'
import { parseExtractoXls } from '@/lib/extracto-xls'
import { parseExtractoCsv } from '@/lib/extracto-csv'
import { parseExtractoTarjetaPdf } from '@/lib/extracto-tarjeta-pdf'
import { importarExtracto, enviarResumenTarjeta } from '@/lib/banca'
import { analizarMovimientos } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST multipart/form-data { sociedadId, file, iban?, banco? } — importa un extracto
// bancario en una sociedad de la cuenta. Detecta el formato por extensión:
//   .xls/.xlsx → Excel (Kutxa, BBVA, Santander…)
//   .csv       → CSV (el que exporta la propia plataforma, o CSV genérico de banco)
//   .pdf       → "Movimientos de tarjeta" de Kutxabank (visa dual; usar tipo=tarjeta)
//   otro       → Norma 43 (Cuaderno 43)
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
  const titularRaw = (form.get('titular') as string | null)?.trim()
  const titular: 'titular' | 'conyuge' = titularRaw === 'conyuge' ? 'conyuge' : 'titular'
  const tipoRaw = (form.get('tipo') as string | null)?.trim()
  const tipo: 'corriente' | 'tarjeta' | 'ahorro' = tipoRaw === 'tarjeta' ? 'tarjeta' : tipoRaw === 'ahorro' ? 'ahorro' : 'corriente'
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
  const esCsv = /\.csv$/i.test(file.name)
  const esPdf = /\.pdf$/i.test(file.name)

  let extractos
  let origen: string
  if (esExcel) {
    extractos = parseExtractoXls(buf, { iban, banco })
    origen = 'xls'
  } else if (esCsv) {
    extractos = parseExtractoCsv(buf, { iban, banco })
    origen = 'csv'
  } else if (esPdf) {
    extractos = await parseExtractoTarjetaPdf(buf, { iban, banco })
    origen = 'pdf'
  } else {
    extractos = parseNorma43(buf.toString('latin1'))   // Norma 43 suele venir en ISO-8859-1
    origen = 'norma43'
  }

  if (extractos.length === 0) {
    return NextResponse.json({ error: 'No se reconocieron movimientos en el fichero' }, { status: 422 })
  }

  const resultado = await importarExtracto(session.id, sociedadId, extractos, origen, titular, tipo)

  // Capa IA (F2): categoriza los recién importados. Degrada limpio sin NVIDIA_API_KEY.
  const { categorizados } = await analizarMovimientos(session.id).catch(() => ({ categorizados: 0 }))

  // Si es tarjeta de crédito: envía resumen por Telegram con el desglose del mes importado.
  if (tipo === 'tarjeta' && resultado.cuentaBancariaIds.length && resultado.fechaInicio) {
    const mes = resultado.fechaInicio.slice(0, 7)
    enviarResumenTarjeta(session.id, resultado.cuentaBancariaIds, mes).catch(() => {})
  }

  return NextResponse.json({ ok: true, ...resultado, categorizados })
}
