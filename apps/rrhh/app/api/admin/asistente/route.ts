import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSesion, AuthError } from '@/lib/tenant'
import { responderAsistenteAdmin } from '@/lib/asistente-admin'

export const maxDuration = 60

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .min(1)
    .max(40),
})

export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 })
    const { respuesta } = await responderAsistenteAdmin(empresa_id, parsed.data.messages)
    return NextResponse.json({ respuesta })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
