import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { validarResolucion } from '@/lib/whatsapp/propuestas-reglas'
import { deshacerPropuesta, resolverPropuesta } from '@/lib/whatsapp/propuestas'
import { silenciarConversacion } from '@/lib/whatsapp/respuesta'

export const dynamic = 'force-dynamic'

/**
 * Aplica o descarta una PROPUESTA de la IA de WhatsApp (spec 2026-11-04 §5, D1). La llama el handler del callback de
 * Telegram `wap_ok:<id>` / `wap_no:<id>` de plataforma (parte B) con la cabecera `x-actor: humano:<cuentaId>`.
 *   POST { id, decision: 'aplicar' | 'descartar' }
 *   → 200 { estado:'aplicada'|'descartada', tipo, resultado } · 404 no_encontrada · 409 ya_resuelta (un solo uso) |
 *     sin_ancla · 410 caducada (7 días) · 503 sin_migracion · 4xx/5xx fallo_al_aplicar (la propuesta vuelve a pendiente)
 *   POST { id, decision: 'modificar', correccion }  (✏️ `wap_ed`: fecha y/o observación de Alberto)
 *   → 200 { estado:'modificada' } (aplicada la versión corregida) · 422 correccion_invalida · el resto, como aplicar
 *   POST { id, decision: 'deshacer' }  (↩️ `wap_un`: solo una aplicada SOLA, un uso)
 *   → 200 { estado:'deshecha' } · 409 no_autonoma | ya_deshecha | sin_previo | cambiado_despues · 404 · 503
 *   POST { id: <conversacionId>, decision: 'silenciar' }  (🔇 `wap_si`: la IA deja de CONTESTAR sola en esa conversación)
 *   → 200 { estado:'silenciada'|'ya_silenciada' } · 404 no_encontrada · 503 sin_migracion. Solo una persona.
 * Aplicar `pagado` NUNCA cierra la devolución (eso es «cobrado de nuevo», a mano); ningún efecto envía nada al cliente.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = validarResolucion(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  // Aplicar escribe en la cartera: solo con un actor identificado (el botón de una persona).
  if (actor.tipo === 'desconocido') return NextResponse.json({ estado: 'invalido', motivo: `falta ${CABECERA_ACTOR}` }, { status: 422 })
  // ✏️ y ↩️ son decisiones del TITULAR (botón de Telegram): nunca de un agente ni del sistema.
  if ((v.decision === 'modificar' || v.decision === 'deshacer' || v.decision === 'silenciar') && actor.tipo !== 'humano') {
    return NextResponse.json({ estado: 'invalido', motivo: 'solo una persona puede modificar, deshacer o silenciar' }, { status: 403 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const quien = `${actor.tipo}:${actor.id}`
    if (v.decision === 'silenciar') {
      const s = await silenciarConversacion(correduria.id, v.id, quien)
      if (s === 'silenciada' || s === 'ya_silenciada') return NextResponse.json({ estado: s })
      return NextResponse.json({ estado: s }, { status: s === 'no_encontrada' ? 404 : 503 })
    }
    if (v.decision === 'deshacer') {
      const d = await deshacerPropuesta(correduria.id, v.id, quien)
      if (d.ok) return NextResponse.json({ estado: d.estado, tipo: d.tipo })
      return NextResponse.json({ estado: d.estado }, { status: d.status })
    }
    const r = v.decision === 'modificar'
      ? await resolverPropuesta(correduria.id, v.id, 'modificar', quien, new Date(), { correccion: v.correccion })
      : await resolverPropuesta(correduria.id, v.id, v.decision, quien)
    if (r.ok) return NextResponse.json({ estado: r.estado, tipo: r.tipo, resultado: r.resultado })
    return NextResponse.json({ estado: r.estado, ...(r.motivo ? { motivo: r.motivo } : {}) }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/propuesta', e) }, { status: 500 })
  }
})
