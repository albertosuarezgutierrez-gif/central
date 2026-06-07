// GET /api/cron/cobro-inactividad
// Vercel Cron: cada 5 minutos
// Detecta sesiones QR abiertas sin pago pasado el timer configurado por el dueño
// y envía push al camarero asignado
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  // RGPD / minimización (backstop): purgar avisos QR de hace >6h. Cubre las mesas
  // en modo sin_pago que cierra el camarero en barra (no pasan por el webhook de
  // Stripe). El dato útil dura minutos; aquí garantizamos que nada queda guardado.
  try {
    const hace6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    await supabase.from('qr_avisos_suscripciones').delete().lt('creado_en', hace6h)
  } catch (e) {
    console.error('[cobro-inactividad] purga avisos QR:', e)
  }

  // Limpieza de cobros de grupo "pendiente" caducados: filas creadas hace >48h que
  // nunca llegaron a pagarse (checkouts abandonados o fallidos). Es seguro borrarlas
  // porque la sesión de Stripe Checkout caduca a las 24h → ya no se pueden cobrar, así
  // que no se pierde ningún pago futuro; solo evitamos que esos intentos ensucien el
  // panel del portal (contadores de "pendientes" e importes inflados).
  try {
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('cobros_grupo_pagos')
      .delete()
      .eq('estado', 'pendiente')
      .lt('created_at', hace48h)
  } catch (e) {
    console.error('[cobro-inactividad] purga cobros_grupo pendientes:', e)
  }

  const { data: sesiones, error } = await supabase.rpc('get_sesiones_inactivas')

  if (error) {
    console.error('[cobro-inactividad] Error obteniendo sesiones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sesiones || sesiones.length === 0) {
    return NextResponse.json({ ok: true, procesadas: 0 })
  }

  const pushUrl  = `${process.env.SUPABASE_URL}/functions/v1/push-send`
  const pushAuth = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`

  // ── Paralelo: todas las sesiones a la vez ─────────────────────
  const resultados = await Promise.allSettled(
    sesiones.map(async (s: any) => {
      const minutos = Math.round(s.minutos_abierta)

      const { data: camareros } = await supabase
        .from('personal')
        .select('id, nombre')
        .eq('local_id', s.restaurante_id)
        .in('rol', ['camarero', 'jefe_sala'])
        .eq('activo', true)

      if (!camareros || camareros.length === 0) return

      // Push a todos los camareros del restaurante en paralelo
      await Promise.allSettled(
        camareros.map((cam: any) =>
          fetch(pushUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': pushAuth },
            body: JSON.stringify({
              camarero_id: cam.id,
              titulo: `⏱ Mesa ${s.mesa_codigo} sin pagar`,
              cuerpo: `Lleva ${minutos} minutos abierta sin cerrar el QR`,
              datos: {
                tipo: 'qr_inactividad',
                mesa_id: s.mesa_id,
                sesion_id: s.sesion_id,
                minutos_abierta: minutos,
              }
            })
          })
        )
      )

      await supabase
        .from('qr_sesiones_cliente')
        .update({ inactividad_alerta_enviada: true })
        .eq('id', s.sesion_id)
    })
  )

  const enviadas = resultados.filter(r => r.status === 'fulfilled').length
  const errores  = resultados.filter(r => r.status === 'rejected').length

  return NextResponse.json({
    ok: true,
    procesadas: sesiones.length,
    alertas_enviadas: enviadas,
    errores,
  })
}
