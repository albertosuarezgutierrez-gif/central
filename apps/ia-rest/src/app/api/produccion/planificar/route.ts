export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

interface ItemPlan {
  elaboracion_nombre: string
  cantidad: number
  seccion_cocina_id?: string | null
}
interface Cocinero {
  personal_id: string
  nombre: string
}

// Estima minutos/unidad de una elaboración con IA (cuando no hay tiempo estándar).
async function estimarMinutosPorUnidad(elaboracion: string): Promise<number> {
  try {
    const sys = 'Eres un jefe de cocina experto en tiempos de producción de cocina profesional española. Responde SOLO con JSON.'
    const usr = `Estima los minutos de trabajo de cocina que lleva producir UNA unidad/ración de: "${elaboracion}".
Responde SOLO con JSON válido: {"minutos_por_unidad": number}. Sé realista (entre 1 y 120 minutos).`
    const raw = await callAI(sys, usr, 120, 15000)
    const json = JSON.parse(cleanJSON(raw))
    const m = Number(json.minutos_por_unidad)
    if (Number.isFinite(m) && m > 0 && m <= 600) return m
  } catch (e) {
    console.warn('[produccion/planificar] estimarMinutos IA falló:', (e as Error).message)
  }
  return 10 // fallback conservador
}

interface TareaCalculada extends ItemPlan {
  tiempo_estimado_min: number
}

// Reparte y secuencia tareas entre cocineros equilibrando carga con IA.
// Devuelve un mapa idx -> { personal_id, orden }. Fallback round-robin determinista.
async function repartirTareas(
  tareas: TareaCalculada[],
  cocineros: Cocinero[]
): Promise<Array<{ personal_id: string; orden: number }>> {
  // Fallback round-robin determinista (equilibra por tiempo acumulado)
  const fallback = (): Array<{ personal_id: string; orden: number }> => {
    const carga = new Map<string, number>(cocineros.map(c => [c.personal_id, 0]))
    const ordenPorCocinero = new Map<string, number>(cocineros.map(c => [c.personal_id, 0]))
    // Asigna cada tarea (de mayor a menor) al cocinero menos cargado
    const idxOrdenado = tareas
      .map((t, i) => ({ i, min: t.tiempo_estimado_min }))
      .sort((a, b) => b.min - a.min)
    const out: Array<{ personal_id: string; orden: number }> = new Array(tareas.length)
    for (const { i } of idxOrdenado) {
      let best = cocineros[0].personal_id
      let bestCarga = Infinity
      for (const c of cocineros) {
        const cg = carga.get(c.personal_id)!
        if (cg < bestCarga) { bestCarga = cg; best = c.personal_id }
      }
      carga.set(best, carga.get(best)! + tareas[i].tiempo_estimado_min)
      const ord = ordenPorCocinero.get(best)! + 1
      ordenPorCocinero.set(best, ord)
      out[i] = { personal_id: best, orden: ord }
    }
    return out
  }

  if (cocineros.length === 0) return tareas.map((_, i) => ({ personal_id: '', orden: i + 1 }))

  try {
    const sys = 'Eres un jefe de cocina que organiza el mise en place repartiendo tareas entre cocineros equilibrando la carga de trabajo total (minutos). Responde SOLO con JSON.'
    const usr = `Reparte estas tareas entre los cocineros equilibrando los minutos totales por cocinero y secuenciando (orden) las tareas de cada uno.

TAREAS (por índice):
${tareas.map((t, i) => `${i}: ${t.elaboracion_nombre} x${t.cantidad} (~${t.tiempo_estimado_min} min)`).join('\n')}

COCINEROS:
${cocineros.map(c => `- ${c.personal_id}: ${c.nombre}`).join('\n')}

Responde SOLO con JSON válido con esta forma exacta (un objeto por cada índice de tarea):
{"asignaciones": [{"tarea_idx": 0, "personal_id": "<id>", "orden": 1}, ...]}`
    const raw = await callAI(sys, usr, 800, 20000)
    const json = JSON.parse(cleanJSON(raw))
    const asignaciones = Array.isArray(json.asignaciones) ? json.asignaciones : []
    const validIds = new Set(cocineros.map(c => c.personal_id))
    const out: Array<{ personal_id: string; orden: number }> = new Array(tareas.length)
    for (const a of asignaciones) {
      const idx = Number(a.tarea_idx)
      if (!Number.isInteger(idx) || idx < 0 || idx >= tareas.length) continue
      if (!validIds.has(a.personal_id)) continue
      out[idx] = { personal_id: a.personal_id, orden: Number(a.orden) || idx + 1 }
    }
    // Si la IA dejó alguna tarea sin asignar, completa con fallback
    if (out.some(x => !x)) {
      const fb = fallback()
      for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = fb[i]
    }
    return out
  } catch (e) {
    console.warn('[produccion/planificar] reparto IA falló, fallback round-robin:', (e as Error).message)
    return fallback()
  }
}

