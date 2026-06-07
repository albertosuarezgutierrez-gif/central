export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

// ── Criterios IA específicos por rol ──────────────────────────────────────
const CRITERIOS_POR_ROL: Record<string, string> = {
  camarero:         'Experiencia en sala, atención al cliente, manejo de POS/TPV, idiomas, carta de vinos, trabajo bajo presión en servicios de alta carga.',
  jefe_sala:        'Gestión y liderazgo de equipo, resolución de conflictos, control de caja y cierres, coordinación cocina-sala, experiencia previa como jefe.',
  cocina:           'Partidas dominadas (fría/caliente/postres), certificado manipulador alimentos / APPCC, tipos de cocina, experiencia en brigadas, jornadas partidas.',
  ayudante_cocina:  'Polivalencia, certificado manipulador alimentos, disponibilidad horaria amplia, trabajo físico prolongado, capacidad de aprendizaje.',
  running:          'Agilidad y rapidez en servicio, comunicación con sala y cocina, capacidad de trabajar en equipo, disponibilidad turnos completos.',
  barra:            'Coctelería y cafetería, conocimiento de destilados y vinos, agilidad con cuentas y cobros, atención rápida al cliente.',
  limpieza:         'Disponibilidad horaria (especialmente mañanas / noche tras cierre), experiencia en hostelería, referencias verificables, responsabilidad.',
  encargado:        'Gestión de inventario y almacén, elaboración de turnos, resolución de incidencias, formación de nuevos empleados, control de costes.',
  otro:             'Experiencia general en hostelería, polivalencia, actitud y disponibilidad.',
}

// ── Prompt IA ─────────────────────────────────────────────────────────────
function buildPrompt(rol: string, cvTexto: string): string {
  const criterios = CRITERIOS_POR_ROL[rol] ?? CRITERIOS_POR_ROL['otro']
  return `Eres un experto en RRHH para hostelería española. Analiza el siguiente CV para el puesto de "${rol}".

CRITERIOS PRIORITARIOS PARA ESTE PUESTO:
${criterios}

CV DEL CANDIDATO:
${cvTexto}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques markdown, con esta estructura exacta:
{
  "score": <número 0-100 según idoneidad para el puesto>,
  "experiencia_anos": <años totales en hostelería, 0 si no hay>,
  "idiomas": [{"idioma": "español", "nivel": "nativo"}, ...],
  "puntos_fuertes": ["punto 1", "punto 2", ...],
  "puntos_debiles": ["punto 1", "punto 2", ...],
  "alerta": "<señal de alerta o null si no hay — ej: gap laboral sin explicar, cambios frecuentes de trabajo>",
  "recomendacion": "<contratar|segunda_entrevista|descartar>",
  "resumen": "<párrafo de 2-3 frases en español valorando al candidato para este puesto concreto>"
}`
}

// ── GET /api/rrhh/candidatos ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const roles = ['owner', 'admin', 'jefe_sala', 'super_admin']
  if (!roles.includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const rid = getRestauranteId(req)
  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const rol_solicitado = searchParams.get('rol')

  const supabase = createServerClient()

  let q = supabase
    .from('v_candidatos_con_analisis')
    .select('*')
    .eq('local_id', rid)
    .order('fecha_subida', { ascending: false })

  if (estado) q = q.eq('estado', estado)
  if (rol_solicitado) q = q.eq('rol_solicitado', rol_solicitado)

  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ candidatos: data })
}

// ── POST /api/rrhh/candidatos ─────────────────────────────────────────────
// Body: { nombre, email?, telefono?, rol_solicitado, cv_texto }
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const roles = ['owner', 'admin', 'jefe_sala', 'super_admin']
  if (!roles.includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const rid = getRestauranteId(req)
  const body = await req.json()
  const { nombre, email, telefono, rol_solicitado, cv_texto } = body

  if (!nombre || !rol_solicitado || !cv_texto) {
    return NextResponse.json(
      { error: 'Faltan campos: nombre, rol_solicitado, cv_texto' },
      { status: 400 }
    )
  }

  const supabase = createServerClient()

  // 1. Crear candidato
  const { data: candidato, error: errCand } = await supabase
    .from('candidatos')
    .insert({ local_id: rid, nombre, email, telefono, rol_solicitado, cv_texto })
    .select('id')
    .single()

  if (errCand || !candidato) {
    return NextResponse.json({ error: errCand?.message ?? 'Error creando candidato' }, { status: 500 })
  }

  // 2. Analizar CV con IA
  let analisis: Record<string, unknown> = {}
  let modeloUsado = 'nim_70b'

  try {
    const prompt = buildPrompt(rol_solicitado, cv_texto)
    const raw = await callAI('Eres un experto en RRHH para hostelería española. Responde solo en JSON.', prompt)

    const clean = raw.replace(/```json|```/g, '').trim()
    analisis = JSON.parse(clean)
  } catch (e) {
    console.error('[RRHH] Error analizando CV:', e)
    // No bloquear — candidato se guarda igual, sin análisis
    return NextResponse.json({ candidato_id: candidato.id, analisis: null, aviso: 'CV guardado, análisis IA falló' })
  }

  // 3. Guardar análisis
  const { error: errAnal } = await supabase
    .from('cv_analisis')
    .insert({
      candidato_id:     candidato.id,
      local_id:   rid,
      score:            Number(analisis.score) || null,
      experiencia_anos: Number(analisis.experiencia_anos) || 0,
      idiomas:          analisis.idiomas ?? [],
      puntos_fuertes:   analisis.puntos_fuertes ?? [],
      puntos_debiles:   analisis.puntos_debiles ?? [],
      alerta:           analisis.alerta ?? null,
      recomendacion:    analisis.recomendacion ?? null,
      resumen:          analisis.resumen ?? null,
      raw_datos:        analisis,
      modelo_usado:     modeloUsado,
    })

  if (errAnal) {
    console.error('[RRHH] Error guardando análisis:', errAnal)
  }

  return NextResponse.json({ candidato_id: candidato.id, analisis })
}
