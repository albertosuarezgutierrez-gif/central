// apps/plataforma/app/api/contable/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { responder } from '@/lib/contable/cerebro'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : ''
  if (!mensaje) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })

  try {
    // session.id === cuenta_id (ver lib/tenant.ts / requireEmpresaId).
    const { respuesta, guardados } = await responder(session.id, mensaje, 'web')
    return NextResponse.json({ respuesta, guardados })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('NVIDIA_API_KEY')) {
      return NextResponse.json({ respuesta: 'El agente necesita la variable NVIDIA_API_KEY en el proyecto Vercel de plataforma.' })
    }
    return NextResponse.json({ respuesta: 'No se pudo consultar al agente: ' + msg.slice(0, 140) })
  }
}
