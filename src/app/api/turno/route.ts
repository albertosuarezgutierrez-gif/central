import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid     = getRestauranteId(req)
  const session = getSession(req)

  // Fix #1: la tabla turnos sirve para DOS cosas que comparten estado='activo':
  //   1. Turno de SERVICIO global (owner abre desde /owner): camarero_id IS NULL
  //   2. Turno de FICHAJE individual (fichar_entrada()): camarero_id = uuid camarero
  //
  // Con el módulo de fichaje, pueden coexistir N turnos activos simultáneos
  // (uno por camarero fichado). .maybeSingle() devuelve error si hay >1 resultado,
  // lo que causaba "Sin turno activo" aunque el camarero tuviese fichaje activo.
  //
  // Solución: buscar turno de servicio (camarero_id IS NULL) primero;
  // si no existe, usar el fichaje propio del camarero como fallback.

  // Capa 1: turno de servicio global (abierto por el owner)
  const { data: servicio } = await supabase
    .from('turnos')
    .select('*')
    .eq('estado', 'activo')
    .eq('restaurante_id', rid)
    .is('camarero_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (servicio) return NextResponse.json({ turno: servicio })

  // Capa 2: turno de fichaje propio del camarero (fallback)
  if (session?.id) {
    const { data: propio } = await supabase
      .from('turnos')
      .select('*')
      .eq('estado', 'activo')
      .eq('restaurante_id', rid)
      .eq('camarero_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (propio) return NextResponse.json({ turno: propio })
  }

  return NextResponse.json({ turno: null })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  // FIX-03: extraer restaurante_id para filtrar correctamente y no afectar otros restaurantes
  const rid = getRestauranteId(req)
  const { nombre } = await req.json()

  // Cerrar solo el turno activo de ESTE restaurante
  await supabase
    .from('turnos')
    .update({ estado: 'cerrado' })
    .eq('estado', 'activo')
    .eq('restaurante_id', rid)

  // Abrir nuevo turno con restaurante_id
  const { data, error } = await supabase
    .from('turnos')
    .insert({
      nombre: nombre || `Turno ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`,
      restaurante_id: rid,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ turno: data })
}
