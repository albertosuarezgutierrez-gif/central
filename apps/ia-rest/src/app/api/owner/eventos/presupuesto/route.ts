import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // Cargar datos del evento
  const { data: evento, error: evError } = await supabase
    .from('eventos')
    .select(`
      *, espacios_evento(nombre, aforo_maximo, direccion),
      restaurantes!inner(nombre, nif, razon_social, direccion_fiscal, telefono, email)
    `)
    .eq('id', evento_id)
    .eq('local_id', restauranteId)
    .single()

  if (evError || !evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  // Cargar pases
  const { data: pases } = await supabase
    .from('evento_pases')
    .select('*, evento_pase_items(*)')
    .eq('evento_id', evento_id)
    .order('numero_pase')

  const rest = (evento as { restaurantes: { nombre: string; nif?: string; razon_social?: string; direccion_fiscal?: string; telefono?: string; email?: string } }).restaurantes
  const espacio = (evento as { espacios_evento: { nombre: string; aforo_maximo?: number; direccion?: string } | null }).espacios_evento
  const precio_total = evento.precio_total ?? (evento.precio_por_persona && evento.aforo_previsto ? evento.precio_por_persona * evento.aforo_previsto : 0)
  const iva_pct = evento.iva_tipo ?? 10
  const base_imponible = precio_total / (1 + iva_pct / 100)
  const iva_importe = precio_total - base_imponible

  const fmt_fecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const fmt_eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const tipo_labels: Record<string, string> = {
    boda: 'Boda', comunion: 'Comunión', bautizo: 'Bautizo',
    cumpleanos: 'Cumpleaños', empresa: 'Evento de empresa', otro: 'Evento'
  }

  const pasesHTML = pases?.length ? `
    <h3 style="font-family:Georgia,serif;color:#1A1714;font-size:14px;margin:24px 0 8px;">Menú y pases del servicio</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:Arial,sans-serif;">
      <thead>
        <tr style="background:#F6F1E7;">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #D8CDB6;">Pase</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #D8CDB6;">Contenido</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #D8CDB6;">Hora</th>
        </tr>
      </thead>
      <tbody>
        ${pases.map(p => `
          <tr style="border-bottom:1px solid #EDE8DF;">
            <td style="padding:8px;font-weight:600;">${p.numero_pase}. ${p.nombre}</td>
            <td style="padding:8px;color:#6B5F52;">${(p as { evento_pase_items: { nombre: string }[] }).evento_pase_items?.map((i: { nombre: string }) => i.nombre).join(', ') || '—'}</td>
            <td style="padding:8px;text-align:center;">${p.hora_prevista ?? '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Presupuesto ${evento.numero_evento}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; color: #1A1714; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #D9442B; }
  .logo-area h1 { font-family: Georgia, serif; font-size: 28px; color: #1A1714; }
  .logo-area p { font-size: 11px; color: #6B5F52; margin-top: 2px; }
  .doc-info { text-align: right; }
  .doc-num { font-family: monospace; font-size: 18px; font-weight: bold; color: #D9442B; }
  .doc-date { font-size: 12px; color: #6B5F52; margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section-title { font-family: Georgia, serif; font-size: 14px; font-weight: bold; color: #1A1714; border-bottom: 1px solid #D8CDB6; padding-bottom: 6px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .05em; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .info-block p { font-size: 12px; color: #3A332C; line-height: 1.6; }
  .info-block strong { color: #1A1714; }
  .highlight-box { background: #F6F1E7; border-left: 4px solid #D9442B; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 16px 0; }
  .evento-title { font-family: Georgia, serif; font-size: 22px; font-style: italic; color: #1A1714; }
  .evento-sub { font-size: 12px; color: #6B5F52; margin-top: 4px; }
  .totals-table { margin-top: 24px; border: 1px solid #D8CDB6; border-radius: 8px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; padding: 10px 16px; font-size: 13px; border-bottom: 1px solid #EDE8DF; }
  .totals-row:last-child { border-bottom: none; background: #1A1714; color: #F6F1E7; font-weight: bold; font-size: 16px; }
  .notas { background: #FFFBF5; border: 1px solid #E8A33B; border-radius: 8px; padding: 16px; font-size: 12px; color: #3A332C; line-height: 1.6; margin-top: 16px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #D8CDB6; font-size: 10px; color: #9CA3AF; text-align: center; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
  .badge-presupuesto { background: #E8A33B22; color: #E8A33B; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="logo-area">
    <h1>${rest.nombre ?? 'Restaurante'}</h1>
    ${rest.razon_social ? `<p>${rest.razon_social} · NIF ${rest.nif ?? '—'}</p>` : ''}
    ${rest.direccion_fiscal ? `<p>${rest.direccion_fiscal}</p>` : ''}
  </div>
  <div class="doc-info">
    <span class="badge badge-presupuesto">Presupuesto</span>
    <div class="doc-num">${evento.numero_evento}</div>
    <div class="doc-date">Emitido el ${fmt_fecha(new Date().toISOString().slice(0, 10))}</div>
  </div>
</div>

<!-- EVENTO -->
<div class="section">
  <div class="highlight-box">
    <div class="evento-title">${tipo_labels[evento.tipo] ?? 'Evento'} — ${evento.cliente_nombre}</div>
    <div class="evento-sub">
      📅 ${fmt_fecha(evento.fecha_evento)}${evento.hora_inicio ? ` · ${evento.hora_inicio}` : ''}${evento.hora_fin ? ` – ${evento.hora_fin}` : ''}
      ${espacio ? ` &nbsp;·&nbsp; 📍 ${espacio.nombre}${espacio.direccion ? `, ${espacio.direccion}` : ''}` : ''}
      &nbsp;·&nbsp; 👥 ${evento.aforo_previsto} personas
    </div>
  </div>
</div>

<!-- DATOS CLIENTE + CONTACTO -->
<div class="section grid-2">
  <div class="info-block">
    <div class="section-title">Cliente</div>
    <p><strong>${evento.cliente_nombre}</strong></p>
    ${evento.cliente_telefono ? `<p>📞 ${evento.cliente_telefono}</p>` : ''}
    ${evento.cliente_email ? `<p>✉ ${evento.cliente_email}</p>` : ''}
  </div>
  <div class="info-block">
    <div class="section-title">Contacto</div>
    ${rest.telefono ? `<p>📞 ${rest.telefono}</p>` : ''}
    ${rest.email ? `<p>✉ ${rest.email}</p>` : ''}
  </div>
</div>

<!-- MENÚ / PASES -->
${pasesHTML}
${evento.menu_descripcion ? `
<div class="section">
  <div class="section-title">Descripción del menú</div>
  <p style="font-size:13px;color:#3A332C;line-height:1.7;">${evento.menu_descripcion}</p>
</div>
` : ''}

<!-- NOTAS COCINA -->
${evento.notas_sala ? `
<div class="notas">
  <strong>⚠ Indicaciones especiales:</strong> ${evento.notas_sala}
</div>
` : ''}

<!-- PRECIO -->
<div class="section">
  <div class="section-title">Precio</div>
  <div class="totals-table">
    <div class="totals-row">
      <span>${evento.aforo_previsto} personas × ${fmt_eur(evento.precio_por_persona ?? 0)} €/persona</span>
      <span>${fmt_eur(base_imponible)} €</span>
    </div>
    <div class="totals-row">
      <span>IVA ${iva_pct}% (servicio de restauración)</span>
      <span>${fmt_eur(iva_importe)} €</span>
    </div>
    ${evento.senial_importe ? `
    <div class="totals-row" style="background:#F6F1E7;color:#1A1714;">
      <span>Señal / reserva</span>
      <span style="color:#D9442B;">− ${fmt_eur(evento.senial_importe)} €</span>
    </div>
    ` : ''}
    <div class="totals-row">
      <span>TOTAL</span>
      <span>${fmt_eur(precio_total)} €</span>
    </div>
  </div>
  <p style="font-size:10px;color:#9CA3AF;margin-top:8px;">Servicio mixto de hostelería. IVA reducido 10% según art. 91.Uno.2.2º LIVA y Consulta Vinculante DGT V2459-20.</p>
</div>

<!-- CONDICIONES -->
<div class="section">
  <div class="section-title">Condiciones</div>
  <p style="font-size:12px;color:#6B5F52;line-height:1.7;">
    Este presupuesto tiene una validez de 30 días desde su emisión. Para confirmar el evento es necesario el abono de una señal del ${evento.senial_importe ? Math.round((evento.senial_importe / precio_total) * 100) : 30}% del importe total. El importe restante se abonará el día del evento. La cancelación con menos de 30 días de antelación conllevará la pérdida de la señal.
  </p>
</div>

<div class="footer">
  Documento generado por ia.rest · ${rest.razon_social ?? rest.nombre} · ${rest.nif ? `NIF ${rest.nif}` : ''}
</div>

</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="presupuesto-${evento.numero_evento}.html"`,
    }
  })
}
