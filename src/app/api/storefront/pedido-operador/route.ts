// POST /api/storefront/pedido-operador
// Canal teléfono y mostrador — el empleado introduce el pedido
// Requiere sesión interna (camarero/owner/admin)
// NO usa Stripe — cobro presencial

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { crearPrintJobs } from '@/lib/courier'

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = createServerClient()
    const body = await req.json()

    const {
      canal,              // 'telefono' | 'mostrador'
      tipo,               // 'delivery' | 'recogida' (mostrador siempre recogida)
      cobro,              // 'efectivo' | 'tarjeta' | 'contraentrega'
      cliente_nombre,
      cliente_telefono,
      cliente_direccion,
      cliente_notas,
      tiempo_recogida_min,
      items,              // [{ producto_id, nombre, cantidad, precio_unitario, notas? }]
    } = body

    if (!canal || !cliente_nombre || !items?.length) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // Verificar precios en servidor
    const productoIds = items.map((i: { producto_id: string }) => i.producto_id).filter(Boolean)
    let precioMap: Record<string, number> = {}

    if (productoIds.length > 0) {
      const { data: productosDB } = await supabase
        .from('productos')
        .select('id, precio')
        .in('id', productoIds)
        .eq('restaurante_id', session.restaurante_id)

      precioMap = Object.fromEntries((productosDB ?? []).map(p => [p.id, p.precio]))
    }

    let total = 0
    const itemsVerificados = items.map((item: {
      producto_id: string
      nombre: string
      cantidad: number
      precio_unitario?: number
      notas?: string
    }) => {
      const precio = precioMap[item.producto_id] ?? item.precio_unitario ?? 0
      total += precio * item.cantidad
      return {
        producto_id: item.producto_id ?? null,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precio_unitario: precio,
        notas: item.notas ?? null,
      }
    })

    // Buscar turno activo
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('restaurante_id', session.restaurante_id)
      .eq('estado', 'activo')
      .single()

    if (!turno) {
      return NextResponse.json({ error: 'Sin turno activo' }, { status: 400 })
    }

    // Etiqueta para KDS/impresora
    const etiquetaCanal = canal === 'telefono' ? 'TEL' : 'LOCAL'
    const etiquetaTipo = tipo === 'delivery' ? 'DELIVERY' : 'RECOGIDA'
    const etiquetaComanda = `${etiquetaCanal} · ${etiquetaTipo} · ${cliente_nombre.trim()}`

    // Crear pedido_online (para tracking y panel)
    const { data: pedido, error: pedErr } = await supabase
      .from('pedidos_online')
      .insert({
        restaurante_id: session.restaurante_id,
        canal,
        tipo: tipo ?? (canal === 'mostrador' ? 'recogida' : tipo),
        cobro: cobro ?? 'efectivo',
        estado: 'en_cocina',
        cliente_nombre: cliente_nombre.trim(),
        cliente_telefono: cliente_telefono?.trim() ?? '',
        cliente_direccion: cliente_direccion?.trim() ?? null,
        cliente_notas: cliente_notas?.trim() ?? null,
        items: itemsVerificados,
        subtotal: total,
        total,
        stripe_status: 'presencial',
        pagado_at: null,
        operador_nombre: session.nombre,
        tiempo_recogida_min: tiempo_recogida_min ?? (canal === 'mostrador' ? 15 : 30),
      })
      .select()
      .single()

    if (pedErr || !pedido) throw pedErr ?? new Error('Error creando pedido')

    // Crear comanda interna → va al KDS automáticamente
    const { data: comanda, error: cmdErr } = await supabase
      .from('comandas')
      .insert({
        mesa_id: null,
        nombre_cuenta: etiquetaComanda,
        camarero_id: session.id,
        turno_id: turno.id,
        tipo: 'comanda',
        estado: 'en_cocina',
        restaurante_id: session.restaurante_id,
        nota_general: cliente_notas?.trim() ?? null,
        num_comensales: 1,
      })
      .select()
      .single()

    if (cmdErr || !comanda) throw cmdErr ?? new Error('Error creando comanda')

    // Items de la comanda
    await supabase.from('comanda_items').insert(
      itemsVerificados.map((it: {
        producto_id: string | null
        nombre: string
        cantidad: number
        precio_unitario: number
        notas: string | null
      }) => ({
        comanda_id: comanda.id,
        nombre: it.nombre,
        cantidad: it.cantidad,
        notas: it.notas,
        producto_id: it.producto_id,
        precio_unitario: it.precio_unitario,
        restaurante_id: session.restaurante_id,
      }))
    )

    // Vincular pedido con comanda
    await supabase
      .from('pedidos_online')
      .update({ comanda_id: comanda.id, estado: 'en_cocina' })
      .eq('id', pedido.id)

    // Print jobs (KDS + impresora)
    try {
      await crearPrintJobs(
        {
          id: comanda.id,
          tipo: 'comanda',
          mesa_codigo: etiquetaComanda,
          camarero_nombre: session.nombre,
          restaurante_id: session.restaurante_id,
        },
        itemsVerificados.map((i: { nombre: string; cantidad: number; notas: string | null }) => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          notas: i.notas ?? undefined,
        }))
      )
    } catch (e) {
      console.error('[PEDIDO-OPERADOR] Print error', e)
    }

    return NextResponse.json({
      ok: true,
      pedido_id: pedido.id,
      numero: pedido.numero,
      comanda_id: comanda.id,
      total,
      tiempo_recogida_min: pedido.tiempo_recogida_min,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[PEDIDO-OPERADOR]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
