import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { enviarLoteEmail } from '@/lib/cartera-recaptacion'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/operador/recaptacion/email-lote — el envío AUTOMÁTICO diario de
// recaptación por email (leads solo-email, sin teléfono usable). Lo dispara
// el cron `recaptacion-email-lote` de plataforma. `{ limite?: number }`.
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as { limite?: number } | null
    const limite = typeof body?.limite === 'number' && body.limite > 0 ? Math.floor(body.limite) : undefined

    const resumen = await enviarLoteEmail(correduria.id, { limite, actor: 'cron-recaptacion-email-lote' })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/recaptacion/email-lote', e) }, { status: 500 })
  }
})
