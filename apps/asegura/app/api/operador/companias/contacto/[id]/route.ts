import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/operador/companias/contacto/[id] — marca `ultimo_contacto_en`
 * a AHORA. Lo dispara plataforma cuando Alberto pulsa el botón de WhatsApp
 * o de correo sobre un contacto (best-effort: si esto falla, el botón de
 * WhatsApp/mail igual se ha abierto — no bloquea nada).
 */
export async function PATCH(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (body?.accion !== 'contactado') {
      return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
    }
    await prismaAsegura().companiaContacto.update({
      where: { id },
      data: { ultimoContactoEn: new Date() },
    })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/contacto', e) })
  }
}
