import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getCoordinadorSession(req: NextRequest) {
  const raw = req.cookies.get('coordinador_session')?.value
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// GET /api/eventos-wp/disponibilidad?espacio_id=X&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Devuelve: fechas ocupadas, opciones pendientes, disponibles
export async function GET(req: NextRequest) {
  const session = getCoordinadorSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const espacio_id = searchParams.get('espacio_id')
  const desde = searchParams.get('desde') ?? new Date().toISOString().slice(0, 10)
  const hasta = searchParams.get('hasta') ?? new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)

  // Cargar todos los espacios del restaurante si no se especifica uno
  const espaciosQuery = supabase
    .from('espacios_evento')
    .select('id, nombre, tipo, aforo_maximo, descripcion')
    .eq('local_id', session.restaurante_id)
    .eq('activo', true)

  if (espacio_id) espaciosQuery.eq('id', espacio_id)
  const { data: espacios } = await espaciosQuery

  // Cargar eventos confirmados en el rango
  const { data: eventos } = await supabase
    .from('eventos')
    .select('id, numero_evento, tipo, estado, fecha_evento, hora_inicio, hora_fin, cliente_nombre, aforo_previsto, espacio_id, coordinador_id')
    .eq('local_id', session.restaurante_id)
    .not('estado', 'in', '(cancelado)')
    .gte('fecha_evento', desde)
    .lte('fecha_evento', hasta)
    .order('fecha_evento')

  // Cargar bloqueos en el rango
  const bloqueoQuery = supabase
    .from('espacio_bloqueos')
    .select('id, espacio_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin, tipo, confirmado, expira_at, notas, coordinador_id, evento_id')
    .eq('local_id', session.restaurante_id)
    .gte('fecha_fin', desde)
    .lte('fecha_inicio', hasta)

  const { data: bloqueos } = await bloqueoQuery

  // Construir mapa de disponibilidad por espacio
  const disponibilidad = (espacios ?? []).map(esp => {
    const eventosEspacio = (eventos ?? []).filter(e => e.espacio_id === esp.id)
    const bloqueosEspacio = (bloqueos ?? []).filter(b => b.espacio_id === esp.id)

    // Fechas ocupadas (confirmadas)
    const ocupadas = eventosEspacio
      .filter(e => ['confirmado', 'en_curso', 'completado', 'facturado'].includes(e.estado))
      .map(e => ({
        fecha: e.fecha_evento,
        tipo: 'evento_confirmado',
        descripcion: `${e.tipo} — ${e.cliente_nombre}`,
        numero: e.numero_evento,
        es_propio: e.coordinador_id === session.id,
      }))

    // Opciones pendientes (presupuesto)
    const opciones = eventosEspacio
      .filter(e => e.estado === 'presupuesto')
      .map(e => ({
        fecha: e.fecha_evento,
        tipo: 'opcion',
        descripcion: `Opción: ${e.tipo} — ${e.cliente_nombre}`,
        numero: e.numero_evento,
        es_propio: e.coordinador_id === session.id,
      }))

    // Bloqueos manuales
    const bloqueados = bloqueosEspacio.map(b => ({
      fecha_inicio: b.fecha_inicio,
      fecha_fin: b.fecha_fin,
      tipo: b.tipo,
      descripcion: b.notas ?? 'Bloqueado',
      confirmado: b.confirmado,
      expira_at: b.expira_at,
      es_propio: b.coordinador_id === session.id,
    }))

    return {
      espacio: esp,
      ocupadas,
      opciones,
      bloqueados,
      total_eventos: eventosEspacio.length,
    }
  })

  return NextResponse.json({ disponibilidad, desde, hasta })
}
