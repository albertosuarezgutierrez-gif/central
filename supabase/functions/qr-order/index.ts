// qr-order v6 — El cliente crea una comanda desde el QR
// POST { sesion_id, mesa_id, restaurante_id, items }
// FIXES: estado 'nueva' (no 'pendiente'), restaurante_id en items, guard turno activo
// v6: liga la comanda a la subcuenta (sesion_qr_id) → permite cobrar a cada uno SOLO lo suyo

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { sesion_id, mesa_id, restaurante_id, items } = await req.json()

    if (!sesion_id || !mesa_id || !restaurante_id || !items?.length) {
      return json({ error: 'sesion_id, mesa_id, restaurante_id e items requeridos' }, 400)
    }

    // Validar sesión activa
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, estado, restaurante_id, mesa_id')
      .eq('id', sesion_id)
      .eq('estado', 'activa')
      .single()

    if (!sesion) return json({ error: 'Sesión no válida o expirada' }, 403)

    // Verificar que mesa_id coincide con la sesión (anti-spoofing)
    if (sesion.mesa_id !== mesa_id || sesion.restaurante_id !== restaurante_id) {
      return json({ error: 'Mesa o restaurante no coinciden con la sesión' }, 403)
    }

    // Obtener turno activo — requerido para insertar comanda
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .eq('estado', 'activo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!turno) {
      return json({ error: 'El restaurante no tiene turno abierto en este momento' }, 409)
    }

    // Crear comanda — estado 'nueva' (no 'pendiente', que viola el CHECK)
    const { data: comanda, error: cmdErr } = await supabase
      .from('comandas')
      .insert({
        restaurante_id,
        mesa_id,
        turno_id:  turno.id,
        sesion_qr_id: sesion.id,   // ata la comanda a la subcuenta de quien pide
        estado:    'nueva',
        tipo:      'comanda',
        origen:    'qr_cliente',
        nota_general: 'Pedido desde QR de mesa',
      })
      .select('id, numero_ticket')
      .single()

    if (cmdErr) throw new Error(cmdErr.message)

    // Items — restaurante_id requerido por RLS
    const itemsInsert = (items as { producto_id?: string; nombre: string; cantidad: number; notas?: string; precio_unitario?: number }[]).map(item => ({
      comanda_id:      comanda.id,
      restaurante_id,
      nombre:          item.nombre,
      producto_id:     item.producto_id ?? null,
      cantidad:        item.cantidad,
      precio_unitario: item.precio_unitario ?? null,
      notas:           item.notas ?? null,
    }))

    const { error: itemsErr } = await supabase.from('comanda_items').insert(itemsInsert)
    if (itemsErr) throw new Error(itemsErr.message)

    // Actualizar estado de mesa
    await supabase.from('mesas')
      .update({ estado: 'activa', ultima_comanda: new Date().toISOString() })
      .eq('id', mesa_id).eq('restaurante_id', restaurante_id)

    // Notificar push a camareros y jefes de sala
    const { data: camareros } = await supabase
      .from('personal')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .in('rol', ['camarero', 'jefe_sala'])
      .eq('activo', true)

    if (camareros?.length) {
      await supabase.functions.invoke('push-send', {
        body: {
          camarero_ids: camareros.map((c: { id: string }) => c.id),
          title: `Pedido QR — Mesa`,
          body: `${items.length} producto${items.length > 1 ? 's' : ''} desde el QR`,
          data: { tipo: 'qr_pedido', mesa_id, comanda_id: comanda.id }
        }
      })
    }

    return json({ ok: true, comanda_id: comanda.id, numero_ticket: comanda.numero_ticket })

  } catch (err) {
    console.error('[qr-order]', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
