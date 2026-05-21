export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI } from '@/lib/ai-client'

export const maxDuration = 30

/**
 * POST /api/kds/asistente
 * Body: { pregunta: string }
 *
 * Asistente IA para el jefe de cocina.
 * Vocabulario estructurado + few-shot examples para respuestas consistentes.
 */

// ── Vocabulario estructurado (igual que buildWhisperPrompt para camarero) ──
const PATRONES_COCINA = `
PATRONES DE CONSULTA RECONOCIDOS:
- "¿Cuántos [producto] pendientes?" → cuenta unidades de ese producto en comandas activas
- "¿Qué tiene la mesa [número/código]?" → lista ítems de esa mesa
- "¿Hay alérgicos?" / "¿[mesa] tiene alergia?" → busca notas de alérgenos
- "¿Qué lleva más tiempo?" / "¿Mesa más antigua?" → comanda con mayor tiempo en cocina
- "¿Cuánto queda de [producto]?" / "¿Stock bajo?" → consulta stock_articulos
- "¿Qué elaboraciones caducan?" → elaboraciones próximas a caducar
- "¿Cómo va [partida]?" → resumen de una sección concreta (caliente/fría/barra)
`

// ── Few-shot examples para calibrar respuestas ────────────────────────────
const FEW_SHOT = `
EJEMPLOS DE RESPUESTA CORRECTA:

Usuario: ¿Cuántos solomillos pendientes?
Asistente: 3 solomillos pendientes: mesa T4 (2 uds, 12 min), mesa S2 (1 ud, 6 min).

Usuario: ¿La mesa 4 tiene alérgicos?
Asistente: Sí. Mesa S4 tiene nota: "sin gluten en todo". Atención al emplatado.

Usuario: ¿Qué lleva más tiempo sin salir?
Asistente: Mesa T3 lleva 34 min. Tiene: 2 croquetas + 1 merluza. Revisar.

Usuario: ¿Hay stock bajo de algo?
Asistente: Sí. Merluza filete: 0.4 kg (mínimo 0.5 kg). Barra de pan: 3 ud.

Usuario: ¿Qué tiene la mesa S2?
Asistente: Mesa S2 pendiente: 1 secreto ibérico (desde hace 8 min), 2 patatas bravas.

Usuario: ¿Hay algo a punto de caducar?
Asistente: Sí. Ensaladilla rusa (lote 20260520-001) caduca en 3 horas. Recomienda.

Usuario: ¿Cómo va la cocina caliente?
Asistente: Cocina caliente: 4 comandas activas. La más antigua T3 (34 min). Total: 11 ítems pendientes.
`

