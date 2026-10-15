import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { redactarBorradoresAsegura } from '@/lib/correduria/consultas-companias-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 100

/** POST { oportunidadId, destinatarios[], incluirIdentidad, incluirCompetencia, adjuntos[], responderAntes } → borradores (uno por compañía). Redactar NO envía nada. */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const oportunidadId = typeof c?.oportunidadId === 'string' ? c.oportunidadId.trim() : ''
  if (!c || !oportunidadId || !Array.isArray(c.destinatarios) || c.destinatarios.length === 0) {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }
  // Solo lo que el puerto espera (lista blanca); nada más del cuerpo cruza. Quién lo pide va en `x-actor`
  // (cabecerasPuerto), no en el cuerpo.
  const cuerpo = {
    destinatarios: c.destinatarios.filter((x) => typeof x === 'string'),
    incluirIdentidad: c.incluirIdentidad === true,
    incluirCompetencia: c.incluirCompetencia === true,
    adjuntos: Array.isArray(c.adjuntos) ? c.adjuntos.filter((x) => typeof x === 'string') : [],
    responderAntes: typeof c.responderAntes === 'string' && c.responderAntes ? c.responderAntes : null,
  }
  const r = await redactarBorradoresAsegura(oportunidadId, cuerpo, guarda.acceso.correduriaId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
