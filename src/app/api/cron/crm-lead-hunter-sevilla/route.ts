import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { tgAlert } from '@/lib/telegram'

export async function GET(req: NextRequest) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  // Validar que es cron de Vercel
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    // Buscar 3 leads candidatos Sevilla
    const { data: leads, error: leadsError } = await supabase.rpc(
      'search_leads_sevilla_nuevos',
      { limit_count: 3 }
    )

    if (leadsError) {
      console.error('Error buscando leads:', leadsError)
      throw leadsError
    }

    if (!leads || leads.length === 0) {
      console.log('No hay leads nuevos disponibles')
      return NextResponse.json({ enviados: 0 })
    }

    let enviados = 0

    // Procesar cada lead
    for (const lead of leads) {
      try {
        // Generar JWT token
        const jwtToken = jwt.sign(
          {
            lead_id: lead.id,
            exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
          },
          process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
        )

        // URL trackeable
        const trackingUrl = `https://www.iarest.es?utm_source=crm_lead&utm_id=${lead.id}&tk=${jwtToken}`

        // Generar desuscripción token
        const unsubscribeToken = jwt.sign(
          { lead_id: lead.id },
          process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
        )
        const unsubscribeUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubscribeToken}`

        // Insertar en tracking
        const { error: trackingError } = await supabase
          .from('leads_web_tracking')
          .insert({
            lead_id: lead.id,
            restaurante_id: lead.restaurante_id,
            mensaje_dia1_at: new Date().toISOString(),
            estado: 'enviado_dia1',
            utm_source: 'crm_lead'
          })

        if (trackingError) {
          console.error(`Error insertando tracking para ${lead.nombre}:`, trackingError)
          continue
        }

        // Enviar email DÍA 1
        const emailResult = await resend.emails.send({
          from: 'Alberto <alberto@iarest.es>',
          to: lead.email,
          subject: `${lead.nombre}, ¿sabes cuánto ganas de verdad? 🤔`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
              <p>Hola <b>${lead.nombre}</b>,</p>

              <p>Pregunta incómoda: de los €€ que facturan al mes, 
              ¿cuánto ganan realmente después de gastos?</p>

              <p>Aquí va la verdad: la mayoría factura mucho pero gana poco.</p>

              <p>Porque pierden tiempo en:</p>
              <ul>
                <li>Caja manual (errores, demoras)</li>
                <li>Comandas a mano (camarero escribe, cocina no entiende)</li>
                <li>Papelería y facturas manuales</li>
              </ul>

              <p><b>Facturar más no es ganar más.</b></p>

              <p>Nosotros lo arreglamos en 2 pilares:</p>

              <p><b>🎤 Comandas por voz</b><br/>
              Camarero dice "2 medias, 1 copa" → cocina lo ve al instante.<br/>
              Sin errores. Sin demoras. Más rápido.</p>

              <p><b>🤖 IA en procesos</b><br/>
              Detecta ineficiencias, optimiza turnos, sugiere qué cocinar.<br/>
              Recuperas ese 40% que se pierde.</p>

              <p><b>Resultado: +15-25% margen neto. Sin vender más.</b></p>

              <p><b>¿5 minutos para verlo?</b><br/>
              <a href="${trackingUrl}" style="color: #D9442B; font-weight: bold;">👉 www.iarest.es</a></p>

              <p>Un saludo,<br/>
              <b>Alberto</b><br/>
              ia.rest | +34 637 34 99 90</p>

              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

              <p style="font-size: 12px; color: #999;">
                Si prefieres no recibir más: <a href="${unsubscribeUrl}" style="color: #999;">desuscribir</a>
              </p>
            </div>
          `
        })

        if (emailResult.error) {
          console.error(`Error enviando email a ${lead.email}:`, emailResult.error)
          continue
        }

        enviados++
        console.log(`✅ Email enviado a ${lead.nombre} (${lead.email})`)
      } catch (error) {
        console.error(`Error procesando lead ${lead.id}:`, error)
        continue
      }
    }

    // Telegram resumen
    if (enviados > 0) {
      await tgAlert(
        `<b>📧 CRM Lead Hunter — ${enviados} emails enviados</b>\n\n` +
        `Hora: ${new Date().toLocaleString('es-ES')}\n` +
        `Estado: ✅ OK`,
        'info'
      )
    }

    return NextResponse.json({
      ok: true,
      enviados,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error en lead-hunter-sevilla:', error)

    await tgAlert(
      `<b>🔴 CRM Lead Hunter ERROR</b>\n\n` +
      `Error: ${error instanceof Error ? error.message : 'Desconocido'}\n` +
      `Hora: ${new Date().toLocaleString('es-ES')}`,
      'critico'
    )

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