export async function POST(req: NextRequest) {
  try {
    const sesStr = req.headers.get('x-ia-session')
    if (!sesStr) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
    let session: { restaurante_id: string; nombre?: string } | null = null
    try { session = JSON.parse(sesStr) } catch { return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 }) }
    if (!session?.restaurante_id) return NextResponse.json({ error: 'Sin restaurante' }, { status: 401 })
    const rid = session.restaurante_id

    const { pregunta } = await req.json()
    if (!pregunta?.trim()) return NextResponse.json({ error: 'Pregunta requerida' }, { status: 400 })

    const supabase = createServerClient()

    // ── Cargar contexto real ──────────────────────────────────────────────

    // Comandas activas con items
    const { data: comandas } = await supabase
      .from('comandas')
      .select(`
        id, estado, tipo, created_at, nota_general,
        mesas(codigo, zona),
        nombre_cuenta,
        comanda_items(nombre, cantidad, notas, seccion_id)
      `)
      .eq('restaurante_id', rid)
      .in('estado', ['en_cocina', 'en_curso', 'nueva'])
      .order('created_at', { ascending: true })

    // Stock bajo
    const { data: stockBajo } = await supabase
      .from('stock_articulos')
      .select('nombre, stock_actual, stock_minimo, unidad_compra')
      .eq('restaurante_id', rid)
      .eq('alerta_activa', true)
      .eq('activo', true)

    // Elaboraciones próximas a caducar (< 24h)
    const en24h = new Date(Date.now() + 24 * 3600000).toISOString()
    const { data: elaboraciones } = await supabase
      .from('elaboraciones_propias')
      .select('nombre, lote, fecha_caducidad, horas_restantes, urgencia')
      .eq('restaurante_id', rid)
      .eq('estado', 'activa')
      .lte('fecha_caducidad', en24h)
      .order('fecha_caducidad', { ascending: true })

    // ── Construir contexto ────────────────────────────────────────────────
    const ahora = new Date()
    const hora  = ahora.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

    const comandasCtx = (comandas ?? []).map(c => {
      const mesa = (c.mesas as { codigo?: string } | null)
      const mesaLabel = mesa?.codigo ?? (c.nombre_cuenta ? `★${c.nombre_cuenta}` : '?')
      const minutos = Math.floor((ahora.getTime() - new Date(c.created_at).getTime()) / 60000)
      const items = (c.comanda_items as { nombre: string; cantidad: number; notas?: string | null }[] ?? [])
        .map(it => `${it.cantidad}x ${it.nombre}${it.notas ? ` [${it.notas}]` : ''}`)
        .join(', ')
      return `Mesa ${mesaLabel} | ${minutos}min | ${c.estado} | ${items}${c.nota_general ? ` | NOTA: ${c.nota_general}` : ''}`
    }).join('\n')

    const stockCtx = (stockBajo ?? []).length > 0
      ? 'STOCK BAJO:\n' + stockBajo!.map(s => `  ${s.nombre}: ${s.stock_actual} ${s.unidad_compra} (mín ${s.stock_minimo})`).join('\n')
      : ''

    const elaborCtx = (elaboraciones ?? []).length > 0
      ? 'ELABORACIONES PRÓXIMAS A CADUCAR:\n' + elaboraciones!.map(e => {
          const h = Math.round((new Date(e.fecha_caducidad).getTime() - Date.now()) / 3600000)
          return `  ${e.nombre} (lote ${e.lote}) — caduca en ${h}h [${e.urgencia}]`
        }).join('\n')
      : ''

    const contexto = comandasCtx.length > 0
      ? `COMANDAS ACTIVAS:\n${comandasCtx}\n\n${stockCtx}\n${elaborCtx}`.trim()
      : `No hay comandas activas.\n${stockCtx}\n${elaborCtx}`.trim()

    // ── Llamar al LLM con vocabulario estructurado + few-shot ─────────────
    const respuesta = await callAI(
      `Eres el asistente de cocina de ia.rest. Hora: ${hora}.
Respondes preguntas del jefe de cocina sobre el estado en tiempo real.
Respuestas directas, máximo 3 líneas, en español hostelero natural.
Usa los datos del contexto — nunca inventes información.
Si no hay datos suficientes, dilo directamente.

${PATRONES_COCINA}

${FEW_SHOT}`,
      `ESTADO ACTUAL:\n${contexto}\n\nPREGUNTA: ${pregunta.trim()}`,
      400
    )

    // ── Guardar en ia_training_log para nutrir la IA ──────────────────────
    // Acumula pares pregunta/respuesta reales para mejorar el modelo
    await supabase.from('ia_training_log').insert({
      tipo: 'asistente_cocina',
      metadata: {
        pregunta:    pregunta.trim(),
        respuesta:   respuesta.trim(),
        restaurante: rid,
        hora,
        comandas_activas: (comandas ?? []).length,
        ts: ahora.toISOString(),
      },
    }).then(() => null, () => null) // fire and forget

    return NextResponse.json({ ok: true, respuesta: respuesta.trim() })

  } catch (err) {
    console.error('[KDS-ASISTENTE]', err)
    return NextResponse.json({ error: 'Error del asistente' }, { status: 500 })
  }
}
