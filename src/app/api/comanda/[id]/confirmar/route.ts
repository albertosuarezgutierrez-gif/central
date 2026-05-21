export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { crearPrintJobs, crearPrintJobCuenta } from '@/lib/courier'

// PATCH /api/comanda/[id]/confirmar
// Confirma una comanda en estado 'pendiente_confirmacion':
//   1. Verifica que pertenece al camarero y es reciente (<5min)
//   2. Crea los print_jobs (cocina / impresora)
//   3. Actualiza estado comanda → 'en_cocina'
//   4. Actualiza estado mesa
// Idempotente: si ya fue confirmada devuelve { ok: true, ya_confirmada: true }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })

    const supabase = createServerClient()
    const rid = session.restaurante_id

    // ── 1. Leer comanda ───────────────────────────────────────────────────
    const { data: comanda, error: fetchErr } = await supabase
      .from('comandas')
      .select('id, camarero_id, estado, tipo, mesa_id, nombre_cuenta, nota_general, numero_ticket, created_at, restaurante_id')
      .eq('id', id)
      .eq('restaurante_id', rid)
      .maybeSingle()

    if (fetchErr || !comanda) {
      return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
    }

    // Solo el camarero que la creó puede confirmarla
    if (comanda.camarero_id !== session.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // ── Idempotencia: ya confirmada → OK sin duplicar print_jobs ─────────
    if (comanda.estado !== 'pendiente_confirmacion') {
      return NextResponse.json({ ok: true, ya_confirmada: true })
    }

    // Ventana de 15 min — cubre red lenta, latencia alta o camarero ocupado
    // (era 5min, demasiado ajustado en producción real con cobertura intermitente)
    const edadMs = Date.now() - new Date(comanda.created_at).getTime()
    if (edadMs > 900_000) {
      return NextResponse.json({ error: 'Comanda demasiado antigua para confirmar' }, { status: 409 })
    }

    // ── 2. Leer camarero ──────────────────────────────────────────────────
    const { data: camarero } = await supabase
      .from('camareros')
      .select('nombre')
      .eq('id', comanda.camarero_id)
      .single()
    const camareroNombre = camarero?.nombre ?? 'Equipo'

    // ── 3. Leer mesa ──────────────────────────────────────────────────────
    let mesaCodigo: string | null = null
    let zonaTipo:   string | null = null
    let zonaNombre: string | null = null

    if (comanda.mesa_id) {
      const { data: mesa } = await supabase
        .from('mesas')
        .select('codigo, zona, zonas(nombre)')
        .eq('id', comanda.mesa_id)
        .eq('restaurante_id', rid)
        .single()

      if (mesa) {
        mesaCodigo = mesa.codigo
        zonaTipo   = (mesa as Record<string, unknown>).zona as string ?? null
        zonaNombre = ((mesa as Record<string, unknown>).zonas as { nombre?: string } | null)?.nombre ?? null
      }
    }

    // ── 4. Crear print_jobs según tipo ────────────────────────────────────
    if (comanda.tipo === 'cuenta' && comanda.mesa_id) {
      const { data: itemsCuenta } = await supabase
        .from('comanda_items')
        .select('nombre, cantidad, precio_unitario')
        .eq('comanda_id', id)
        .eq('restaurante_id', rid)

      const { data: restData } = await supabase
        .from('restaurantes')
        .select('nombre, direccion')
        .eq('id', rid)
        .single()

      const total = (itemsCuenta ?? []).reduce(
        (s: number, it: { precio_unitario: number | null; cantidad: number }) =>
          s + (it.precio_unitario ?? 0) * it.cantidad,
        0
      )

      await crearPrintJobCuenta({
        comanda_id:            id,
        restaurante_id:        rid,
        mesa_label:            mesaCodigo ?? '—',
        zona_tipo:             zonaTipo,
        zona_nombre:           zonaNombre,
        camarero_nombre:       camareroNombre,
        numero_ticket:         comanda.numero_ticket ?? 0,
        restaurante_nombre:    restData?.nombre ?? 'Restaurante',
        restaurante_direccion: restData?.direccion ?? null,
        items: (itemsCuenta ?? []).map((it: { nombre: string; cantidad: number; precio_unitario: number | null }) => ({
          nombre: it.nombre, cantidad: it.cantidad, precio_unitario: it.precio_unitario ?? 0,
        })),
        total: Math.round(total * 100) / 100,
      })

    } else if (['comanda', 'marchar'].includes(comanda.tipo)) {
      const { data: items } = await supabase
        .from('comanda_items')
        .select('nombre, cantidad, notas, seccion_id')
        .eq('comanda_id', id)
        .eq('restaurante_id', rid)

      if ((items ?? []).length > 0) {
        const mesaLabel = mesaCodigo
          ? mesaCodigo
          : comanda.nombre_cuenta
            ? `★ ${comanda.nombre_cuenta}`
            : '?'

        await crearPrintJobs(
          {
            id,
            tipo:            comanda.tipo,
            mesa_codigo:     mesaLabel,
            camarero_nombre: camareroNombre,
            numero_ticket:   comanda.numero_ticket ?? undefined,
            restaurante_id:  rid,
            zona_tipo:       zonaTipo,
            zona_nombre:     zonaNombre,
            nota_general:    comanda.nota_general ?? null,
          },
          (items ?? []).map(item => ({
            nombre:     item.nombre,
            cantidad:   item.cantidad,
            notas:      item.notas ?? null,
            seccion_id: item.seccion_id ?? null,
          }))
        )
      }
    }

    // ── 5. Estado comanda → en_cocina ─────────────────────────────────────
    await supabase
      .from('comandas')
      .update({ estado: 'en_cocina' })
      .eq('id', id)
      .eq('restaurante_id', rid)

    // ── 6. Actualizar estado mesa ─────────────────────────────────────────
    if (comanda.mesa_id) {
      const estadosMesa: Record<string, string> = {
        comanda: 'activa',
        marchar: 'marchar',
        cuenta:  'cuenta_pedida',
        aviso:   'aviso',
      }
      await supabase
        .from('mesas')
        .update({
          estado:         estadosMesa[comanda.tipo] ?? 'activa',
          ultima_comanda: new Date().toISOString(),
          camarero_id:    comanda.camarero_id,
        })
        .eq('id', comanda.mesa_id)
        .eq('restaurante_id', rid)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[CONFIRMAR]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
