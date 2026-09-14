import { NextResponse } from 'next/server'
import { verificarWebhookResend, interpretarEventoResend } from '@/lib/recaptacion-webhook'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { Prisma } from '@/lib/generated/asegura-client'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/resend — recibe los eventos de apertura/clic de Resend
// sobre los emails de recaptación. Verifica la firma (svix) antes de fiarse
// de nada del cuerpo; sin `RESEND_WEBHOOK_SECRET` se rechaza siempre.
//
// Solo AVANZA el estado: un evento duplicado o desordenado no puede hacer
// retroceder `pinchado` a `abierto`.
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
    await prismaAsegura().$executeRaw(Prisma.sql`
      update recaptacion_envios
         set estado = ${evento.estado}::estado_envio_recaptacion, updated_at = now()
       where resend_message_id = ${evento.resendMessageId}
         and canal = 'email'
         and not (estado = 'pinchado' and ${evento.estado} = 'abierto')
    `)
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    console.error('[webhooks/resend] no se pudo actualizar recaptacion_envios:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 500 })
  }
}
