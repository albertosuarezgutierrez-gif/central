import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { enviarConsultaAsegura } from '@/lib/correduria/consultas-companias-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 65

/**
 * POST { confirmar: true } → pide a asegura enviar la consulta (el SMTP y la sustitución del DNI son de asegura).
 * Exige la confirmación explícita del cuerpo; reenvía el status TAL CUAL (503 canal_no_disponible ≠ 502 envio_fallido ≠ 409 ya enviada).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  const c = (await req.json().catch(() => null)) as { confirmar?: unknown } | null
  if (c?.confirmar !== true) return NextResponse.json({ estado: 'error', motivo: 'falta_confirmacion' }, { status: 400 })
  const r = await enviarConsultaAsegura(id, guarda.acceso.correduriaId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
