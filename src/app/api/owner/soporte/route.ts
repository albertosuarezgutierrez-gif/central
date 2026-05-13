// src/app/api/owner/soporte/route.ts
// Chat de soporte IA para propietarios de restaurante
//
// GET  ?ticket_id=xxx  → mensajes de un ticket
// GET  (sin params)    → lista de tickets del restaurante
// POST { texto, ticket_id? } → enviar mensaje y obtener respuesta IA
// PATCH { ticket_id, estado } → cerrar / escalar ticket

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

const sb = () => createServerClient()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── System prompt del agente de soporte ──────────────────────────────────────
function buildSystemPrompt(diagnostico: Record<string, unknown>, restauranteNombre: string): string {
  return `Eres el asistente de soporte técnico de ia.rest, un TPV con IA para restaurantes españoles.
Ayudas al propietario del restaurante "${restauranteNombre}" a resolver dudas e incidencias.

ESTADO ACTUAL DEL SISTEMA (datos en tiempo real):
${JSON.stringify(diagnostico, null, 2)}

CÓMO RESPONDER:
- Sé directo, claro y usa lenguaje sencillo. Sin tecnicismos innecesarios.
- Si el problema es del sistema (errores en los datos de arriba): explica qué ha fallado y los pasos exactos para solucionarlo.
- Si el sistema está en verde y hay un problema: probablemente es la red WiFi, la impresora o el dispositivo — guía al propietario a comprobarlo.
- Pasos numerados cuando hay que hacer algo. Máximo 4-5 pasos.
- Si no puedes resolver el problema con estos datos, di claramente: "Esto necesita que Alberto lo revise directamente" y el propietario recibirá atención personalizada.

PROBLEMAS MÁS COMUNES Y SUS SOLUCIONES:
1. No imprime: comprobar que el PC/tablet del bridge está encendido y en la misma red WiFi. Ir a /owner → Auditoría → Sistema para ver el estado del bridge.
2. Las comandas no llegan a cocina: verificar que hay turno activo en /owner → Servicio → Turno. Si no hay turno, abrirlo.
3. La app no carga: limpiar caché del navegador o reinstalar la PWA. Comprobar conexión a internet.
4. PIN no funciona: ir a /owner → Sala → Camareros y verificar que el camarero está activo.
5. No se generan facturas VeriFactu: ir a /owner → Config → Restaurante y comprobar que NIF y Razón Social están configurados.

Responde en español. Sé empático — los restaurantes trabajan bajo mucha presión.`
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const rid = getRestauranteId(req)
  const ticketId = req.nextUrl.searchParams.get('ticket_id')

  if (ticketId) {
    // Mensajes de un ticket concreto
    const { data, error } = await sb()
      .from('soporte_mensajes')
      .select('id, rol, texto, created_at')
      .eq('ticket_id', ticketId)
      .eq('restaurante_id', rid)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ mensajes: data ?? [] })
  }

  // Lista de tickets del restaurante
  const { data, error } = await sb()
    .from('soporte_tickets')
    .select('id, asunto, estado, created_at, updated_at')
    .eq('restaurante_id', rid)
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets: data ?? [] })
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rid = getRestauranteId(req)
  const session = getSession(req)
  const { texto, ticket_id } = await req.json()

  if (!texto?.trim()) {
    return NextResponse.json({ error: 'texto requerido' }, { status: 400 })
  }

  // 1. Obtener o crear ticket
  let ticketId = ticket_id
  if (!ticketId) {
    const asunto = texto.length > 80 ? texto.slice(0, 77) + '…' : texto
    const { data: nuevoTicket, error: errTicket } = await sb()
      .from('soporte_tickets')
      .insert({ restaurante_id: rid, asunto })
      .select('id')
      .single()
    if (errTicket) return NextResponse.json({ error: errTicket.message }, { status: 500 })
    ticketId = nuevoTicket.id
  }

  // 2. Guardar mensaje del usuario
  await sb().from('soporte_mensajes').insert({
    ticket_id: ticketId,
    restaurante_id: rid,
    rol: 'usuario',
    texto: texto.trim(),
  })

  // 3. Obtener estado del sistema del restaurante para contexto IA
  let diagnostico: Record<string, unknown> = {}
  try {
    const diagRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'supabase.co')}/`,
      { method: 'GET' }
    )
    // Llamada interna a la route de diagnóstico
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    const diagFetch = await fetch(`${baseUrl}/api/owner/diagnostico`, {
      headers: { 'x-ia-restaurante-id': rid },
    })
    if (diagFetch.ok) diagnostico = await diagFetch.json()
  } catch { /* si falla el diagnóstico, la IA responde sin contexto */ }

  // 4. Obtener nombre del restaurante
  const { data: rest } = await sb()
    .from('restaurantes')
    .select('nombre')
    .eq('id', rid)
    .single()
  const restauranteNombre = rest?.nombre ?? 'Restaurante'

  // 5. Obtener historial de la conversación para contexto
  const { data: historial } = await sb()
    .from('soporte_mensajes')
    .select('rol, texto')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .limit(20)

  const mensajesHistorial = (historial ?? []).map(m => ({
    role: m.rol === 'usuario' ? 'user' as const : 'assistant' as const,
    content: m.texto,
  }))

  // 6. Llamar a Claude
  let respuestaIA = 'Lo siento, en este momento no puedo procesar tu consulta. Por favor, inténtalo de nuevo en unos minutos.'
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: buildSystemPrompt(diagnostico, restauranteNombre),
      messages: mensajesHistorial,
    })
    if (msg.content[0].type === 'text') {
      respuestaIA = msg.content[0].text
    }
  } catch (e) {
    console.error('[soporte-ia] Error llamando a Anthropic:', e)
  }

  // 7. Guardar respuesta de la IA
  await sb().from('soporte_mensajes').insert({
    ticket_id: ticketId,
    restaurante_id: rid,
    rol: 'ia',
    texto: respuestaIA,
  })

  // 8. Si la IA indica escalado, marcar el ticket
  const necesitaEscalado = respuestaIA.toLowerCase().includes('alberto lo revise')
  if (necesitaEscalado) {
    await sb().from('soporte_tickets')
      .update({ estado: 'escalado' })
      .eq('id', ticketId)
  }

  return NextResponse.json({
    ok: true,
    ticket_id: ticketId,
    respuesta: respuestaIA,
    escalado: necesitaEscalado,
  })
}

// ── PATCH — cerrar o escalar ticket ──────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { ticket_id, estado } = await req.json()
  if (!ticket_id || !estado) {
    return NextResponse.json({ error: 'ticket_id y estado requeridos' }, { status: 400 })
  }
  const { error } = await sb()
    .from('soporte_tickets')
    .update({ estado, resuelto_por: estado === 'resuelto' ? 'usuario' : undefined })
    .eq('id', ticket_id)
    .eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
