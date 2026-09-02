import { NextRequest, NextResponse } from 'next/server'
import { tipoDocumento } from '@central/module-seguros'
import { getSession } from '@/lib/session'
import { pedirDocumentoAsegura, subirDocumentoAsegura } from '@/lib/documentos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/correduria/documentos — sube un documento (multipart) o deja
 * constancia de que se ha PEDIDO (json `{pedir:true}`). Esta app no toca la BD
 * de la correduría: reenvía al puerto de asegura con el secreto de operador.
 * Sesión de plataforma obligatoria: es la pantalla de Alberto.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ct = req.headers.get('content-type') ?? ''
  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const r = await subirDocumentoAsegura(form)
      return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || body.pedir !== true) return NextResponse.json({ error: 'cuerpo ilegible' }, { status: 400 })
    const r = await pedirDocumentoAsegura({
      clienteId: cadena(body.clienteId),
      polizaId: cadena(body.polizaId),
      siniestroId: cadena(body.siniestroId),
      tipo: tipoDocumento(body.tipo),
      notas: cadena(body.notas),
    })
    return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
