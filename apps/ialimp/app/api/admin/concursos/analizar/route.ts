import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { analizarConcurso, necesitaOcr, type PerfilEmpresa } from '@iarest/module-concursos'
import { aiRunner, extraerTextoPdf } from '@/lib/concursos'
import { ocrPaginasPliego } from '@/lib/concursos-ocr'

export const maxDuration = 60 // la extracción IA puede tardar

// GET — lista los concursos analizados de la empresa.
export async function GET() {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, titulo, expediente, estado, ficha, checklist, go_no_go, garantias, created_at
    FROM concursos
    WHERE empresa_id = ${empresa_id}::uuid
    ORDER BY created_at DESC
    LIMIT 100
  `)
  return NextResponse.json({ concursos: rows })
}

// POST — analiza un pliego (PDF subido o texto pegado) y guarda el resultado.
// Acepta multipart/form-data { file } o JSON { texto, perfil? }.
export async function POST(req: Request) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  // 1) Obtener el texto del pliego (de un PDF o pegado) y el perfil opcional.
  let texto = ''
  let perfil: PerfilEmpresa = {}
  let buf: Buffer | null = null
  const ctype = req.headers.get('content-type') || ''
  try {
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      const pegado = form.get('texto')
      if (file && typeof file !== 'string') {
        buf = Buffer.from(await (file as File).arrayBuffer())
        texto = await extraerTextoPdf(buf)
      } else if (typeof pegado === 'string') {
        texto = pegado
      }
      const perfilRaw = form.get('perfil')
      if (typeof perfilRaw === 'string' && perfilRaw) perfil = JSON.parse(perfilRaw)
    } else {
      const body = await req.json()
      texto = String(body?.texto || '')
      if (body?.perfil && typeof body.perfil === 'object') perfil = body.perfil
    }
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el pliego enviado' }, { status: 400 })
  }

  // 1b) Si el PDF no trae texto (escaneo), reusar la visión IA (OCR) sobre el mismo Buffer.
  let ocr_aplicado = false
  if (buf && necesitaOcr(texto)) {
    const textoOcr = await ocrPaginasPliego(buf)
    if (textoOcr) { texto = textoOcr; ocr_aplicado = true }
  }

  if (!texto.trim()) {
    return NextResponse.json({ error: 'El pliego está vacío o el PDF no contiene texto (¿es un escaneo?)' }, { status: 400 })
  }

  // 2) Llamar al agente (módulo puro + AiRunner inyectado).
  let analisis
  try {
    analisis = await analizarConcurso(aiRunner, texto, perfil)
  } catch (e: any) {
    return NextResponse.json({ error: `El agente no pudo analizar el pliego: ${e?.message || 'error'}` }, { status: 502 })
  }

  // 3) Persistir (scopeado por empresa_id).
  const { ficha, checklist, goNoGo, garantias } = analisis
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO concursos (empresa_id, titulo, expediente, ficha, checklist, go_no_go, garantias, texto_origen)
    VALUES (
      ${empresa_id}::uuid,
      ${ficha.objeto},
      ${ficha.expediente ?? null},
      ${JSON.stringify(ficha)}::jsonb,
      ${JSON.stringify(checklist)}::jsonb,
      ${JSON.stringify(goNoGo)}::jsonb,
      ${JSON.stringify(garantias)}::jsonb,
      ${texto.slice(0, 100_000)}
    )
    RETURNING id, titulo, expediente, estado, ficha, checklist, go_no_go, garantias, created_at
  `)

  return NextResponse.json({ concurso: rows[0], ocr_aplicado })
}
