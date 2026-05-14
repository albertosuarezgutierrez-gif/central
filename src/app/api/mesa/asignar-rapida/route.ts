/**
 * POST /api/mesa/asignar-rapida
 *
 * Asigna la primera mesa libre de una zona a un cliente (alias temporal),
 * creando la comanda automáticamente.
 *
 * Si existe una reserva activa con ese nombre en esa zona → usa la mesa reservada.
 *
 * Body: { zona, alias_cliente, telefono_cliente? }
 * Returns: { mesa, comanda }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

function getSession(req: NextRequest) {
  return req.headers.get('x-ia-session')
}

async function getCamareroId(supabase: ReturnType<typeof createServerClient>, token: string) {
  const { data } = await supabase
    .from('sesiones_activas')
    .select('camarero_id, restaurante_id, rol')
    .eq('session_token', token)
    .gt('expires_at', new Date().toISOString())
    .single()
  return data
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const token = getSession(req)
  if (!token) return err('Sin sesión', 401)

  const supabase = createServerClient()
  const session = await getCamareroId(supabase, token)
  if (!session) return err('Sesión inválida', 401)

  const rid = getRestauranteId(req) || session.restaurante_id

  const body = await req.json()
  const { zona, alias_cliente, telefono_cliente } = body as {
    zona?: string
    alias_cliente?: string
    telefono_cliente?: string
  }

  if (!zona?.trim())           return err('zona requerida')
  if (!alias_cliente?.trim())  return err('alias_cliente requerido')

  // ─── 1. ¿Hay reserva activa para este nombre en esta zona? ──
  // Busca por nombre (case-insensitive, normalizado) + fecha de hoy + zona coincidente
  const { data: reservaActiva } = await supabase
    .from('reservas')
    .select('id, mesa_id, nombre_cliente, hora_reserva, mesas(id, codigo, zona, capacidad)')
    .eq('restaurante_id', rid)
    .eq('fecha_reserva', new Date().toISOString().slice(0, 10))
    .in('estado', ['pendiente', 'confirmada'])
    .ilike('nombre_cliente', `%${alias_cliente.trim()}%`)
    .not('mesa_id', 'is', null)
    .order('hora_reserva', { ascending: true })
    .limit(1)
    .maybeSingle()

  let mesaId: string | null = null
  let mesaCodigo = ''
  let reservaId: string | null = null

  if (reservaActiva && reservaActiva.mesa_id) {
    // Verificar que la mesa de la reserva es de la zona correcta
    const mesaReserva = reservaActiva.mesas as { id: string; codigo: string; zona: string; capacidad: number } | null
    if (mesaReserva && mesaReserva.zona.toLowerCase() === zona.toLowerCase()) {
      mesaId    = reservaActiva.mesa_id
      mesaCodigo = mesaReserva.codigo
      reservaId  = reservaActiva.id
    }
  }

  // ─── 2. Si no hay reserva, buscar primera mesa libre en la zona ──
  if (!mesaId) {
    // Obtener mesas de la zona ordenadas por codigo
    const { data: mesasZona } = await supabase
      .from('mesas')
      .select('id, codigo, capacidad')
      .eq('restaurante_id', rid)
      .ilike('zona', `%${zona}%`)
      .order('codigo', { ascending: true })

    if (!mesasZona || mesasZona.length === 0) {
      return err(`No hay mesas en la zona "${zona}"`, 404)
    }

    // Comandas activas en este momento
    const { data: activas } = await supabase
      .from('comandas')
      .select('mesa_id')
      .eq('restaurante_id', rid)
      .in('estado', ['nueva', 'en_cocina', 'cuenta'])

    const ocupadas = new Set((activas ?? []).map(c => c.mesa_id))

    // Mesas bloqueadas por reserva
    const { data: bloqueadas } = await supabase
      .rpc('get_mesas_bloqueadas', { p_restaurante_id: rid })
    const bloqSet = new Set((bloqueadas ?? []).map((b: { mesa_id: string }) => b.mesa_id))

    const mesaLibre = mesasZona.find(m => !ocupadas.has(m.id) && !bloqSet.has(m.id))

    if (!mesaLibre) {
      // Contar cuántas libres hay en otras zonas (para el mensaje)
      const { data: todasZonas } = await supabase
        .from('mesas')
        .select('zona')
        .eq('restaurante_id', rid)
        .not('id', 'in', `(${[...ocupadas, ...bloqSet].join(',') || '\'00000000-0000-0000-0000-000000000000\''})`)

      const otrasZonas = [...new Set((todasZonas ?? []).map(m => m.zona).filter(z => z !== zona))]

      return NextResponse.json({
        error: `Sin mesas libres en ${zona}`,
        otras_zonas: otrasZonas,
      }, { status: 409 })
    }

    mesaId    = mesaLibre.id
    mesaCodigo = mesaLibre.codigo
  }

  // ─── 3. Crear comanda con alias ───────────────────────────────
  const { data: comanda, error: errComanda } = await supabase
    .from('comandas')
    .insert({
      restaurante_id:   rid,
      mesa_id:          mesaId,
      camarero_id:      session.camarero_id,
      estado:           'nueva',
      tipo:             'mesa',
      alias_cliente:    alias_cliente.trim(),
      telefono_cliente: telefono_cliente?.trim() || null,
    })
    .select('id, estado, tipo, alias_cliente, telefono_cliente, created_at')
    .single()

  if (errComanda) return err(errComanda.message, 500)

  // ─── 4. Si había reserva → marcar como sentada ───────────────
  if (reservaId) {
    await supabase
      .from('reservas')
      .update({ estado: 'sentada' })
      .eq('id', reservaId)
  }

  return NextResponse.json({
    mesa: { id: mesaId, codigo: mesaCodigo },
    comanda,
    desde_reserva: !!reservaId,
  }, { status: 201 })
}
