// qr-call-waiter v1 — El cliente llama al camarero desde el QR
// POST { sesion_id, motivo? }
// motivos: 'ayuda' | 'pedir_mas' | 'cuenta' | 'problema'
//
// Lógica de enrutamiento:
//   1. Camarero asignado a la zona de la mesa (si existe)
//   2. Todos los camareros activos del turno (fallback)
//   3. Jefe de sala: siempre recibe copia

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MOTIVOS: Record<string, string> = {
  ayuda:     '🙋 El cliente de la mesa necesita ayuda',
  pedir_mas: '🍽️ El cliente de la mesa quiere pedir más',
  cuenta:    '💳 El cliente de la mesa pide la cuenta',
  problema:  '⚠️ El cliente de la mesa tiene un problema',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { sesion_id, motivo = 'ayuda' } = await req.json()
    if (!sesion_id) return err('sesion_id requerido')

    // 1. Datos de la sesión + mesa + zona
    const { data: sesion } = await sb
      .from('qr_sesiones_cliente')
      .select('restaurante_id, mesa_id, mesas(codigo, nombre, zona_id, zonas(nombre, prefijo))')
      .eq('id', sesion_id)
      .single()

    if (!sesion) return err('Sesión no válida')

    const { restaurante_id, mesa_id } = sesion
    const mesa = sesion.mesas as any
    const zona_id = mesa?.zona_id

    const titulo = `🙋 Mesa ${mesa?.codigo || ''}`
    const cuerpo = MOTIVOS[motivo] || MOTIVOS['ayuda']

    const destinatarios: string[] = []

    // 2. Buscar camarero asignado a la zona
    if (zona_id) {
      const { data: camareroZona } = await sb
        .from('personal')
        .select('id')
        .eq('restaurante_id', restaurante_id)
        .eq('rol', 'camarero')
        .eq('zona_id', zona_id)     // columna zona_id en camareros (si existe)
        .limit(1)
        .single()

      if (camareroZona) destinatarios.push(camareroZona.id)
    }

    // 3. Fallback: todos los camareros activos del turno
    if (destinatarios.length === 0) {
      const { data: camareros } = await sb
        .from('personal')
        .select('id')
        .eq('restaurante_id', restaurante_id)
        .eq('rol', 'camarero')

      for (const c of camareros || []) destinatarios.push(c.id)
    }

    // 4. Jefe de sala — siempre recibe (sin duplicados)
    const { data: jefes } = await sb
      .from('personal')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .eq('rol', 'jefe_sala')

    for (const j of jefes || []) {
      if (!destinatarios.includes(j.id)) destinatarios.push(j.id)
    }

    // 5. Enviar push a todos los destinatarios
    const resultados = await Promise.allSettled(
      destinatarios.map(camarero_id =>
        sb.functions.invoke('push-send', {
          body: {
            camarero_id,
            titulo,
            cuerpo,
            datos: { tipo: 'qr_llamada', mesa_id, sesion_id, motivo }
          }
        })
      )
    )

    // 6. Log del aviso
    await sb.from('alerta_log').insert({
      restaurante_id,
      tipo: 'qr_llamada',
      descripcion: `${titulo} — ${cuerpo}`,
      mesa_id,
      datos: { sesion_id, motivo, destinatarios_count: destinatarios.length }
    }).select().maybeSingle()

    const enviados = resultados.filter(r => r.status === 'fulfilled').length

    return new Response(JSON.stringify({
      ok: true,
      destinatarios: destinatarios.length,
      enviados,
      zona: mesa?.zonas?.nombre || null,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})

const err = (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'Access-Control-Allow-Origin':'*', 'Content-Type':'application/json' } })
