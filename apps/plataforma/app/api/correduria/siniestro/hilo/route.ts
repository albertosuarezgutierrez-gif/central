import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { avisarPreRehuseSiProcede } from '@/lib/correduria/siniestro-prerehuse'
import { anotarHiloAsegura, conCorreduria, hiloAsegura } from '@/lib/correduria/siniestro-hilo-red'

export const dynamic = 'force-dynamic'

/** /api/correduria/siniestro/hilo — hilo, plazos y espera de un siniestro (proxy a asegura; mismo status y json). */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('siniestroId') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del siniestro.' }, { status: 422 })
  const r = await hiloAsegura(guarda.acceso.correduriaId, id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

/** POST { siniestroId, autor, tipo, texto, documentoId? } — añade un mensaje al hilo. */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.siniestroId !== 'string' || body.siniestroId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del siniestro.' }, { status: 422 })
  }
  const valora = body.valoracion !== undefined && body.valoracion !== null
  if (!valora && (typeof body.texto !== 'string' || body.texto.trim() === '')) {
    return NextResponse.json({ estado: 'invalido', motivo: 'El mensaje está vacío.' }, { status: 422 })
  }
  const r = await anotarHiloAsegura({ ...conCorreduria(guarda.acceso.correduriaId, body), actor: guarda.session.email })
  if (r.status >= 200 && r.status < 300) await avisarPreRehuseSiProcede(r.json, guarda.acceso.correduriaId, body.siniestroId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
