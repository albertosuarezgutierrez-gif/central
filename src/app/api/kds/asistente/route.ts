import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

// POST /api/kds/asistente
// Body: { pregunta: string, historial?: [{role, content}] }
// Responde en lenguaje natural sobre el estado actual de la cocina

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rid = getRestauranteId(req)
  if (!rid)   return NextResponse.json({ error: 'Sin restaurante' }, { status: 401 })

  // Solo cocina, jefe_sala, owner, super_admin
  const rolesPermitidos = ['cocina', 'jefe_sala', 'owner', 'super_admin']
  if (!rolesPermitidos.includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { pregunta, historial = [] } = await req.json()
  if (!pregunta || typeof pregunta !== 'string' || pregunta.trim().length === 0) {
    return NextResponse.json({ error: 'pregunta requerida' }, { status: 400 })
  }

  // ── Obtener turno de servicio activo ──────────────────────────────────────
  const { data: turno } = await supabase
    .from('turnos')
    .select('id, created_at')
    .eq('restaurante_id', rid)
    .eq('estado', 'activo')
    .is('camarero_id', null)
    .maybeSingle()

  // ── Obtener comandas activas (nueva, en_curso) ─────────────────────────────
  const { data: comandas } = await supabase
    .from('comandas')
    .select(`
      id,
      mesa_nombre,
      estado,
      created_at,
      notas,
      comanda_items (
        id,
        nombre,
        cantidad,
        formato_nombre,
        estado,
        notas,
        created_at
      )
    `)
    .eq('restaurante_id', rid)
    .in('estado', ['nueva', 'en_curso'])
    .order('created_at', { ascending: true })

  if (!comandas || comandas.length === 0) {
    return NextResponse.json({
      respuesta: 'Ahora mismo no hay comandas activas en cocina. Todo despejado.',
      comandas_activas: 0,
    })
  }

  // ── Construir contexto para el LLM ────────────────────────────────────────
  const ahora = new Date()

  const resumenComandas = comandas.map(c => {
    const minutos = Math.floor((ahora.getTime() - new Date(c.created_at).getTime()) / 60000)
    const itemsStr = (c.comanda_items ?? []).map((it: {
      nombre: string; cantidad: number; formato_nombre?: string | null;
      estado: string; notas?: string | null; created_at: string
    }) => {
      const formato = it.formato_nombre ? ` (${it.formato_nombre})` : ''
      const nota    = it.notas ? ` [nota: ${it.notas}]` : ''
      const minItem = Math.floor((ahora.getTime() - new Date(it.created_at).getTime()) / 60000)
      return `    - ${it.cantidad}x ${it.nombre}${formato}${nota} · estado: ${it.estado} · hace ${minItem} min`
    }).join('\n')

    return `MESA ${c.mesa_nombre} (comanda ${c.id.slice(0,6)}, estado: ${c.estado}, hace ${minutos} min):\n${itemsStr}`
  }).join('\n\n')

  const totalItems = comandas.reduce((acc, c) => acc + (c.comanda_items?.length ?? 0), 0)
  const turnoInfo  = turno
    ? `Turno activo desde ${new Date(turno.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
    : 'No hay turno de servicio activo registrado.'

  const systemPrompt = `Eres el asistente de cocina de un restaurante español. Tienes acceso al estado actual de todas las comandas activas.

CONTEXTO ACTUAL (${ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}):
${turnoInfo}
Comandas activas: ${comandas.length} | Ítems en cocina: ${totalItems}

ESTADO DE COMANDAS:
${resumenComandas}

INSTRUCCIONES:
- Responde siempre en español, de forma directa y concisa (máx 3-4 líneas).
- Si preguntan por un plato específico, busca exactamente en los datos de arriba.
- Si preguntan por alérgenos, busca en las notas de los ítems (si hay mención).
- Si no sabes algo con certeza, dilo claramente.
- Usa el vocabulario hostelero: "marchar", "mesa la dos", "en pase", etc.
- Sé práctico: el jefe de cocina necesita información rápida y accionable.
- NO inventes datos que no estén en el contexto.`

  // Construir mensajes con historial (máx 6 turnos para no pasarse de tokens)
  const mensajesHistorial = (historial as {role: string; content: string}[])
    .slice(-6)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const userMessage = pregunta.trim()

  // ── Llamar al LLM ─────────────────────────────────────────────────────────
  let respuesta: string
  try {
    // Construir el user text combinando historial y pregunta actual
    const historialTexto = mensajesHistorial.length > 0
      ? mensajesHistorial.map(m => `${m.role === 'user' ? 'Jefe' : 'Asistente'}: ${m.content}`).join('\n') + '\n'
      : ''

    respuesta = await callAI(
      systemPrompt,
      historialTexto + `Jefe: ${userMessage}`,
      300
    )
  } catch (e) {
    console.error('[kds/asistente] Error IA:', e)
    return NextResponse.json({ error: 'Error al consultar la IA' }, { status: 500 })
  }

  return NextResponse.json({
    respuesta: respuesta.trim(),
    comandas_activas: comandas.length,
    items_activos: totalItems,
    timestamp: ahora.toISOString(),
  })
}