// POST — planifica la producción del día.
// body { fecha?, items: [{elaboracion_nombre, cantidad, seccion_cocina_id?}], cocineros: [{personal_id, nombre}] }
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { fecha, items, cocineros } = body as {
    fecha?: string
    items?: ItemPlan[]
    cocineros?: Cocinero[]
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items requerido' }, { status: 400 })
  }
  const cocinerosList: Cocinero[] = Array.isArray(cocineros) ? cocineros : []
  const fechaPlan = fecha ?? new Date().toISOString().slice(0, 10)

  // 1. Tiempos estándar existentes para este restaurante
  const { data: estandares } = await supabase
    .from('produccion_tiempos_estandar')
    .select('elaboracion_nombre, minutos_por_unidad')
    .eq('restaurante_id', rid)

  const estandarMap = new Map<string, number>()
  for (const e of estandares ?? []) {
    estandarMap.set(e.elaboracion_nombre.toLowerCase().trim(), Number(e.minutos_por_unidad))
  }

  // 2. Calcula tiempo estimado por item (estándar o IA → guarda el estándar nuevo)
  const tareas: TareaCalculada[] = []
  for (const it of items) {
    const nombre = (it.elaboracion_nombre ?? '').trim()
    if (!nombre) continue
    const cantidad = Number(it.cantidad) || 0
    const key = nombre.toLowerCase().trim()
    let minutosUnidad = estandarMap.get(key)
    if (minutosUnidad == null) {
      minutosUnidad = await estimarMinutosPorUnidad(nombre)
      estandarMap.set(key, minutosUnidad)
      // Persistir el estándar estimado para reutilizarlo
      await supabase.from('produccion_tiempos_estandar').insert({
        restaurante_id: rid,
        elaboracion_nombre: nombre,
        minutos_por_unidad: minutosUnidad,
      })
    }
    tareas.push({
      elaboracion_nombre: nombre,
      cantidad,
      seccion_cocina_id: it.seccion_cocina_id ?? null,
      tiempo_estimado_min: Math.round(minutosUnidad * cantidad),
    })
  }

  if (tareas.length === 0) {
    return NextResponse.json({ error: 'No hay items válidos' }, { status: 400 })
  }

  // 3. Reparto + secuencia entre cocineros
  const reparto = await repartirTareas(tareas, cocinerosList)

  // 4. Insertar filas en produccion_tareas
  const filas = tareas.map((t, i) => ({
    restaurante_id: rid,
    fecha: fechaPlan,
    seccion_cocina_id: t.seccion_cocina_id,
    elaboracion_nombre: t.elaboracion_nombre,
    cantidad: t.cantidad,
    tiempo_estimado_min: t.tiempo_estimado_min,
    personal_id: reparto[i]?.personal_id || null,
    orden: reparto[i]?.orden ?? i + 1,
    estado: 'pendiente',
  }))

  const { data, error } = await supabase
    .from('produccion_tareas')
    .insert(filas)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data ?? [], fecha: fechaPlan })
}
