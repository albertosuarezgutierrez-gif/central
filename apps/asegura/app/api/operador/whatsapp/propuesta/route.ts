import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { validarResolucion } from '@/lib/whatsapp/propuestas-reglas'
import { resolverPropuesta } from '@/lib/whatsapp/propuestas'

export const dynamic = 'force-dynamic'

/**
 * Aplica o descarta una PROPUESTA de la IA de WhatsApp (spec 2026-11-04 §5, D1). La llama el handler del callback de
 * Telegram `wap_ok:<id>` / `wap_no:<id>` de plataforma (parte B) con la cabecera `x-actor: humano:<cuentaId>`.
 *   POST { id, decision: 'aplicar' | 'descartar' }
 *   → 200 { estado:'aplicada'|'descartada', tipo, resultado } · 404 no_encontrada · 409 ya_resuelta (un solo uso) |
 *     sin_ancla · 410 caducada (7 días) · 503 sin_migracion · 4xx/5xx fallo_al_aplicar (la propuesta vuelve a pendiente)
 * Aplicar `pagado` NUNCA cierra la devolución (eso es «cobrado de nuevo», a mano); ningún efecto envía nada al cliente.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = validarResolucion(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  // Aplicar escribe en la cartera: solo con un actor identificado (el botón de una persona).
  if (actor.tipo === 'desconocido') return NextResponse.json({ estado: 'invalido', motivo: `falta ${CABECERA_ACTOR}` }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await resolverPropuesta(correduria.id, v.id, v.decision, `${actor.tipo}:${actor.id}`)
    if (r.ok) return NextResponse.json({ estado: r.estado, tipo: r.tipo, resultado: r.resultado })
    return NextResponse.json({ estado: r.estado, ...(r.motivo ? { motivo: r.motivo } : {}) }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/propuesta', e) }, { status: 500 })
  }
})
