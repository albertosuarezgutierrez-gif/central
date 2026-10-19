import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { enviarPropuestaLead, pendientesPropuestaLead, revisarPropuestaLead } from '@/lib/propuesta-lead'
import { validarPeticionPropuesta } from '@/lib/propuesta-lead-puro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * `POST /api/operador/correo/propuesta-lead` (19/10/2026, F4) — la PROPUESTA de un lead de correo. Lo llama plataforma:
 * `pendientes`/`revisar` desde el triaje (gratis, solo lee) y `enviar` SOLO tras «📤 Enviar» de Alberto en Telegram.
 * Ver `lib/propuesta-lead.ts`. 🚨 Nada de Codeoscopic (0,50€) ni de IA.
 *   { accion:'pendientes', actor } → 200 { estado:'ok', propuestas[] } | 503 sin_tabla
 *   { accion:'revisar', hiloId, actor } → 200 { estado:'ok', propuesta } | 404 sin_hilo | 409 sin_precios | 503 sin_tabla
 *   { accion:'enviar', hiloId, clave, primaEur, to, asunto, texto, enRespuestaA, idempotencia, actor }
 *     → 200 enviado | 404/409/503 no_enviado (con motivo: NO salió) | 502 fallo_envio (no consta que saliera)
 * Respuestas con nombre de pila, compañías, primas y códigos de opción: ningún dato personal más.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = validarPeticionPropuesta(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const p = v.valor
    if (p.accion === 'pendientes') {
      const r = await pendientesPropuestaLead(correduria.id)
      return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 503 })
    }
    if (p.accion === 'revisar') {
      const r = await revisarPropuestaLead(correduria.id, p.hiloId)
      const status = r.estado === 'ok' ? 200 : r.estado === 'sin_hilo' ? 404 : r.estado === 'sin_precios' ? 409 : 503
      return NextResponse.json(r, { status })
    }
    const r = await enviarPropuestaLead(correduria.id, p)
    const status = r.estado === 'enviado' ? 200 : r.estado === 'no_enviado' ? r.status : 502
    return NextResponse.json(r, { status })
  } catch (e) {
    // Un fallo ANTES de enviar (BD, PII) no ha mandado nada; después de enviar, `enviarPropuestaLead` no lanza.
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/propuesta-lead', e) }, { status: 500 })
  }
})
