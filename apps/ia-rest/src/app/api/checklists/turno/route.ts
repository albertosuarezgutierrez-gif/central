export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

interface TareaPlantilla {
  texto: string
  frecuencia: 'apertura' | 'turno' | 'cierre'
  requiere_foto: boolean
}

// Umbrales de carga del turno (comandas de hoy del restaurante):
//   < 15  comandas → 'baja'
//   15-40 comandas → 'media'
//   > 40  comandas → 'alta'
function clasificarCarga(numComandas: number): 'baja' | 'media' | 'alta' {
  if (numComandas < 15) return 'baja'
  if (numComandas <= 40) return 'media'
  return 'alta'
}

// GET — plantillas activas agrupadas por sección + estado de ejecuciones de hoy
//       + índice de carga del turno leyendo la actividad real (comandas de hoy).
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)
  const desde = inicioDia.toISOString()

  const [plantillasRes, ejecucionesRes, comandasRes] = await Promise.all([
    supabase
      .from('checklist_plantillas')
      .select('id, seccion, nombre, tareas')
      .eq('restaurante_id', rid)
      .eq('activa', true),
    supabase
      .from('checklist_ejecuciones')
      .select('plantilla_id, seccion, tarea_idx, estado, foto_url, personal_id, completed_at')
      .eq('restaurante_id', rid)
      .gte('created_at', desde),
    // Carga real del turno: cuenta comandas de hoy (tabla existente usa local_id)
    supabase
      .from('comandas')
      .select('id', { count: 'exact', head: true })
      .eq('local_id', rid)
      .gte('created_at', desde),
  ])

  const plantillas = plantillasRes.data ?? []
  const ejecuciones = ejecucionesRes.data ?? []
  const numComandas = comandasRes.count ?? 0
  const carga = clasificarCarga(numComandas)

  // Set de "plantilla_id|tarea_idx" ya marcadas hechas hoy
  const hechas = new Map<string, { foto_url: string | null; personal_id: string | null; completed_at: string | null }>()
  for (const e of ejecuciones) {
    if (e.estado === 'hecha') {
      hechas.set(`${e.plantilla_id}|${e.tarea_idx}`, {
        foto_url: e.foto_url ?? null,
        personal_id: e.personal_id ?? null,
        completed_at: e.completed_at ?? null,
      })
    }
  }

  // Agrupar por sección
  const porSeccion = new Map<string, { seccion: string; tareas: Array<{
    plantilla_id: string
    nombre: string | null
    tarea_idx: number
    texto: string
    frecuencia: string
    requiere_foto: boolean
    hecha: boolean
    foto_url: string | null
  }> }>()

  for (const p of plantillas) {
    const tareas = (Array.isArray(p.tareas) ? p.tareas : []) as TareaPlantilla[]
    if (!porSeccion.has(p.seccion)) porSeccion.set(p.seccion, { seccion: p.seccion, tareas: [] })
    const grupo = porSeccion.get(p.seccion)!
    tareas.forEach((t, idx) => {
      const hecha = hechas.get(`${p.id}|${idx}`)
      grupo.tareas.push({
        plantilla_id: p.id,
        nombre: p.nombre ?? null,
        tarea_idx: idx,
        texto: t.texto,
        frecuencia: t.frecuencia,
        requiere_foto: !!t.requiere_foto,
        hecha: !!hecha,
        foto_url: hecha?.foto_url ?? null,
      })
    })
  }

  return NextResponse.json({
    secciones: Array.from(porSeccion.values()),
    carga,
    num_comandas: numComandas,
  })
}
