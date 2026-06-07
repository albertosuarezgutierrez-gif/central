import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// API de costes accesible para coordinador_eventos Y owner
// Ruta: /api/eventos/costes (sin /owner/ para que el coordinador pueda usarla)

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // Verificar que el coordinador tiene acceso a este evento
  if (session.rol === 'coordinador_eventos') {
    const { data: ev } = await supabase
      .from('eventos').select('coordinador_id').eq('id', evento_id).single()
    if (ev?.coordinador_id !== session.id) {
      return NextResponse.json({ error: 'Sin acceso a este evento' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('evento_costes')
    .select('*')
    .eq('evento_id', evento_id)
    .eq('local_id', restauranteId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const porTipo = (data ?? []).reduce((acc: Record<string, number>, c) => {
    acc[c.tipo] = (acc[c.tipo] ?? 0) + Number(c.importe)
    return acc
  }, {})

  return NextResponse.json({
    costes: data,
    resumen: porTipo,
    total: Object.values(porTipo).reduce((a, b) => a + b, 0),
  })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { evento_id, tipo, descripcion, importe, proveedor_nombre, concepto_id } = body

  if (!evento_id || !tipo || !descripcion || !importe) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  // Verificar acceso del coordinador
  if (session.rol === 'coordinador_eventos') {
    const { data: ev } = await supabase
      .from('eventos').select('coordinador_id').eq('id', evento_id).single()
    if (ev?.coordinador_id !== session.id) {
      return NextResponse.json({ error: 'Sin acceso a este evento' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('evento_costes')
    .insert({
      evento_id,
      restaurante_id: restauranteId,
      tipo,
      descripcion,
      importe: parseFloat(importe),
      origen: 'manual',
      proveedor_nombre,
      imputado_por: session.id,
      imputado_por_rol: session.rol,
      origen_id: concepto_id ?? null,
      fecha_imputacion: new Date().toISOString().slice(0, 10),
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coste: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()

  // Coordinador solo puede borrar sus propios costes manuales
  if (session.rol === 'coordinador_eventos') {
    const { data: c } = await supabase
      .from('evento_costes').select('imputado_por, origen').eq('id', id).single()
    if (c?.imputado_por !== session.id || c?.origen !== 'manual') {
      return NextResponse.json({ error: 'Solo puedes eliminar tus propios gastos manuales' }, { status: 403 })
    }
  }

  await supabase.from('evento_costes').delete()
    .eq('id', id).eq('local_id', restauranteId)

  return NextResponse.json({ ok: true })
}
