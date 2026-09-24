import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { bajaAviso, confirmarAviso, solicitarAviso } from '@/lib/aviso-web'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

// POST /api/operador/aviso-web?accion=solicitar|confirmar|baja — el «avísame antes de que venza»
// de la web pública. Llega por plataforma (`/api/publico/correduria/aviso`), que es quien pone el
// límite por IP y avisa por Telegram; aquí solo entra con el secreto de operador.
//
//   solicitar  { nombre, email, ramo, vence, consentimiento }  → 200 ok · 422 invalido ·
//              503 desactivado (sin ASEGURA_AVISOS_WEB_ACTIVOS=1) · 502 sin_envio
//   confirmar  { token }  → 200 ok (con la ficha, para el Telegram) · 404 no_valido
//   baja       { token }  → 200 ok siempre
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const accion = new URL(req.url).searchParams.get('accion')
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

    if (accion === 'solicitar') {
      const r = await solicitarAviso(correduria.id, body)
      const status = r.estado === 'ok' ? 200 : r.estado === 'invalido' ? 422 : r.estado === 'desactivado' ? 503 : 502
      return NextResponse.json(r, { status })
    }
    if (accion === 'confirmar') {
      const r = await confirmarAviso(correduria.id, body?.token)
      return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 404 })
    }
    if (accion === 'baja') return NextResponse.json(await bajaAviso(correduria.id, body?.token))
    return NextResponse.json({ estado: 'invalido', motivo: 'accion' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/aviso-web', e) }, { status: 500 })
  }
})
