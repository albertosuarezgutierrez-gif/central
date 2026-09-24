import { NextResponse } from 'next/server'
import { verificarWebhookResend, interpretarEventoResend } from '@/lib/recaptacion-webhook'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { Prisma } from '@/lib/generated/asegura-client'
import { aplicarBajaPorRebote } from '@/lib/cartera-recaptacion'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/resend — recibe los eventos de Resend sobre los emails
// de recaptación: apertura/clic, y (desde el 21/09/2026) rebote/queja de
// spam. Verifica la firma (svix) antes de fiarse de nada del cuerpo; sin
// `RESEND_WEBHOOK_SECRET` se rechaza siempre.
//
// Apertura/clic solo AVANZAN: un evento duplicado o desordenado no puede
// hacer retroceder `pinchado` a `abierto`. Rebote/queja son ESTADOS
// TERMINALES fuera de esa progresión — no compiten con ella, y además
// disparan opt-out automático (dirección muerta o queja de spam no se
// reintentan nunca, con o sin cooldown).
export async function POST(req: Request) {
  const cuerpoCrudo = await req.text()
  const cabeceras = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }
  const verificado = verificarWebhookResend(cuerpoCrudo, cabeceras)
  if (!verificado.ok) return NextResponse.json({ estado: 'error', motivo: verificado.motivo }, { status: 401 })

  const evento = interpretarEventoResend(verificado.payload)
  if (evento === null) return NextResponse.json({ estado: 'ignorado' })

  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  try {
    const esTerminal = evento.estado === 'rebotado' || evento.estado === 'queja'
    await prismaAsegura().$executeRaw(Prisma.sql`
      update recaptacion_envios
         set estado = ${evento.estado}::estado_envio_recaptacion, updated_at = now()
       where resend_message_id = ${evento.resendMessageId}
         and canal = 'email'
         and (${esTerminal} or not (estado = 'pinchado' and ${evento.estado} = 'abierto'))
    `)
    if (evento.estado === 'rebotado' || evento.estado === 'queja') {
      const baja = await aplicarBajaPorRebote(evento.resendMessageId, evento.estado)
      if (baja.estado === 'error') {
        console.error('[webhooks/resend] no se pudo aplicar la baja automática:', baja.motivo)
      }
    }
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    console.error('[webhooks/resend] no se pudo actualizar recaptacion_envios:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 500 })
  }
}
