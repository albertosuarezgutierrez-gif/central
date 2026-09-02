import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anotarHistorialCliente } from '@/lib/cartera-edicion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/operador/cliente/historial — anotar una fila en `historial_interno`
 * de un cliente por el puerto de operador (plataforma → asegura).
 *
 *   { clienteId, tipo: 'nota'|'gestion'|'contacto', texto, actor? } → { estado:'ok' }
 *
 * Nació con el canal de leads web (02/09/2026): cuando el formulario público
 * trae un teléfono o email que YA está en una ficha, no se crea otra (nunca se
 * fuerza un duplicado desde la web) y ese contacto se anota aquí, tipo
 * `contacto`, para que Alberto lo vea en la ficha y sepa qué quería.
 *
 * 401 sin secreto · 503 puerto sin configurar · 422 tipo/texto inválidos ·
 * 404 el cliente no es de esta correduría · 500 no se pudo escribir (y se
 * dice: una fila de historial que no queda no es «ok»).
 */
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
    // `historial_interno.actor_user_id` es un uuid de la Auth del CRM (sin uso en central):
    // quién anota va en el texto, como en las demás escrituras del puerto. Si el canal ya se
    // nombra en el texto (formulario web), el llamante no manda `actor` y no se repite.
    const actor = typeof body.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim().slice(0, 120) : null
    const texto = typeof body.texto === 'string' && actor ? `${body.texto.trim()} — por ${actor}` : body.texto
    const r = await anotarHistorialCliente(correduria.id, body.clienteId.trim(), body.tipo, texto)
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/historial', e) }, { status: 500 })
  }
}
