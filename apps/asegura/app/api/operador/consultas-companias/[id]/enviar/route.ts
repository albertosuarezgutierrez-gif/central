import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { enviarConsulta } from '@/lib/consulta-compania-flujo'
import { puertosConsulta } from '@/lib/consulta-compania-bd'
import { actorDe, correduriaDeLaPeticion, respuesta } from '@/lib/consulta-compania-ruta'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'

export const dynamic = 'force-dynamic'
// SMTP de Gmail con adjuntos: margen sobre el tope de 60 s con el que llama plataforma.
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/**
 * `POST /api/operador/consultas-companias/[id]/enviar` { correduriaId?, confirmar: true } (15/10/2026, fase 1)
 *
 * El OK de Alberto para ESTE envío (regla «comunicaciones salientes»): sin `confirmar: true`, 400 y no sale nada.
 * Asegura sustituye aquí los marcadores con el DNI DESCIFRADO, manda por el SMTP de Gmail como hola@grupoasegura.es
 * (`CONSULTAS_MAIL_FROM`) con `[ASG-XXXX]` en el asunto, guarda el Message-ID y pasa a `enviada` SOLO si el SMTP
 * aceptó; deja fila en `historial_interno` y `oportunidad_historial` (con «se envió identidad…» si la hubo).
 *   503 `canal_no_disponible` = faltan GMAIL_USER/GMAIL_APP_PASSWORD (reintentar no arregla) ·
 *   502 `envio_fallido` = el SMTP no aceptó (sigue en borrador) · 409 = ya enviada o envío en curso ·
 *   500 `enviada_sin_registrar` = el correo SALIÓ pero no se registró (no reenviar) · 403 = no lo pide una persona.
 * Solo una PERSONA con sesión (`x-actor: humano:<cuentaId>`) envía: ni un agente ni un cron (nada sale solo).
 */
export const POST = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || b.confirmar !== true) {
    return NextResponse.json({ estado: 'invalido', motivo: 'hace falta confirmar: true (el OK de Alberto para este envío)' }, { status: 400 })
  }
  if (leerActor(req.headers.get(CABECERA_ACTOR)).tipo !== 'humano') {
    return NextResponse.json({ estado: 'actor_no_humano', motivo: 'una consulta a una compañía la envía una persona con sesión, no un agente ni un cron' }, { status: 403 })
  }
  try {
    const c = await correduriaDeLaPeticion(b.correduriaId)
    if (!c.ok) return c.res
    const actor = actorDe(req)
    return respuesta(await enviarConsulta(puertosConsulta(actor), c.id, id, actor), (consulta) => ({ consulta }))
  } catch (err) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/consultas-companias/enviar', err) }, { status: 500 })
  }
})
