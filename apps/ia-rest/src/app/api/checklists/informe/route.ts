export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

interface TareaPlantilla {
  texto: string
  frecuencia: 'apertura' | 'turno' | 'cierre'
  requiere_foto: boolean
}

// Umbral de carga (mismos cortes que /turno): < 15 comandas = baja.
function clasificarCarga(numComandas: number): 'baja' | 'media' | 'alta' {
  if (numComandas < 15) return 'baja'
  if (numComandas <= 40) return 'media'
  return 'alta'
}

// GET — cumplimiento por sección/empleado para un rango (hoy por defecto).
// query: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (opcionales)
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const url = new URL(req.url)
  const desdeParam = url.searchParams.get('desde')
  const hastaParam = url.searchParams.get('hasta')

  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)
  const desde = desdeParam ? new Date(desdeParam + 'T00:00:00').toISOString() : inicioDia.toISOString()
  const finDia = new Date()
  finDia.setHours(23, 59, 59, 999)
  const hasta = hastaParam ? new Date(hastaParam + 'T23:59:59').toISOString() : finDia.toISOString()

  const [plantillasRes, ejecucionesRes, comandasRes] = await Promise.all([
    supabase
      .from('checklist_plantillas')
      .select('id, seccion, nombre, tareas')
      .eq('restaurante_id', rid)
      .eq('activa', true),
    supabase
      .from('checklist_ejecuciones')
      .select('plantilla_id, seccion, tarea_idx, tarea_texto, estado, personal_id, completed_at')
      .eq('restaurante_id', rid)
      .gte('created_at', desde)
      .lte('created_at', hasta),
    supabase
      .from('comandas')
      .select('id', { count: 'exact', head: true })
      .eq('local_id', rid)
      .gte('created_at', desde)
      .lte('created_at', hasta),
  ])

  const plantillas = plantillasRes.data ?? []
  const ejecuciones = ejecucionesRes.data ?? []
  const numComandas = comandasRes.count ?? 0
  const carga = clasificarCarga(numComandas)

  // Map de tareas hechas: "plantilla_id|tarea_idx" → ejecución
  const hechas = new Map<string, { personal_id: string | null; completed_at: string | null }>()
  for (const e of ejecuciones) {
    if (e.estado === 'hecha') {
      hechas.set(`${e.plantilla_id}|${e.tarea_idx}`, {
        personal_id: e.personal_id ?? null,
        completed_at: e.completed_at ?? null,
      })
    }
  }

  // Cruce plantillas (esperado) vs ejecuciones (real), agrupado por sección.
  const secciones: Array<{
    seccion: string
    total: number
    completadas: number
    pendientes: Array<{ texto: string; frecuencia: string; sin_excusa: boolean }>
    tareas: Array<{
      plantilla_id: string
      tarea_idx: number
      texto: string
      frecuencia: string
      hecha: boolean
      personal_id: string | null
      completed_at: string | null
      sin_excusa: boolean
    }>
  }> = []

  const porSeccion = new Map<string, (typeof secciones)[number]>()

  for (const p of plantillas) {
    const tareas = (Array.isArray(p.tareas) ? p.tareas : []) as TareaPlantilla[]
    if (!porSeccion.has(p.seccion)) {
      porSeccion.set(p.seccion, { seccion: p.seccion, total: 0, completadas: 0, pendientes: [], tareas: [] })
    }
    const grupo = porSeccion.get(p.seccion)!
    tareas.forEach((t, idx) => {
      const hecha = hechas.get(`${p.id}|${idx}`)
      const completada = !!hecha
      // "sin excusa": tarea pendiente y la carga del tramo fue baja
      const sinExcusa = !completada && carga === 'baja'
      grupo.total += 1
      if (completada) grupo.completadas += 1
      else grupo.pendientes.push({ texto: t.texto, frecuencia: t.frecuencia, sin_excusa: sinExcusa })
      grupo.tareas.push({
        plantilla_id: p.id,
        tarea_idx: idx,
        texto: t.texto,
        frecuencia: t.frecuencia,
        hecha: completada,
        personal_id: hecha?.personal_id ?? null,
        completed_at: hecha?.completed_at ?? null,
        sin_excusa: sinExcusa,
      })
    })
  }

  // Cumplimiento por empleado (a partir de las ejecuciones reales)
  const porEmpleado = new Map<string, { personal_id: string; completadas: number }>()
  for (const e of ejecuciones) {
    if (e.estado !== 'hecha' || !e.personal_id) continue
    if (!porEmpleado.has(e.personal_id)) porEmpleado.set(e.personal_id, { personal_id: e.personal_id, completadas: 0 })
    porEmpleado.get(e.personal_id)!.completadas += 1
  }

  return NextResponse.json({
    secciones: Array.from(porSeccion.values()),
    empleados: Array.from(porEmpleado.values()),
    carga,
    num_comandas: numComandas,
    rango: { desde, hasta },
  })
}
