export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { crearPrintJobs } from '@/lib/courier'
import { notifyError } from '@/lib/notify'
import { enviarEmailErrorTecnicoOwner } from '@/lib/email'

// POST /api/comanda — comanda manual (sin voz)
export async function POST(req: NextRequest) {
  // Parse body antes del try principal — body vacío/truncado es 400, no 500
  type ItemInput = { nombre: string; cantidad: number; notas?: string; producto_id?: string; precio_unitario?: number; formato_id?: string; formato_nombre?: string; seccion_id?: string }
  let body: {
    mesa_id?: string; nombre_cuenta?: string; items?: ItemInput[]
    tipo?: string; num_comensales?: number; nota_general?: string
    incluir_servicio?: boolean; require_confirm?: boolean
  }
  try {
    body = await req.json()
  } catch {
    // Body vacío o truncado: avisar al owner del restaurante si tenemos sesión
    const rid = getRestauranteId(req)
    if (rid !== '00000000-0000-0000-0000-000000000001') {
      const supabase = createServerClient()
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('nombre, email_contacto')
        .eq('id', rid)
        .maybeSingle()
      if (rest?.email_contacto) {
        enviarEmailErrorTecnicoOwner({
          email: rest.email_contacto,
          nombreRestaurante: rest.nombre ?? 'tu restaurante',
          tipo: 'Error al enviar comanda',
          descripcion: 'Un dispositivo ha intentado enviar una comanda pero el mensaje llegó vacío o incompleto. Esto suele indicar una conexión de red inestable o un problema con la app en ese dispositivo.',
          accion: 'Comprueba la conexión WiFi o de datos del dispositivo afectado. Si el problema persiste, cierra y vuelve a abrir la app de ia.rest en ese dispositivo. Si ves comandas que no han llegado a cocina, introdúcelas manualmente.',
        }).catch(() => {}) // fire-and-forget, no bloquear respuesta
      }
    }
    return NextResponse.json({ error: 'Body inválido o vacío' }, { status: 400 })
  }

  const {
    mesa_id, nombre_cuenta, items, tipo = 'comanda',
    num_comensales,
    nota_general,
    incluir_servicio = true,
    require_confirm = false,
  } = body

  try {
    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    if (!mesa_id && !nombre_cuenta) {
      return NextResponse.json({ error: 'mesa_id o nombre_cuenta requerido' }, { status: 400 })
    }
    if (!items?.length) {
      return NextResponse.json({ error: 'items requeridos' }, { status: 400 })
    }

    const sessionHeader = req.headers.get('x-ia-session')
    let camarero_id = ''
    try { camarero_id = JSON.parse(sessionHeader ?? '{}').id ?? '' } catch {}

    // Resolver nombre real del camarero para el ticket
    let camarero_nombre = 'Equipo'
    if (camarero_id) {
      const { data: cam } = await supabase
        .from('personal').select('nombre').eq('id', camarero_id).single()
      if (cam?.nombre) camarero_nombre = cam.nombre
    }

    // Fix #1b: misma lógica 2 capas que /api/turno — nunca .single() con módulo fichaje
    let turno_id = ''
    const { data: turnoServicio } = await supabase
      .from('turnos').select('id')
      .eq('restaurante_id', rid).eq('estado', 'activo')
      .is('camarero_id', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
    if (turnoServicio?.id) {
      turno_id = turnoServicio.id
    } else if (camarero_id) {
      const { data: turnoPropio } = await supabase
        .from('turnos').select('id')
        .eq('restaurante_id', rid).eq('estado', 'activo')
        .eq('camarero_id', camarero_id)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      turno_id = turnoPropio?.id ?? ''
    }
    if (!turno_id) {
      return NextResponse.json({ error: 'Sin turno activo' }, { status: 400 })
    }

    // ── RUTA CUENTA NOMINAL (sin mesa) ──────────────────────────────────────
    if (!mesa_id && nombre_cuenta) {
      const { data: comanda, error: cmdErr } = await supabase
        .from('comandas')
        .insert({
          mesa_id: null,
          nombre_cuenta: nombre_cuenta.trim(),
          camarero_id, turno_id,
          tipo, estado: tipo === 'cuenta' ? 'nueva' : (require_confirm ? 'pendiente_confirmacion' : 'en_cocina'),
          restaurante_id: rid,
          ...(nota_general ? { nota_general } : {}),
        })
        .select().single()
      if (cmdErr) throw cmdErr

      await supabase.from('comanda_items').insert(
        items.map((it: { nombre: string; cantidad: number; notas?: string; producto_id?: string; precio_unitario?: number }) => ({
          comanda_id: comanda.id,
          nombre: it.nombre, cantidad: it.cantidad,
          notas: it.notas ?? null,
          producto_id: it.producto_id ?? null,
          precio_unitario: it.precio_unitario ?? null,
          restaurante_id: rid,
        }))
      )

      // Imprimir ticket automaticamente
      try {
        const itemsPrint = items.map((i: { nombre: string; cantidad: number; notas?: string; seccion_id?: string; formato_nombre?: string }) => ({
          nombre: i.nombre, cantidad: i.cantidad, notas: i.notas, seccion_id: i.seccion_id, formato_nombre: i.formato_nombre ?? null,
        }))
        await crearPrintJobs({ id: comanda.id, tipo, mesa_codigo: nombre_cuenta.trim(), camarero_nombre: camarero_nombre, restaurante_id: rid, nota_general: nota_general ?? null }, itemsPrint)
      } catch (e) { console.error('[COMANDA] Print error:', e) }
      return NextResponse.json({ ok: true, comanda_id: comanda.id, numero_ticket: comanda.numero_ticket, nombre_cuenta: nombre_cuenta.trim() })
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── RUTA NORMAL CON MESA ─────────────────────────────────────────────────
    const { data: esPrimera } = await supabase
      .rpc('es_primera_comanda', { p_mesa_id: mesa_id, p_turno_id: turno_id })

    // Config servicio del restaurante
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('servicio_activo,servicio_precio,servicio_nombre,servicio_auto')
      .eq('id', rid).single()

    // Config de zona de la mesa (override por zona)
    const { data: mesaZona } = await supabase
      .from('mesas')
      .select('zona_id, zonas(servicio_override, servicio_precio_zona)')
      .eq('id', mesa_id).single()

    const zonaData = (mesaZona?.zonas as unknown) as { servicio_override: boolean | null; servicio_precio_zona: number | null } | null

    // Resolver activo y precio: zona tiene prioridad sobre global
    const servicioActivoFinal =
      zonaData?.servicio_override !== null && zonaData?.servicio_override !== undefined
        ? zonaData.servicio_override          // zona override explícito
        : rest?.servicio_activo ?? false      // hereda global

    const servicioPrecioFinal =
      zonaData?.servicio_precio_zona !== null && zonaData?.servicio_precio_zona !== undefined
        ? zonaData.servicio_precio_zona       // precio propio de zona
        : rest?.servicio_precio ?? 0          // hereda precio global

    const hacerServicio =
      esPrimera && incluir_servicio &&
      servicioActivoFinal && rest?.servicio_auto &&
      (num_comensales ?? 0) > 0

    // Crear comanda
    const { data: comanda, error: cmdErr } = await supabase
      .from('comandas')
      .insert({
        mesa_id, camarero_id, turno_id,
        tipo, estado: tipo === 'cuenta' ? 'nueva' : (require_confirm ? 'pendiente_confirmacion' : 'en_cocina'),
        restaurante_id: rid,
        ...(num_comensales ? { num_comensales } : {}),
        ...(nota_general ? { nota_general } : {}),
      })
      .select().single()
    if (cmdErr) throw cmdErr

    // Items base
    const itemsRaw = items as {
      nombre: string; cantidad: number; notas?: string
      producto_id?: string; precio_unitario?: number
      formato_id?: string; formato_nombre?: string; seccion_id?: string
    }[]

    // Lookup de precios en BD para items sin precio (fallback case-insensitive)
    const sinPrecio = itemsRaw.filter(it => it.precio_unitario == null)
    if (sinPrecio.length > 0) {
      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      const nombres = [...new Set(sinPrecio.map(it => it.nombre))]
      const { data: prods } = await supabase
        .from('productos').select('id,nombre,precio')
        .in('nombre', nombres).eq('restaurante_id', rid)
      const precioMap: Record<string, { id: string; precio: number }> = {}
      for (const p of prods ?? []) if (p.precio != null) precioMap[norm(p.nombre)] = { id: p.id, precio: Number(p.precio) }
      // Fallback: si no matcheó (diferencia capitalización), buscar todos y comparar con norm()
      const noMatcheados = nombres.filter(n => !precioMap[norm(n)])
      if (noMatcheados.length > 0) {
        const { data: todos } = await supabase.from('productos').select('id,nombre,precio').eq('restaurante_id', rid).eq('activo', true)
        for (const p of todos ?? []) {
          const pn = norm(p.nombre)
          if (noMatcheados.some(n => norm(n) === pn) && p.precio != null) {
            precioMap[pn] = { id: p.id, precio: Number(p.precio) }
            for (const it of itemsRaw) { if (norm(it.nombre) === pn) it.nombre = p.nombre }
          }
        }
      }
      // Aplicar precios encontrados
      for (const it of itemsRaw) {
        if (it.precio_unitario == null) {
          const found = precioMap[norm(it.nombre)]
          if (found) { it.precio_unitario = found.precio; if (!it.producto_id) it.producto_id = found.id }
        }
      }
    }

    // Consultar productos con venta_por_peso para propagar precio_kg al item
    const idsConProducto = itemsRaw.filter((it: { producto_id?: string }) => it.producto_id).map((it: { producto_id?: string }) => it.producto_id as string)
    let productosPeso: { id: string; venta_por_peso: boolean; precio_por_kg: number | null }[] = []
    if (idsConProducto.length > 0) {
      const { data: pp } = await supabase
        .from('productos')
        .select('id, venta_por_peso, precio_por_kg')
        .in('id', idsConProducto)
        .eq('restaurante_id', rid)
      productosPeso = (pp ?? []) as { id: string; venta_por_peso: boolean; precio_por_kg: number | null }[]
    }
    const pesoPorProducto = new Map(productosPeso.map(p => [p.id, p]))

    const itemsToInsert = itemsRaw.map((it: { nombre: string; cantidad: number; notas?: string; producto_id?: string; precio_unitario?: number; formato_id?: string; formato_nombre?: string; seccion_id?: string; peso_gramos?: number }) => {
      const prod = it.producto_id ? pesoPorProducto.get(it.producto_id) : null
      const esPeso = prod?.venta_por_peso && prod?.precio_por_kg
      return {
        comanda_id: comanda.id,
        nombre: it.nombre, cantidad: it.cantidad,
        notas: it.notas ?? null,
        producto_id: it.producto_id ?? null,
        precio_unitario: esPeso
          ? (it.peso_gramos ? parseFloat((prod!.precio_por_kg! * it.peso_gramos / 1000).toFixed(2)) : null)
          : (it.precio_unitario ?? null),
        formato_id: it.formato_id ?? null,
        formato_nombre: it.formato_nombre ?? null,
        seccion_id: it.seccion_id ?? null,
        restaurante_id: rid,
        peso_gramos: it.peso_gramos ?? null,
        pesado_en_cocina: it.peso_gramos ? true : false,
        precio_kg_en_venta: esPeso ? prod!.precio_por_kg : null,
      }
    })

    // Línea de servicio en comanda
    if (hacerServicio) {
      itemsToInsert.unshift({
        comanda_id: comanda.id,
        nombre: `${rest.servicio_nombre} (${num_comensales} pax)`,
        cantidad: num_comensales ?? 1,
        notas: null,
        producto_id: null,
        precio_unitario: servicioPrecioFinal,
        formato_id: null, formato_nombre: null, seccion_id: null,
        restaurante_id: rid,
        peso_gramos: null,
        pesado_en_cocina: false,
        precio_kg_en_venta: null,
      })
    }

    await supabase.from('comanda_items').insert(itemsToInsert)

    // ── Descontar stock automáticamente ─────────────────────────────
    // Para cada item con producto_id, buscar si tiene rendimiento vinculado
    const productoIds = itemsToInsert
      .filter(i => i.producto_id)
      .map(i => ({ id: i.producto_id as string, cantidad: i.cantidad }))

    if (productoIds.length > 0) {
      const { data: rendimientos } = await supabase
        .from('stock_rendimientos')
        .select('stock_articulo_id, producto_id, consumo_por_venta')
        .in('producto_id', productoIds.map(p => p.id))
        .eq('restaurante_id', rid)

      if (rendimientos && rendimientos.length > 0) {
        // Agrupar consumo total por artículo
        const consumoPorArticulo: Record<string, number> = {}
        for (const r of rendimientos) {
          const vendido = productoIds.find(p => p.id === r.producto_id)?.cantidad ?? 0
          const consumo = Number(r.consumo_por_venta) * vendido
          consumoPorArticulo[r.stock_articulo_id] =
            (consumoPorArticulo[r.stock_articulo_id] ?? 0) + consumo
        }

        // Actualizar cada artículo afectado
        for (const [artId, consumo] of Object.entries(consumoPorArticulo)) {
          const { data: art } = await supabase
            .from('stock_articulos')
            .select('stock_actual, stock_minimo, alerta_activa, proveedor_email, proveedor_nombre, pedido_auto, cantidad_pedido, unidad_compra, nombre')
            .eq('id', artId).eq('restaurante_id', rid).single()
          if (!art) continue

          const nuevo = Math.max(0, Number(art.stock_actual) - consumo)
          const alerta = nuevo < Number(art.stock_minimo)

          await supabase.from('stock_articulos').update({
            stock_actual: nuevo,
            alerta_activa: alerta,
            updated_at: new Date().toISOString(),
          }).eq('id', artId).eq('restaurante_id', rid)

          await supabase.from('stock_movimientos').insert({
            restaurante_id:    rid,
            stock_articulo_id: artId,
            tipo:              'venta',
            cantidad:          -consumo,
            stock_resultante:  nuevo,
            comanda_id:        comanda.id,
          })

          // Pedido automático: si acaba de cruzar el mínimo y tiene pedido_auto activo
          if (alerta && !art.alerta_activa && art.pedido_auto && art.proveedor_email) {
            const cantPedido = art.cantidad_pedido ?? (Number(art.stock_minimo) * 3)
            await supabase.from('pedidos_proveedor').insert({
              restaurante_id:    rid,
              stock_articulo_id: artId,
              proveedor_nombre:  art.proveedor_nombre,
              proveedor_email:   art.proveedor_email,
              cantidad:          cantPedido,
              unidad_compra:     art.unidad_compra,
              notas:             `Pedido automático. Stock actual: ${nuevo.toFixed(1)} ${art.unidad_compra}`,
              origen:            'auto',
              estado:            'pendiente', // qa-ignore: tabla pedidos_proveedor, no comandas
            })
            // El email lo envía la Edge Function de Telegram/notificaciones o
            // el dueño lo aprueba desde el panel de Bodega → historial de pedidos
          }
        }
      }
    }
    // ────────────────────────────────────────────────────────────────
    const mesaEstados: Record<string, string> = {
      comanda: 'activa', marchar: 'marchar', cuenta: 'cuenta', aviso: 'aviso', '86': 'activa'
    }
    const { data: mesaData } = await supabase
      .from('mesas').select('zona_id,codigo,zonas(nombre,tipo)').eq('id', mesa_id).single()

    await supabase.from('mesas').update({
      estado: mesaEstados[tipo] ?? 'activa',
      ultima_comanda: new Date().toISOString(),
      camarero_id,
    }).eq('id', mesa_id)

    // Tarea de servicio para running
    if (hacerServicio && mesaData?.zona_id) {
      const { data: runningId } = await supabase
        .rpc('get_running_de_zona', {
          p_zona_id: mesaData.zona_id,
          p_restaurante_id: rid,
        })

      await supabase.from('marchar_log').insert({
        comanda_id:     comanda.id,
        restaurante_id: rid,
        receptor_id:    runningId || camarero_id,
        mesa_id,
        mesa_codigo:    mesaData.codigo ?? '?',
        zona_nombre:    ((mesaData.zonas as unknown) as { nombre?: string } | null)?.nombre ?? null,
        tipo:           'servicio',
        num_comensales,
        items_resumen:  `${rest.servicio_nombre} · ${num_comensales} pax`,
        items_detalle:  [
          { nombre: 'Pan / aceite',           cantidad: num_comensales ?? 1 },
          { nombre: 'Cubiertos completos',     cantidad: num_comensales ?? 1 },
          { nombre: 'Agua / carta de bebidas', cantidad: 1 },
        ],
        recogido: false,
      })
    }

    // Imprimir ticket automaticamente
    // Reutilizamos mesaData ya cargada arriba (tiene codigo y zona_id)
    try {
      const itemsPrint = items.map((i: { nombre: string; cantidad: number; notas?: string; seccion_id?: string; formato_nombre?: string }) => ({
        nombre: i.nombre, cantidad: i.cantidad, notas: i.notas, seccion_id: i.seccion_id, formato_nombre: i.formato_nombre ?? null,
      }))
      await crearPrintJobs({
        id: comanda.id, tipo, mesa_codigo: mesaData?.codigo ?? 'Mesa',
        camarero_nombre: camarero_nombre, restaurante_id: rid,
        zona_tipo: ((mesaData?.zonas as unknown) as { tipo?: string } | null)?.tipo ?? null,
        nota_general: nota_general ?? null,
      }, itemsPrint)
    } catch (e) { console.error('[COMANDA] Print error:', e) }
    return NextResponse.json({
      ok: true, comanda_id: comanda.id,
      numero_ticket: comanda.numero_ticket,
      servicio_creado: hacerServicio,
    })
  } catch (err) {
    console.error('[COMANDA MANUAL]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    // Solo notificar errores reales de BD/sistema — no errores de validación de cliente
    const esErrorSistema = !(msg.includes('requerido') || msg.includes('inválido') || msg.includes('Sin turno'))
    if (esErrorSistema) {
      notifyError({
        tipo: 'comanda_error',
        modulo: 'comanda',
        mensaje: `Error creando comanda: ${msg}`,
        detalle: { error: String(err) },
        nivel: 'critico',
      })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
