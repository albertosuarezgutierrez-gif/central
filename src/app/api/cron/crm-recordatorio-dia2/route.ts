import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { tgAlert } from '@/lib/telegram'

export async function GET(req: NextRequest) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    // Buscar leads: enviado ayer + no clickeado
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const { data: leadsNoClick, error: error1 } = await supabase
      .from('leads_web_tracking')
      .select('id, lead_id, web_click_at, mensaje_dia1_at')
      .eq('estado', 'enviado_dia1')
      .lt('mensaje_dia1_at', yesterday.toISOString())
      .is('web_click_at', null)

    if (error1) throw error1

    // Buscar leads: clickeado pero sin mensaje dia2
    const { data: leadsClick, error: error2 } = await supabase
      .from('leads_web_tracking')
      .select('id, lead_id, web_click_at, mensaje_dia1_at')
      .eq('estado', 'clickeado')
      .lt('mensaje_dia1_at', yesterday.toISOString())
      .is('mensaje_dia2_at', null)

    if (error2) throw error2

    let procesados = 0

    // CASO 1: No clickeó = recordatorio
    if (leadsNoClick && leadsNoClick.length > 0) {
      for (const tracking of leadsNoClick) {
        try {
          const { data: lead } = await supabase
            .from('leads')
            .select('id, nombre, email, restaurante_id')
            .eq('id', tracking.lead_id)
            .single()

          if (!lead) continue

          // Generar tokens
          const jwtToken = jwt.sign(
            {
              lead_id: lead.id,
              exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
            },
            process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
          )

          const formularioUrl = `https://www.iarest.es/formulario-demo?utm_source=crm_lead&utm_id=${lead.id}&tk=${jwtToken}`

          const unsubscribeToken = jwt.sign(
            { lead_id: lead.id },
            process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
          )
          const unsubscribeUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubscribeToken}`

          // Enviar RECORDATORIO
          await resend.emails.send({
            from: 'Alberto <alberto@iarest.es>',
            to: lead.email,
            subject: `${lead.nombre}, no te lo pierdas... 👀`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
                <p>Hola <b>${lead.nombre}</b>,</p>

                <p>Volvemos a lo mismo: <b>facturar más no es ganar más.</b></p>

                <p>La mayoría de restaurantes pierde 40% del margen en operaciones ineficientes:</p>
                <ul>
                  <li>Camarero escribe comandas → errores</li>
                  <li>Caja manual → demoras y pérdidas</li>
                  <li>Sin datos reales → no sabes dónde se va el dinero</li>
                </ul>

                <p>Nosotros ayudamos a restaurantes a recuperar eso con:</p>

                <p>🎤 <b>Comandas por voz</b> (directo de mesa a cocina)<br/>
                🤖 <b>IA que optimiza procesos</b> (detecta fallos, sugiere mejoras)<br/>
                📊 <b>Datos en tiempo real</b> (sabes qué ganas cada turno)</p>

                <p>Clientes nuestros ganan +50% margen neto en 2-3 meses.</p>

                <p><b>¿Hablamos?</b><br/>
                <a href="${formularioUrl}" style="color: #D9442B; font-weight: bold;">👉 Solicitar demo</a></p>

                <p>☎️ O me llamas directo: <b>+34 637 34 99 90</b></p>

                <p>Saludo,<br/>
                <b>Alberto</b><br/>
                ia.rest</p>

                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

                <p style="font-size: 12px; color: #999;">
                  Si prefieres no recibir más: <a href="${unsubscribeUrl}" style="color: #999;">desuscribir</a>
                </p>
              </div>
            `
          })

          // Update tracking
          await supabase
            .from('leads_web_tracking')
            .update({
              mensaje_dia2_at: new Date().toISOString(),
              estado: 'recordatorio_dia2'
            })
            .eq('id', tracking.id)

          procesados++
        } catch (error) {
          console.error(`Error recordatorio ${tracking.lead_id}:`, error)
          continue
        }
      }
    }

    // CASO 2: Clickeó = enviar formulario (mismo email)
    if (leadsClick && leadsClick.length > 0) {
      for (const tracking of leadsClick) {
        try {
          const { data: lead } = await supabase
            .from('leads')
            .select('id, nombre, email')
            .eq('id', tracking.lead_id)
            .single()

          if (!lead) continue

          const jwtToken = jwt.sign(
            {
              lead_id: lead.id,
              exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
            },
            process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
          )

          const formularioUrl = `https://www.iarest.es/formulario-demo?utm_source=crm_lead&utm_id=${lead.id}&tk=${jwtToken}`

          const unsubscribeToken = jwt.sign(
            { lead_id: lead.id },
            process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
          )
          const unsubscribeUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubscribeToken}`

          // Enviar FORMULARIO (mismo email que recordatorio)
          await resend.emails.send({
            from: 'Alberto <alberto@iarest.es>',
            to: lead.email,
            subject: `${lead.nombre}, no te lo pierdas... 👀`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
                <p>Hola <b>${lead.nombre}</b>,</p>

                <p>Volvemos a lo mismo: <b>facturar más no es ganar más.</b></p>

                <p>La mayoría de restaurantes pierde 40% del margen en operaciones ineficientes:</p>
                <ul>
                  <li>Camarero escribe comandas → errores</li>
                  <li>Caja manual → demoras y pérdidas</li>
                  <li>Sin datos reales → no sabes dónde se va el dinero</li>
                </ul>

                <p>Nosotros ayudamos a restaurantes a recuperar eso con:</p>

                <p>🎤 <b>Comandas por voz</b> (directo de mesa a cocina)<br/>
                🤖 <b>IA que optimiza procesos</b> (detecta fallos, sugiere mejoras)<br/>
                📊 <b>Datos en tiempo real</b> (sabes qué ganas cada turno)</p>

                <p>Clientes nuestros ganan +50% margen neto en 2-3 meses.</p>

                <p><b>¿Hablamos?</b><br/>
                <a href="${formularioUrl}" style="color: #D9442B; font-weight: bold;">👉 Solicitar demo</a></p>

                <p>☎️ O me llamas directo: <b>+34 637 34 99 90</b></p>

                <p>Saludo,<br/>
                <b>Alberto</b><br/>
                ia.rest</p>

                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

                <p style="font-size: 12px; color: #999;">
                  Si prefieres no recibir más: <a href="${unsubscribeUrl}" style="color: #999;">desuscribir</a>
                </p>
              </div>
            `
          })

          // Update tracking
          await supabase
            .from('leads_web_tracking')
            .update({
              mensaje_dia2_at: new Date().toISOString(),
              estado: 'clickeado'
            })
            .eq('id', tracking.id)

          procesados++
        } catch (error) {
          console.error(`Error formulario ${tracking.lead_id}:`, error)
          continue
        }
      }
    }

    // Marcar como no_respuesta a los que no clickearon en 24h desde recordatorio
    const hace48h = new Date()
    hace48h.setHours(hace48h.getHours() - 48)

    const { data: sinRespuesta } = await supabase
      .from('leads_web_tracking')
      .select('id')
      .eq('estado', 'recordatorio_dia2')
      .lt('mensaje_dia2_at', hace48h.toISOString())
      .is('web_click_at', null)

    if (sinRespuesta && sinRespuesta.length > 0) {
      await supabase
        .from('leads_web_tracking')
        .update({ estado: 'no_respuesta' })
        .in('id', sinRespuesta.map(x => x.id))

      console.log(`Marcados como no_respuesta: ${sinRespuesta.length}`)
    }

    return NextResponse.json({
      ok: true,
      procesados,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error en recordatorio-dia2:', error)

    await tgAlert(
      `<b>🔴 CRM Recordatorio Día 2 ERROR</b>\n\n` +
      `Error: ${error instanceof Error ? error.message : 'Desconocido'}`,
      'critico'
    )

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
