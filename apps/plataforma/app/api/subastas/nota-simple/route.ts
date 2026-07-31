// Nota simple actualizada de una subasta: se sube (PDF, imagen o texto pegado),
// se lee con el lector registral y se dice QUÉ HA CAMBIADO desde la
// certificación que adjuntó el juzgado. Ver `lib/subastas/nota-simple.ts`.
import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import {
  analizarNotaSimple,
  guardarNotaSimple,
  notasSimplesDe,
  MAX_BYTES_NOTA,
} from '@/lib/subastas/nota-simple'

export const dynamic = 'force-dynamic'
// La lectura por visión de un escaneo se come el minuto entero.
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

  return NextResponse.json({ notas: await notasSimplesDe(cuentaId, dedupeKey) })
}

export async function POST(req: NextRequest) {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const tipo = req.headers.get('content-type') ?? ''
    let dedupeKey = ''
    let pdf: Buffer | null = null
    let mediaType: string | null = null
    let texto: string | null = null

    if (tipo.includes('multipart/form-data')) {
      const form = await req.formData()
      dedupeKey = String(form.get('dedupe_key') ?? '')
      const fichero = form.get('fichero')
      if (fichero instanceof File) {
        if (fichero.size > MAX_BYTES_NOTA) {
          return NextResponse.json({ error: 'El fichero pesa demasiado (máx. 12 MB)' }, { status: 413 })
        }
        pdf = Buffer.from(await fichero.arrayBuffer())
        mediaType = fichero.type || 'application/pdf'
      }
      texto = form.get('texto') ? String(form.get('texto')) : null
    } else {
      const body = await req.json()
      dedupeKey = String(body?.dedupe_key ?? '')
      texto = body?.texto ? String(body.texto) : null
    }

    if (!dedupeKey) return NextResponse.json({ error: 'Falta dedupe_key' }, { status: 400 })
    if (!pdf && !texto?.trim()) return NextResponse.json({ error: 'Sube el PDF de la nota simple o pega su texto' }, { status: 400 })

    const r = await analizarNotaSimple(dedupeKey, { texto, pdf, mediaType })
    // Una nota de la que no se ha sacado ni una carga no se guarda: dejaría en la
    // ficha un «cuadro» vacío que mañana se leería como «no hay cargas».
    const id = r.ilegible ? null : await guardarNotaSimple(cuentaId, dedupeKey, r)

    return NextResponse.json({ ok: true, id, ...r })
  } catch (e: any) {
    console.error('[subastas nota-simple]', e)
    return NextResponse.json({ error: e?.message ?? 'Error leyendo la nota simple' }, { status: 500 })
  }
}
