export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { getMenuCache } from '@/lib/brain-cache'

// ── /api/brain/conversar ──────────────────────────────────────────────────────
// Turno conversacional NIM cuando BRAIN tiene confianza baja.
// Cada resolución exitosa se guarda en ia_training_log con calidad=5
// (par de máxima calidad: ambigüedad real + corrección humana en tiempo real).
//
// POST body: {
//   texto_original: string       // lo que dijo el camarero (ambiguo)
//   historial: [{role, content}] // turnos anteriores (máx 4)
//   turno_id?: string
// }
//
// Devuelve: {
//   respuesta: string            // pregunta NIM al camarero (para TTS)
//   resuelto: boolean
//   brain_texto?: string         // si resuelto, texto normalizado para /api/transcribe
//   historial_nuevo: [{role, content}]
// }

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const { texto_original, historial = [], turno_id } = await req.json()
  if (!texto_original?.trim()) return NextResponse.json({ error: 'texto_original requerido' }, { status: 400 })

  const supabase = createServerClient()
  const start = Date.now()

  // ── Contexto de carta (NIM conoce los productos reales) ────────────────────
  let cartaCtx = ''
  try {
    const cache = await getMenuCache(restauranteId)
    if (cache.productos.length > 0) {
      const nombres = cache.productos.map(p => {
        const aliases = p.aliases.length > 1 ? ` [${p.aliases.slice(1).join('/')}]` : ''
        return `${p.nombre}${aliases}`
      }).join(', ')
      cartaCtx = `\nCARTA ACTUAL: ${nombres}`
    }
  } catch { /* continuar sin carta */ }

  // ── Mesas activas ──────────────────────────────────────────────────────────
  let mesasCtx = ''
  try {
    const { data: mesas } = await supabase
      .from('mesas').select('codigo, estado, nombre')
      .eq('local_id', restauranteId)
      .in('estado', ['activa', 'marchar', 'aviso', 'cuenta']).limit(20)
    if (mesas?.length) mesasCtx = `\nMESAS ACTIVAS: ${mesas.map(m => m.codigo).join(', ')}`
  } catch { /* continuar */ }

  // ── System prompt conversacional ───────────────────────────────────────────
  const system = `Eres el asistente de voz de ia.rest, TPV hostelero español.
Un camarero dijo algo ambiguo. Resuélvelo en máximo 2 turnos.
Vocabulario hostelero: marchar=sacar ya, 86=se acabó, cuenta=cobrar.${cartaCtx}${mesasCtx}

REGLAS:
1. Máximo 8 palabras por pregunta. UNA sola cosa a la vez.
2. Si ya tienes info suficiente → resuelto:true con brain_texto normalizado.
3. En el 2º turno SIEMPRE intenta resolver aunque sea con suposición razonable.
4. Tono hostelero: directo, sin formalidades.

RESPONDE SOLO JSON puro (sin markdown):
Si necesitas preguntar: {"respuesta":"pregunta corta","resuelto":false,"brain_texto":null}
Si ya resuelto:         {"respuesta":"confirmación breve","resuelto":true,"brain_texto":"texto normalizado, ej: dos croquetas mesa T04"}

Ejemplos de buenas preguntas:
- "¿Qué mesa?" | "¿Bacalao o rabo?" | "¿Cuántas raciones?" | "¿Con o sin pan?"`

  // ── Construir mensajes con historial ───────────────────────────────────────
  const turnosPrevios = (historial as { role: string; content: string }[]).slice(-4)
  const mensajes: { role: 'user' | 'assistant'; content: string }[] = [
    ...turnosPrevios.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
    { role: 'user', content: texto_original },
  ]

  const raw = await callAI(system, mensajes, 150)
  const latencia = Date.now() - start

  if (!raw) return NextResponse.json({ error: 'NIM sin respuesta' }, { status: 500 })

  let parsed: { respuesta: string; resuelto: boolean; brain_texto?: string | null }
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    parsed = { respuesta: raw.trim().slice(0, 120), resuelto: false, brain_texto: null }
  }

  // Historial actualizado
  const historial_nuevo = [
    ...turnosPrevios,
    { role: 'user', content: texto_original },
    { role: 'assistant', content: parsed.respuesta },
  ]

  // ── Log de entrenamiento ──────────────────────────────────────────────────
  // Siempre guardamos el intento. Si resuelto=true → calidad 5 (máxima).
  // Si solo pregunta → calidad 3 (par incompleto, útil para aprender ambigüedades).
  try {
    const calidad = parsed.resuelto ? 5 : 3
    await supabase.from('ia_training_log').insert({
      restaurante_id: restauranteId,
      input_raw: texto_original,
      input_context: {
        historial_previo: turnosPrevios,
        turno_id: turno_id ?? null,
        camarero_id: session.id,
        num_turno: turnosPrevios.length / 2 + 1, // qué turno de la conversación es
        carta_disponible: cartaCtx.length > 0,
        mesas_activas: mesasCtx.length > 0,
      },
      output_brain: parsed.resuelto ? {
        brain_texto: parsed.brain_texto,
        resolucion: 'nim_conversacional',
        historial_completo: historial_nuevo,
      } : {
        pregunta_nim: parsed.respuesta,
        historial_parcial: historial_nuevo,
      },
      fuente: 'nim_conversacional',
      calidad,
      confianza: parsed.resuelto ? 0.95 : 0.50,
      fue_corregido: parsed.resuelto,   // el camarero "corrigió" su ambigüedad respondiendo
      correccion: parsed.resuelto ? {
        brain_texto_normalizado: parsed.brain_texto,
        confirmado_por: 'camarero_respuesta_voz',
        nim_pregunta: turnosPrevios[turnosPrevios.length - 1]?.content ?? null,
        nim_respuesta: texto_original,
        turnos_necesarios: Math.ceil(historial_nuevo.length / 2),
      } : null,
      nim_historial: historial_nuevo,
      texto_normalizado: parsed.brain_texto ?? null,
      latencia_ms: latencia,
      modelo_usado: 'nvidia/llama-3.3-70b',
      turno_id: turno_id ?? null,
      camarero_id: session.id,
    })
  } catch { /* nunca bloquear el flujo de voz */ }

  return NextResponse.json({
    respuesta: parsed.respuesta,
    resuelto: parsed.resuelto ?? false,
    brain_texto: parsed.brain_texto ?? null,
    historial_nuevo,
  })
}
