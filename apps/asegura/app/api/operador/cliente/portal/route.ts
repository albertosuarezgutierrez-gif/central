import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { estadoPortalDeFicha, invitarAlPortal } from '@/lib/invitacion-portal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * El acceso de un CLIENTE al portal (plataforma → asegura, Bearer).
 *
 *   GET  ?clienteId=…            → qué se puede hacer hoy con esa ficha
 *   POST { clienteId, actor }    → le manda el correo con el enlace
 *
 * ── Por qué el GET existe y no basta con el POST ───────────────────────────
 *
 * Porque la pantalla tiene que poder decir «ya entra (última vez el 3 de
 * septiembre)» ANTES de ofrecer un botón. Sin eso, Alberto le mandaría un «ya
 * puedes entrar» a quien lleva semanas entrando, o invitaría a alguien cuyo
 * correo no resuelve a su ficha y que va a ver una bóveda vacía. Un botón que
 * solo se puede evaluar pulsándolo no es un botón, es una apuesta.
 *
 * ── 🚨 El envío es gratis pero NO es inocuo ────────────────────────────────
 *
 * Esto escribe a una persona real, a una dirección que tecleó Alberto. Por eso
 * lo dispara él con un clic y no hay ningún cron detrás: es la regla de
 * comunicaciones salientes del `CLAUDE.md` raíz —nada sale a un tercero sin
 * autorización para ESE envío— y el clic es esa autorización.
 *
 * Los ocho motivos por los que puede no salir viajan cada uno con su código
 * (`sin_email` 422, `ilegible` 422, `ambiguo` 409, `resuelve_a_otra` 409,
 * `no_comprobado` 503, `sin_portal` 503, `error_envio` 502, `no_encontrado` 404)
 * porque se arreglan en sitios distintos: uno pidiéndole el correo al cliente,
 * otro resolviendo un duplicado y otro mirando una variable de Vercel. Un
 * «no se pudo» común dejaría a Alberto sin saber a cuál de los tres ir.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const clienteId = new URL(req.url).searchParams.get('clienteId')?.trim()
    if (!clienteId) return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })

    const portal = await estadoPortalDeFicha(correduria.id, clienteId)
    if (portal === null) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', portal })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/portal', e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
      return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })
    }
    const actor = typeof body.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim().slice(0, 120) : 'plataforma'

    const r = await invitarAlPortal(correduria.id, { clienteId: body.clienteId.trim(), actor })
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', yaEntraba: r.yaEntraba })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/portal', e) }, { status: 500 })
  }
}
