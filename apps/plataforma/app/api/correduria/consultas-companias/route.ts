import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { panelConsultasAsegura } from '@/lib/correduria/consultas-companias-asegura'

export const dynamic = 'force-dynamic'

/** GET ?oportunidadId= → panel (compañías, contactos, faltan, competencia, documentos, consultas). Mismo status y json del puerto. */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const oportunidadId = (new URL(req.url).searchParams.get('oportunidadId') ?? '').trim()
  if (!oportunidadId) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await panelConsultasAsegura(oportunidadId, guarda.acceso.correduriaId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
