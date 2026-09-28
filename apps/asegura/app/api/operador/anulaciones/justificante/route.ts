import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { entregarJustificanteAnulacion } from '@/lib/justificante-anulacion'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUS: Record<string, number> = { hecho: 200, no_encontrada: 404, sin_firma_electronica: 409 }

/**
 * POST { id } — el corredor manda (o reenvía) al cliente su carta de baja firmada con el justificante,
 * y la deja archivada en la póliza si aún no lo estaba. Es el botón de plataforma; lo automático sale
 * solo tras la firma en el portal (`/api/portal/anulacion`).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : ''
  if (!UUID.test(id)) return NextResponse.json({ estado: 'invalida', motivo: 'id no válido' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await entregarJustificanteAnulacion(correduria.id, id, { reenviar: true })
    return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/anulaciones/justificante', e) }, { status: 500 })
  }
})
