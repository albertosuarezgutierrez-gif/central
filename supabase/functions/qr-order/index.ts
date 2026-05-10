// qr-order v1 — El cliente crea una comanda desde el QR
// POST { sesion_id, mesa_id, restaurante_id, items }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { sesion_id, mesa_id, restaurante_id, items } = await req.json()

    if (!sesion_id || !mesa_id || !items?.length) {
      return new Response(JSON.stringify({ error: 'sesion_id, mesa_id e items requeridos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Validar sesión activa
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, estado, restaurante_id, mesa_id')
      .eq('id', sesion_id)
      .eq('estado', 'activa')
      .single()

    if (!sesion) {
      return new Response(JSON.stringify({ error: 'Sesión no válida' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Obtener turno activo
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .eq('estado', 'activo')
      .single()

    const turno_id = turno?.id

    // Crear comanda
    const { data: comanda, error: cmdErr } = await supabase
      .from('comandas')
      .insert({
        restaurante_id,
        mesa_id,
        turno_id,
        estado: 'pendiente',
        origen: 'qr_cliente',       // ← distingue pedidos QR
        notas: 'Pedido desde QR de mesa',
      })
      .select('id, numero_comanda')
      .single()

    if (cmdErr) throw new Error(cmdErr.message)

    // Items de la comanda
    const itemsInsert = items.map((item: { producto_id: string, cantidad: number, notas?: string, precio_unitario: number }) => ({
      comanda_id: comanda.id,
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      notas: item.notas || null,
      estado: 'pendiente',
    }))

    await supabase.from('comanda_items').insert(itemsInsert)

    // Notificar push a camareros de la zona (si hay)
    // (reutilizamos la lógica existente de push-send)
    const { data: camareros } = await supabase
      .from('camareros')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .in('rol', ['camarero', 'jefe_sala'])

    if (camareros?.length) {
      for (const cam of camareros) {
        await supabase.functions.invoke('push-send', {
          body: {
            camarero_id: cam.id,
            titulo: `Pedido QR — Mesa ${mesa_id}`,
            cuerpo: `${items.length} producto${items.length > 1 ? 's' : ''} solicitado${items.length > 1 ? 's' : ''} desde el QR`,
            datos: { tipo: 'qr_pedido', mesa_id, comanda_id: comanda.id }
          }
        })
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      comanda_id: comanda.id,
      numero_comanda: comanda.numero_comanda,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
