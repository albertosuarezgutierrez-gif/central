import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { validarSalientePrevisto } from '@/lib/whatsapp/vinculo'
import { registrarSalientePrevisto } from '@/lib/whatsapp/salientes'

export const dynamic = 'force-dynamic'

/**
 * Plataforma REGISTRA aquí cada `wa.me` que el corredor abre (spec 2026-11-04 §4; parte B cambia sus `onAbrir`).
 *   POST { telefono, origen, texto?, clienteId?, reciboId?, oportunidadId?, polizaId?, solicitudId? }
 *     origen: recibo_devuelto (exige reciboId) · lead | presupuesto | renovacion (exigen oportunidadId) ·
 *             solicitud_datos (exige solicitudId) · recaptacion · generico (D3: el BotonWhatsapp sin plantilla, texto opcional)
 *   → 201 { estado:'ok', id } · 400/422 invalido · 404 ancla de otra correduría · 503 sin_migracion | sin_clave_pii
 * El texto y el teléfono NO se guardan: solo el sha256 del texto normalizado y el índice ciego del teléfono. No se envía nada.
 * Registrar NO es enviar: plataforma abre el wa.me igual aunque esto falle (no debe bloquear el botón).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const v = validarSalientePrevisto(body)
  if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const abiertoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await registrarSalientePrevisto(correduria.id, v.entrada, abiertoPor)
    if (r.ok) return NextResponse.json({ estado: 'ok', id: r.id }, { status: 201 })
    const status = r.estado === 'invalido' ? 422 : r.estado === 'no_encontrado' ? 404 : 503
    return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/saliente-previsto', e) }, { status: 500 })
  }
})
