import { NextResponse } from 'next/server'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'
import { firmarDocumento } from '@/lib/firma-limpiadora'

// POST { nombre_confirmado, codigo } — la limpiadora firma un documento pendiente.
export async function POST(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const ses = await getLimpiadoraSession()
  if (!ses) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { docId } = await params
    const { nombre_confirmado, codigo } = await req.json().catch(() => ({}))
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const user_agent = req.headers.get('user-agent')
    const evidencia = await firmarDocumento(ses.empresa_id, ses.limpiadora_id, docId, {
      ip, user_agent, nombre_confirmado: String(nombre_confirmado ?? ''),
      codigo: codigo != null ? String(codigo) : null,
    })
    return NextResponse.json({ ok: true, sello_tiempo: evidencia.sello_tiempo })
  } catch (e) {
    if (e instanceof Error && /no encontrado|firmado|no requiere|no coincide|código|caducado|intentos|Falta/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
