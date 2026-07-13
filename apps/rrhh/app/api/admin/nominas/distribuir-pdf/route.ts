import { NextRequest, NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { distribuirNominasPdf } from '@/lib/distribuir-nominas'

export const maxDuration = 300 // PDF parsing + NIM puede tardar varios minutos

export async function POST(req: NextRequest) {
  let empresa_id: string, usuario: string
  try {
    const s = await getSesion();
    ({ empresa_id } = s)
    usuario = s.usuario_id
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    throw e
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'FormData requerido' }, { status: 400 })

  const file = form.get('file') as File | null
  const periodo = form.get('periodo') as string | null

  if (!file || file.type !== 'application/pdf')
    return NextResponse.json({ error: 'Se requiere un fichero PDF' }, { status: 400 })
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
    return NextResponse.json({ error: 'periodo debe ser YYYY-MM' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  let resultados
  try {
    resultados = await distribuirNominasPdf(empresa_id, bytes, periodo, usuario)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[distribuir-pdf] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const ok = resultados.filter(r => r.estado === 'ok').length
  return NextResponse.json({ ok: true, distribuidas: ok, total: resultados.length, resultados })
}
