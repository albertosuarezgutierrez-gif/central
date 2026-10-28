import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { polizaBuscarAsegura } from '@/lib/correduria/siniestro-hilo-red'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET ?siniestroId&q — busca en el texto de la póliza del siniestro (proxy a asegura; mismo status y json). */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const p = new URL(req.url).searchParams
  const id = (p.get('siniestroId') ?? '').trim()
  const q = (p.get('q') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del siniestro.' }, { status: 422 })
  if (q.length < 2) return NextResponse.json({ estado: 'invalido', motivo: 'Escribe al menos 2 letras.' }, { status: 422 })
  const r = await polizaBuscarAsegura(guarda.acceso.correduriaId, id, q.slice(0, 200))
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
