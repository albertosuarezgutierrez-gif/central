import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/disponibilidad
// ?espacio_id=xxx&desde=2026-06-01&hasta=2026-06-30
// Devuelve disponibilidad por día para un espacio en un rango
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const espacio_id = searchParams.get('espacio_id')
  const desde = searchParams.get('desde') ?? new Date().toISOString().slice(0, 10)
  const hasta = searchParams.get('hasta') ?? (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10)
  })()

  if (!espacio_id) {
    // Sin espacio_id → devolver disponibilidad de TODOS los espacios del restaurante
    const { data: espacios } = await supabase
      .from('espacios_evento')
      .select('id, nombre, tipo, aforo_maximo')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)

    if (!espacios?.length) return NextResponse.json({ espacios: [] })

    const resultados = await Promise.all(
      espacios.map(async (esp) => {
        const { data: dias } = await supabase.rpc('espacio_disponibilidad_rango', {
          p_espacio_id: esp.id,
          p_desde: desde,
          p_hasta: hasta,
        })
        return { ...esp, dias: dias ?? [] }
      })
    )
    return NextResponse.json({ espacios: resultados, desde, hasta })
  }

  // Con espacio_id → disponibilidad detallada de ese espacio
  const { data: dias, error } = await supabase.rpc('espacio_disponibilidad_rango', {
    p_espacio_id: espacio_id,
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Contar días disponibles y ocupados
  const disponibles = dias?.filter((d: { disponible: boolean }) => d.disponible).length ?? 0
  const ocupados = (dias?.length ?? 0) - disponibles

  return NextResponse.json({ dias, resumen: { disponibles, ocupados }, desde, hasta })
}

// POST /api/owner/eventos/disponibilidad — crear bloqueo manual
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { espacio_id, fecha_inicio, fecha_fin, motivo, notas } = await req.json()

  if (!espacio_id || !fecha_inicio || !fecha_fin) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('espacio_bloqueos')
    .insert({
      restaurante_id: restauranteId,
      espacio_id,
      fecha_inicio,
      fecha_fin,
      motivo: motivo ?? 'bloqueado',
      coordinador_id: session.id,
      notas,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bloqueo: data }, { status: 201 })
}

// DELETE /api/owner/eventos/disponibilidad — eliminar bloqueo manual
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  await supabase.from('espacio_bloqueos').delete()
    .eq('id', id).eq('restaurante_id', restauranteId)

  return NextResponse.json({ ok: true })
}
