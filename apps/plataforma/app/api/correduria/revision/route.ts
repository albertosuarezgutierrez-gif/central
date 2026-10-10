import { NextResponse } from 'next/server'
import { z } from 'zod'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { resolverRevisionAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

const cuerpo = z.object({
  casoId: z.string().uuid(),
  decision: z.enum(['misma', 'distintas', 'descartar']),
  nota: z.string().trim().max(500).optional(),
})

// POST /api/correduria/revision — registra la decisión sobre un caso de la bandeja de revisión manual.
// «misma» NO fusiona: solo deja constancia; la fusión la aplica una sesión con el OK de Alberto.
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const v = cuerpo.safeParse(await req.json().catch(() => null))
  if (!v.success) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  const r = await resolverRevisionAsegura(v.data.casoId, v.data.decision, v.data.nota)
  const status = r.estado === 'ok' ? 200 : r.estado === 'sin_configurar' ? 503
    : r.estado === 'invalido' ? 422 : r.estado === 'no_existe' ? 404 : r.estado === 'ya_resuelto' ? 409 : 502
  return NextResponse.json(r, { status })
}
