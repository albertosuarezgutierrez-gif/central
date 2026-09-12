import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { crearCodigoDni } from '@/lib/correduria/dni-otp'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

// POST /api/correduria/cliente/[id]/dni-codigo — pide un código de un solo uso
// para revelar el DNI completo de ese cliente. El código llega SOLO al
// Telegram de Alberto (nunca a la respuesta HTTP): sin abrir Telegram no hay
// forma de completar el segundo paso.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ estado: 'invalido' }, { status: 422 })

  const codigo = await crearCodigoDni(session.id, id)
  await tgSend(
    `🔑 Código para ver el DNI completo de un cliente: <b>${codigo}</b>\nCaduca en 5 minutos. Pedido desde /correduria por ${session.email}.`,
  )
  return NextResponse.json({ estado: 'ok' })
}
