export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET  /api/kds/elaboraciones   → lista activas con urgencia
 * POST /api/kds/elaboraciones   → crear elaboración + descontar stock + push cocina
 */

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { data, error } = await supabase
    .from('v_elaboraciones_activas')
    .select('*')
    .eq('restaurante_id', rid)
    .order('fecha_caducidad', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ elaboraciones: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const {
    nombre, producto_id, stock_articulo_id,
    cantidad, unidad, num_raciones,
    dias_caducidad, fecha_caducidad_manual,
    alergenos, temperatura_min, temperatura_max,
    instrucciones, notas,
  } = await req.json()

  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  // Calcular fecha de caducidad
  let fechaCaducidad: string
  if (fecha_caducidad_manual) {
    fechaCaducidad = fecha_caducidad_manual
  } else if (dias_caducidad) {
    const d = new Date()
    d.setDate(d.getDate() + dias_caducidad)
    fechaCaducidad = d.toISOString()
  } else {
    // Por defecto 3 días si no se especifica
    const d = new Date()
    d.setDate(d.getDate() + 3)
    fechaCaducidad = d.toISOString()
  }

  // Generar lote automático
  const { data: loteData } = await supabase.rpc('gen_lote_elaboracion', { p_restaurante_id: rid })
  const lote = loteData ?? `${new Date().toISOString().slice(0,10).replace(/-/g,'')}-001`

  // Crear elaboración
  const { data: elab, error } = await supabase
    .from('elaboraciones_propias')
    .insert({
      local_id:       rid,
      nombre:               nombre.trim(),
      lote,
      producto_id:          producto_id ?? null,
      stock_articulo_id:    stock_articulo_id ?? null,
      cantidad:             cantidad ?? 1,
      unidad:               unidad ?? 'unidad',
      num_raciones:         num_raciones ?? null,
      dias_caducidad:       dias_caducidad ?? null,
      fecha_caducidad:      fechaCaducidad,
      alergenos:            alergenos ?? [],
      temperatura_min:      temperatura_min ?? null,
      temperatura_max:      temperatura_max ?? null,
      instrucciones:        instrucciones?.trim() || null,
      notas:                notas?.trim() || null,
      elaborado_por_id:     session.id ?? null,
      elaborado_por_nombre: session.nombre ?? 'Cocina',
      estado:               'activa',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Descontar stock si hay artículo vinculado
  if (stock_articulo_id && cantidad) {
    const { data: sa } = await supabase
      .from('stock_articulos')
      .select('stock_actual')
      .eq('id', stock_articulo_id)
      .eq('local_id', rid)
      .single()

    if (sa) {
      const nuevo = Math.max(0, (sa.stock_actual ?? 0) - Number(cantidad))
      await supabase.from('stock_articulos')
        .update({
          stock_actual: nuevo,
          alerta_activa: nuevo <= 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stock_articulo_id)

      await supabase.from('stock_movimientos').insert({
        local_id:   rid,
        stock_articulo_id,
        tipo:             'consumo_produccion',
        cantidad:         -Number(cantidad),
        stock_resultante: nuevo,
        notas:            `Elaboración ${lote}: ${nombre}`,
      })
    }
  }

  // Push a jefe de cocina y owner: "Nueva elaboración registrada"
  const horasCad = (new Date(fechaCaducidad).getTime() - Date.now()) / 3600000
  const diasLabel = horasCad > 24 ? `${Math.round(horasCad/24)} días` : `${Math.round(horasCad)}h`
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.iarest.es'

  await fetch(`${baseUrl}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify({ restaurante_id: rid }) },
    body: JSON.stringify({
      local_id: rid,
      roles: ['jefe_sala', 'owner'],
      title: '🏷️ Nueva elaboración',
      body: `${nombre} — lote ${lote}. Caduca en ${diasLabel}.`,
      data: { tipo: 'nueva_elaboracion', elaboracion_id: elab.id },
    }),
  }).catch(() => {/* push no bloquea */})

  return NextResponse.json({ ok: true, elaboracion: elab, lote })
}
