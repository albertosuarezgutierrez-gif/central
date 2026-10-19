import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { enviarPeticionLead, validarEnvioLead } from '@/lib/correo-lead'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * `POST /api/operador/correo/lead` (19/10/2026) — responde a un lead EN EL HILO de su correo (petición de datos).
 *   { clienteId, oportunidadIds[], to, asunto, texto, enRespuestaA:{messageId, references[]}, idempotencia, actor }
 * Lo llama plataforma solo tras el «✅ Enviar» de Alberto en Telegram. `to` tiene que ser un email de la ficha
 * (índice ciego): si no, 409 y no sale nada. Ver `lib/correo-lead.ts`.
 *   200 { estado:'enviado', historial, hilo } · 400 inválido · 404 no_encontrado · 409 email_no_es_de_la_ficha |
 *   baja_de_correos · 502 rechazado (el proveedor dijo que no) · 503 sin_proveedor | sin_configurar
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = validarEnvioLead(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await enviarPeticionLead(correduria.id, v.valor)
    const status = r.estado === 'enviado' ? 200 : r.estado === 'no_encontrado' ? 404
      : r.estado === 'email_no_es_de_la_ficha' || r.estado === 'baja_de_correos' ? 409
      : r.estado === 'sin_proveedor' ? 503 : 502
    return NextResponse.json(r, { status })
  } catch (e) {
    // Un fallo ANTES de enviar (BD, PII) no ha mandado nada; después de enviar, `enviarPeticionLead` no lanza.
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/lead', e) }, { status: 500 })
  }
})
