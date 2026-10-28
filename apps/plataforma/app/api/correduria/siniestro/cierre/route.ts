import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cierreAsegura, conCorreduria } from '@/lib/correduria/siniestro-hilo-red'

export const dynamic = 'force-dynamic'

/** PATCH { siniestroId, resultado:'ganado'|'perdido'|'parcial', motivo } — cierre del siniestro (proxy a asegura). */
export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.siniestroId !== 'string' || body.siniestroId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del siniestro.' }, { status: 422 })
  }
  if (!['ganado', 'perdido', 'parcial'].includes(String(body.resultado))) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Resultado no válido.' }, { status: 422 })
  }
  const r = await cierreAsegura({ ...conCorreduria(guarda.acceso.correduriaId, body), actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
