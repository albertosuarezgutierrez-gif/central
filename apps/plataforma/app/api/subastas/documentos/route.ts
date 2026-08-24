// Documentos aportados a mano a una subasta (el caso de uso: fichas cuyo
// muro documental el cron no puede cruzar — Alberto los baja con su sesión del
// Portal y los sube aquí). Se leen con el lector registral y escriben el corpus
// con la semántica del cron. Ver `lib/subastas/docs-aportados.ts`.
import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { docsAportadosDe, procesarDocAportado, MAX_BYTES_APORTADO } from '@/lib/subastas/docs-aportados'

export const dynamic = 'force-dynamic'
// La lectura por visión de una certificación escaneada se come minutos.
export const maxDuration = 300

async function cuenta(): Promise<string | null> {
  try {
    return await requireEmpresaId()
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const dedupeKey = req.nextUrl.searchParams.get('dedupe_key')
  if (!dedupeKey) return NextResponse.json({ error: 'Falta dedupe_key' }, { status: 400 })

  return NextResponse.json({ docs: await docsAportadosDe(cuentaId, dedupeKey) })
}

export async function POST(req: NextRequest) {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const tipo = req.headers.get('content-type') ?? ''
    let dedupeKey = ''
    let nombreFichero: string | null = null
    let titulo: string | null = null
    let pdf: Buffer | null = null
    let mediaType: string | null = null
    let texto: string | null = null

    if (tipo.includes('multipart/form-data')) {
      const form = await req.formData()
      dedupeKey = String(form.get('dedupe_key') ?? '')
      titulo = form.get('titulo') ? String(form.get('titulo')) : null
      const fichero = form.get('fichero')
      if (fichero instanceof File) {
        if (fichero.size > MAX_BYTES_APORTADO) {
          return NextResponse.json({ error: 'El fichero pesa demasiado (máx. 20 MB)' }, { status: 413 })
        }
        pdf = Buffer.from(await fichero.arrayBuffer())
        mediaType = fichero.type || 'application/pdf'
        nombreFichero = fichero.name || null
      }
      texto = form.get('texto') ? String(form.get('texto')) : null
    } else {
      const body = await req.json()
      dedupeKey = String(body?.dedupe_key ?? '')
      titulo = body?.titulo ? String(body.titulo) : null
      texto = body?.texto ? String(body.texto) : null
    }

    if (!dedupeKey) return NextResponse.json({ error: 'Falta dedupe_key' }, { status: 400 })
    if (!pdf && !texto?.trim()) return NextResponse.json({ error: 'Sube el PDF del documento o pega su texto' }, { status: 400 })

    const r = await procesarDocAportado(cuentaId, dedupeKey, { nombreFichero, titulo, texto, pdf, mediaType })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    console.error('[subastas documentos-aportados]', e)
    return NextResponse.json({ error: e?.message ?? 'Error leyendo el documento' }, { status: 500 })
  }
}
