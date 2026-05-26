import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

function tipoLabel(tipo: string): string {
  const labels: Record<string, string> = {
    extintor: 'Extintores', plaga: 'Control plagas', legionela: 'Legionela',
    gas: 'Revisión gas', electrico: 'Revisión eléctrica', seguro: 'Seguro',
    limpieza: 'Limpieza', climatizacion: 'Climatización', ascensor: 'Ascensor', otro: 'Otro',
  }
  return labels[tipo] ?? tipo
}

function emailHtml(d: {
  espacioNombre: string
  descripcion: string
  tipo: string
  estado: string
  proximaRevision: string
  diasRestantes: number
  proveedorNombre: string | null
  costeEstimado: number | null
  notas: string | null
}) {
  const color = d.estado === 'vencido' ? '#D9442B' : '#E8A33B'
  const badge = d.estado === 'vencido'
    ? `VENCIDO hace ${Math.abs(d.diasRestantes)} días`
    : `Vence en ${d.diasRestantes} días`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F6F1E7;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0d8cc">
    <div style="background:#14110E;padding:24px 32px">
      <span style="color:#F6F1E7;font-size:20px;font-weight:700">ia.rest</span>
      <span style="color:#6B5F52;font-size:13px"> · Aviso de mantenimiento</span>
    </div>
    <div style="padding:32px">
      <div style="display:inline-block;background:${color}22;border:1px solid ${color};border-radius:8px;padding:6px 14px;color:${color};font-size:13px;font-weight:700;margin-bottom:20px">${badge}</div>
      <h2 style="margin:0 0 6px;color:#14110E;font-size:20px">${d.espacioNombre}</h2>
      <p style="margin:0 0 24px;color:#6B5F52;font-size:14px">${d.tipo}</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:#6B5F52;font-size:13px;width:40%">Descripción</td><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:#14110E;font-size:14px;font-weight:600">${d.descripcion}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:#6B5F52;font-size:13px">Fecha límite</td><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:${color};font-size:14px;font-weight:700">${d.proximaRevision}</td></tr>
        ${d.proveedorNombre ? `<tr><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:#6B5F52;font-size:13px">Proveedor</td><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:#14110E;font-size:14px">${d.proveedorNombre}</td></tr>` : ''}
        ${d.costeEstimado ? `<tr><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:#6B5F52;font-size:13px">Coste estimado</td><td style="padding:10px 0;border-bottom:1px solid #e0d8cc;color:#14110E;font-size:14px">${d.costeEstimado}€</td></tr>` : ''}
        ${d.notas ? `<tr><td style="padding:10px 0;color:#6B5F52;font-size:13px">Notas</td><td style="padding:10px 0;color:#14110E;font-size:14px">${d.notas}</td></tr>` : ''}
      </table>
      <div style="margin-top:28px;padding:16px;background:#F6F1E7;border-radius:8px;font-size:13px;color:#6B5F52">
        Una vez realizado, accede a <strong>ia.rest → Espacios → Mantenimiento</strong> y pulsa <strong>✓ Revisado</strong>.
      </div>
    </div>
    <div style="padding:16px 32px;background:#F6F1E7;text-align:center;font-size:11px;color:#9C8E7E">ia.rest · hola@iarest.es</div>
  </div>
</body></html>`
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const hace24h = new Date(Date.now() - 86400000).toISOString()

  const { data: items, error } = await supabase
    .from('espacio_mantenimiento')
    .select(`*, espacio:espacio_id(nombre, email_contacto), restaurante:restaurante_id(nombre, email_contacto)`)
    .in('estado', ['proximo', 'vencido'])
    .or(`notificado_at.is.null,notificado_at.lt.${hace24h}`)

  if (error || !items?.length) return NextResponse.json({ ok: true, processed: 0 })

  const resultados = await Promise.allSettled(
    items.map(async (item) => {
      const espacio = item.espacio as { nombre: string; email_contacto: string | null } | null
      const restaurante = item.restaurante as { nombre: string; email_contacto: string | null } | null
      const email = espacio?.email_contacto ?? restaurante?.email_contacto
      if (!email) return

      const diasRestantes = Math.ceil(
        (new Date(item.proxima_revision).getTime() - Date.now()) / 86400000
      )
      const asunto = item.estado === 'vencido'
        ? `🔴 Mantenimiento VENCIDO — ${item.descripcion} · ${espacio?.nombre ?? ''}`
        : `🟡 Mantenimiento próximo en ${diasRestantes} días — ${item.descripcion}`

      await resend.emails.send({
        from: 'ia.rest <avisos@iarest.es>',
        to: email,
        subject: asunto,
        html: emailHtml({
          espacioNombre: espacio?.nombre ?? 'Espacio',
          descripcion: item.descripcion,
          tipo: tipoLabel(item.tipo),
          estado: item.estado,
          proximaRevision: item.proxima_revision,
          diasRestantes,
          proveedorNombre: item.proveedor_nombre,
          costeEstimado: item.coste_estimado,
          notas: item.notas,
        }),
      })

      await supabase
        .from('espacio_mantenimiento')
        .update({ notificado_at: new Date().toISOString() })
        .eq('id', item.id)
    })
  )

  return NextResponse.json({ ok: true, processed: resultados.length })
}
