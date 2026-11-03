import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { conCorreduria, volcadoAsegura } from '@/lib/correduria/siniestro-hilo-red'
import { avisarPreRehuseSiProcede } from '@/lib/correduria/siniestro-prerehuse'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST { siniestroId, texto, confirmar } — volcado de la intranet: propuesta (confirmar=false) o guardado (true). Proxy a asegura. */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.siniestroId !== 'string' || body.siniestroId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del siniestro.' }, { status: 422 })
  }
  if (typeof body.texto !== 'string' || body.texto.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'El volcado está vacío.' }, { status: 422 })
  }
  const confirmar = body.confirmar === true
  const r = await volcadoAsegura({ ...conCorreduria(guarda.acceso.correduriaId, body), confirmar, actor: guarda.session.email })
  if (confirmar && r.status >= 200 && r.status < 300) await avisarPreRehuseSiProcede(r.json, guarda.acceso.correduriaId, body.siniestroId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
