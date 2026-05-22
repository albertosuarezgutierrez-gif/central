export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import { tgAlert } from '@/lib/telegram'

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

  // Obtener turno activo + stats antes de cerrarlo
  const { data: turnoActivo } = await supabase
    .from('turnos')
    .select('id, nombre, created_at')
    .eq('estado', 'activo')
    .eq('restaurante_id', rid)
    .is('camarero_id', null)
    .maybeSingle()

  // Calcular ventas del turno para la notificación
  let totalVentas = 0
  let numComandas = 0
  if (turnoActivo) {
    const { data: stats } = await supabase
      .from('comandas')
      .select('id, items:comanda_items(precio_unitario, cantidad)')
      .eq('turno_id', turnoActivo.id)
      .eq('restaurante_id', rid)
      .eq('estado', 'cerrada')
    if (stats) {
      numComandas = stats.length
      totalVentas = stats.reduce((sum, c) => {
        const items = (c.items as { precio_unitario: number | null; cantidad: number }[]) || []
        return sum + items.reduce((s, it) => s + ((it.precio_unitario || 0) * it.cantidad), 0)
      }, 0)
    }
  }

  // Cerrar solo el turno activo de ESTE restaurante
  await supabase
    .from('turnos')
    .update({ estado: 'cerrado' })
    .eq('estado', 'activo')
    .eq('restaurante_id', rid)

  // Notificación Telegram cierre de caja
  if (turnoActivo && (totalVentas > 0 || numComandas > 0)) {
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('nombre')
      .eq('id', rid)
      .maybeSingle()
    const nombreLocal = rest?.nombre ?? 'Local'
    const hora = new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
    tgAlert(
      `Cierre de caja · ${nombreLocal}\n💰 ${totalVentas.toFixed(2)}€ · ${numComandas} comandas · ${hora}`,
      'info'
    )
  }

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

  // Rotar tokens QR de todas las mesas del restaurante
  // Cada turno genera tokens nuevos — los QR escaneados en turnos anteriores dejan de funcionar
  const { data: mesas } = await supabase
    .from('mesas')
    .select('id')
    .eq('restaurante_id', rid)
    .eq('qr_habilitado', true)

  if (mesas?.length) {
    await Promise.all(mesas.map(m =>
      supabase.from('mesas')
        .update({ qr_token: crypto.randomUUID() })
        .eq('id', m.id)
    ))
  }

  return NextResponse.json({ turno: data, qr_tokens_rotados: mesas?.length ?? 0 })
}
