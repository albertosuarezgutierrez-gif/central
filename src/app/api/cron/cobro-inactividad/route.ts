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

  // Obtener sesiones inactivas (función SQL)
  const { data: sesiones, error } = await supabase
    .rpc('get_sesiones_inactivas')

  if (error) {
    console.error('[cobro-inactividad] Error obteniendo sesiones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sesiones || sesiones.length === 0) {
    return NextResponse.json({ ok: true, procesadas: 0 })
  }

  let enviadas = 0
  let errores = 0

  for (const s of sesiones) {
    try {
      const minutos = Math.round(s.minutos_abierta)

      // Buscar camareros activos del restaurante (jefe_sala siempre, camarero asignado a la zona si existe)
      const { data: camareros } = await supabase
        .from('camareros')
        .select('id, nombre')
        .eq('restaurante_id', s.restaurante_id)
        .in('rol', ['camarero', 'jefe_sala'])
        .eq('activo', true)

      if (!camareros || camareros.length === 0) continue

      // Enviar push a cada camarero
      const pushUrl = `${process.env.SUPABASE_URL}/functions/v1/push-send`
      const pushAuth = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`

      for (const cam of camareros) {
        await fetch(pushUrl, {
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
      }

      // Marcar sesión como alertada para no volver a avisar
      await supabase
        .from('qr_sesiones_cliente')
        .update({ inactividad_alerta_enviada: true })
        .eq('id', s.sesion_id)

      // Registrar en alerta_log para auditoría
      await supabase.from('alerta_log').insert({
        restaurante_id: s.restaurante_id,
        tipo: 'qr_inactividad',
        referencia_id: s.sesion_id,
        mensaje: `Mesa ${s.mesa_codigo}: ${minutos}min sin pago QR`,
        nivel: 'aviso',
      })

      enviadas++
    } catch (e) {
      console.error(`[cobro-inactividad] Error procesando sesión ${s.sesion_id}:`, e)
      errores++
    }
  }

  return NextResponse.json({
    ok: true,
    procesadas: sesiones.length,
    alertas_enviadas: enviadas,
    errores,
  })
}
