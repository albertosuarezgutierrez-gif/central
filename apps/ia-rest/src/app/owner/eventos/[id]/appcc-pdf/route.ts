import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()

  const [
    { data: evento },
    { data: appcc },
    { data: personalEvento },
  ] = await Promise.all([
    supabase.from('eventos')
      .select(`*, restaurantes(nombre, nif, razon_social, direccion_fiscal), espacios_evento(nombre, tipo)`)
      .eq('id', id).single(),
    supabase.from('evento_appcc')
      .select(`*, registrado_por_personal:personal(nombre, rol)`)
      .eq('evento_id', id).order('hora_registro', { ascending: true }),
    supabase.from('evento_personal')
      .select(`*, personal(nombre, rol)`)
      .eq('evento_id', id).order('hora_inicio'),
  ])

  if (!evento) {
    return new NextResponse('Evento no encontrado', { status: 404 })
  }

  const rest = evento.restaurantes as { nombre:string; nif?:string; razon_social?:string; direccion_fiscal?:string } | null
  const espacio = Array.isArray(evento.espacios_evento) ? evento.espacios_evento[0] : (evento.espacios_evento as {nombre:string}|null)

  const LIMITES: Record<string, { limite:number; op:'gte'|'lte'; etiqueta:string }> = {
    temperatura_camara:             { limite:4,  op:'lte', etiqueta:'Temperatura cámara' },
    temperatura_coccion:            { limite:65, op:'gte', etiqueta:'Temperatura cocción' },
    temperatura_transporte_salida:  { limite:4,  op:'lte', etiqueta:'Temperatura transporte (salida)' },
    temperatura_transporte_llegada: { limite:8,  op:'lte', etiqueta:'Temperatura transporte (llegada)' },
    temperatura_servicio_caliente:  { limite:63, op:'gte', etiqueta:'Temperatura servicio caliente' },
    temperatura_servicio_frio:      { limite:8,  op:'lte', etiqueta:'Temperatura servicio frío' },
  }

  const registros = appcc ?? []
  const temperaturas = registros.filter((r: {tipo_registro:string}) => r.tipo_registro.startsWith('temperatura_'))
  const testigos = registros.filter((r: {tipo_registro:string}) => r.tipo_registro === 'plato_testigo')
  const numOk = temperaturas.filter((r: {cumple:boolean|null}) => r.cumple === true).length
  const numKo = temperaturas.filter((r: {cumple:boolean|null}) => r.cumple === false).length
  const personal = personalEvento ?? []

  const fmtHora = (d: string) => {
    const dt = new Date(d)
    return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
  }
  const fmtFecha = (d: string) => {
    const dt = new Date(d + 'T12:00:00')
    return dt.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  }
  const fmtFechaCorta = (d: string) => {
    const dt = new Date(d + 'T12:00:00')
    return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
  }
  const numExpediente = `APPCC-${new Date(evento.fecha_evento).getFullYear()}-${id.slice(0,8).toUpperCase()}`
  const now = fmtFechaCorta(new Date().toISOString().slice(0,10))

  const rowTemp = (r: Record<string,unknown>) => {
    const lim = LIMITES[r.tipo_registro as string]
    const ko = r.cumple === false
    const ok = r.cumple === true
    const pers = (r.registrado_por_personal as {nombre:string}|null)?.nombre ?? '—'
    return `<tr${ko ? ' class="ko"' : ''}>
      <td style="white-space:nowrap;font-weight:600">${fmtHora(r.hora_registro as string)}</td>
      <td>${lim?.etiqueta ?? r.tipo_registro}</td>
      <td><span style="font-size:13px;font-weight:700;color:${ok?'#16a34a':ko?'#dc2626':'#1a1a1a'}">${r.valor}°C</span></td>
      <td style="color:#6b7280">${lim ? `${lim.op==='lte'?'≤':'≥'}${lim.limite}°C` : '—'}</td>
      <td>${ok?'<span class="badge-ok">✅ CONFORME</span>':ko?'<span class="badge-ko">❌ NO CONFORME</span>':'—'}</td>
      <td style="color:#6b7280">${pers}</td>
      <td style="color:#6b7280;font-size:10px">${r.notas ?? '—'}</td>
    </tr>`
  }

  const rowTestigo = (r: Record<string,unknown>) => {
    const pers = (r.registrado_por_personal as {nombre:string}|null)?.nombre ?? '—'
    return `<tr>
      <td style="font-weight:600;white-space:nowrap">${fmtHora(r.hora_registro as string)}</td>
      <td style="font-weight:600">${r.plato_testigo_plato ?? '—'}</td>
      <td style="font-family:monospace;font-size:10px">${r.plato_testigo_lote ?? '—'}</td>
      <td>${r.plato_testigo_ubicacion ?? '—'}</td>
      <td>${r.plato_testigo_cantidad_gramos ? `${r.plato_testigo_cantidad_gramos} g` : '—'}</td>
      <td>${r.plato_testigo_expira_at ? fmtFechaCorta((r.plato_testigo_expira_at as string).slice(0,10)) : '—'}</td>
      <td>${r.etiqueta_impresa ? '<span class="badge-ok">✅</span>' : '<span class="badge-warn">Pendiente</span>'}</td>
      <td style="color:#6b7280">${pers}</td>
    </tr>`
  }

  const rowPersonal = (p: Record<string,unknown>) => {
    const pers = p.personal as {nombre:string}|null
    const nombre = pers?.nombre ?? (p.nombre_externo as string|null) ?? '—'
    const hora = p.hora_inicio ? `${p.hora_inicio} – ${p.hora_fin ?? '?'}` : '—'
    return `<tr>
      <td style="font-weight:600">${nombre}</td>
      <td style="text-transform:capitalize">${(p.rol as string).replace('_',' ')}</td>
      <td>${hora}</td>
      <td>${p.confirmado ? '<span style="color:#16a34a;font-weight:700">✅ Confirmado</span>' : '<span style="color:#d97706">⏳ Pendiente</span>'}</td>
    </tr>`
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dossier APPCC — ${evento.cliente_nombre} — ${fmtFechaCorta(evento.fecha_evento)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #f5f5f5; }
    .page { background: white; max-width: 210mm; margin: 0 auto; box-shadow: 0 0 20px rgba(0,0,0,.15); }
    .portada { padding: 40px 40px 30px; border-bottom: 3px solid #D9442B; }
    .portada-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .logo-text { font-size: 26px; font-weight: 700; letter-spacing: -1px; }
    .logo-punto { color: #D9442B; }
    .num-expediente { font-size: 10px; color: #6b7280; text-align: right; line-height: 1.6; }
    .portada-titulo { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .portada-subtitulo { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
    .portada-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .portada-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px; }
    .portada-card-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; margin-bottom: 4px; }
    .portada-card-valor { font-size: 13px; font-weight: 600; }
    .badge-ok { display:inline-block; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }
    .badge-warn { display:inline-block; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }
    .badge-ko { display:inline-block; background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }
    .seccion { padding: 24px 40px; border-bottom: 1px solid #e5e7eb; }
    .seccion:last-child { border-bottom: none; }
    .seccion-titulo { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #D9442B; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .seccion-titulo::after { content: ''; flex: 1; height: 1px; background: #fca5a5; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 6px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
    td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 10.5px; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr.ko td { background: #fff5f5; }
    .resumen-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .resumen-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; text-align: center; }
    .resumen-num { font-size: 26px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
    .resumen-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
    .firma-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .firma-box { border-top: 1px solid #1a1a1a; padding-top: 8px; font-size: 9px; color: #6b7280; text-align: center; min-height: 60px; }
    .btn-print { position: fixed; top: 20px; right: 20px; background: #D9442B; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(217,68,43,.4); z-index: 100; }
    .btn-back { position: fixed; top: 20px; right: 150px; background: #1a1a1a; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; z-index: 100; text-decoration: none; display: inline-block; }
    @media print {
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { background: white; font-size: 10px; }
      .page { box-shadow: none; max-width: 100%; }
      .btn-print, .btn-back { display: none !important; }
      .seccion { padding: 18px 30px; }
      .portada { padding: 30px 30px 20px; }
      @page { margin: 10mm; size: A4; }
    }
  </style>
</head>
<body>
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / PDF</button>
  <a class="btn-back" href="/owner">← Volver</a>

  <div class="page">
    <div class="portada">
      <div class="portada-header">
        <div>
          <div class="logo-text">ia<span class="logo-punto">.</span>rest</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px">${rest?.razon_social ?? rest?.nombre ?? ''}</div>
          ${rest?.nif ? `<div style="font-size:10px;color:#9ca3af">NIF: ${rest.nif}</div>` : ''}
        </div>
        <div class="num-expediente">
          <div style="font-weight:700;font-size:11px;color:#1a1a1a">${numExpediente}</div>
          <div>Expediente APPCC</div>
          <div>Generado: ${now}</div>
        </div>
      </div>
      <div class="portada-titulo">Dossier APPCC — ${evento.cliente_nombre}</div>
      <div class="portada-subtitulo">${fmtFecha(evento.fecha_evento)}</div>
      <div class="portada-grid">
        <div class="portada-card">
          <div class="portada-card-label">Establecimiento</div>
          <div class="portada-card-valor">${rest?.nombre ?? '—'}</div>
          ${rest?.direccion_fiscal ? `<div style="font-size:10px;color:#6b7280;margin-top:2px">${rest.direccion_fiscal}</div>` : ''}
        </div>
        <div class="portada-card">
          <div class="portada-card-label">Tipo de evento</div>
          <div class="portada-card-valor" style="text-transform:capitalize">${evento.tipo}</div>
          ${espacio ? `<div style="font-size:10px;color:#6b7280;margin-top:2px">📍 ${espacio.nombre}</div>` : ''}
        </div>
        <div class="portada-card">
          <div class="portada-card-label">Comensales</div>
          <div class="portada-card-valor">${evento.aforo_confirmado ?? evento.aforo_previsto ?? '—'}</div>
        </div>
        <div class="portada-card">
          <div class="portada-card-label">Cumplimiento APPCC</div>
          <div style="margin-top:4px">
            ${numKo === 0
              ? '<span class="badge-ok">✅ Sin incidencias</span>'
              : `<span class="badge-warn">⚠️ ${numKo} incidencia${numKo>1?'s':''}</span>`}
          </div>
        </div>
      </div>
    </div>

    <div class="seccion">
      <div class="seccion-titulo">Resumen de controles</div>
      <div class="resumen-grid">
        <div class="resumen-card"><div class="resumen-num" style="color:#1a1a1a">${temperaturas.length}</div><div class="resumen-label">Registros temperatura</div></div>
        <div class="resumen-card"><div class="resumen-num" style="color:#16a34a">${numOk}</div><div class="resumen-label">Conformes</div></div>
        <div class="resumen-card"><div class="resumen-num" style="color:${numKo>0?'#dc2626':'#16a34a'}">${numKo}</div><div class="resumen-label">No conformes</div></div>
        <div class="resumen-card"><div class="resumen-num" style="color:#1a1a1a">${testigos.length}</div><div class="resumen-label">Platos testigo</div></div>
      </div>
    </div>

    ${personal.length > 0 ? `
    <div class="seccion">
      <div class="seccion-titulo">Personal asignado al evento</div>
      <table>
        <thead><tr><th>Nombre</th><th>Función</th><th>Horario</th><th>Confirmado</th></tr></thead>
        <tbody>${(personal as Record<string,unknown>[]).map(rowPersonal).join('')}</tbody>
      </table>
    </div>` : ''}

    <div class="seccion">
      <div class="seccion-titulo">Registros de temperatura</div>
      ${temperaturas.length === 0
        ? '<p style="color:#9ca3af;font-size:11px;padding:8px 0">Sin registros de temperatura para este evento.</p>'
        : `<table>
          <thead><tr><th>Hora</th><th>Control</th><th>Valor</th><th>Límite legal</th><th>Resultado</th><th>Registrado por</th><th>Notas / Acción correctora</th></tr></thead>
          <tbody>${(temperaturas as Record<string,unknown>[]).map(rowTemp).join('')}</tbody>
        </table>`}
    </div>

    <div class="seccion">
      <div class="seccion-titulo">Platos testigo</div>
      ${testigos.length === 0
        ? '<p style="color:#9ca3af;font-size:11px;padding:8px 0">Sin platos testigo registrados.</p>'
        : `<table>
          <thead><tr><th>Hora</th><th>Plato</th><th>Nº Lote</th><th>Ubicación</th><th>Peso</th><th>Caduca</th><th>Etiqueta</th><th>Responsable</th></tr></thead>
          <tbody>${(testigos as Record<string,unknown>[]).map(rowTestigo).join('')}</tbody>
        </table>`}
    </div>

    <div class="seccion">
      <div class="seccion-titulo">Declaración de conformidad</div>
      <p style="font-size:10px;color:#4b5563;line-height:1.7;margin-bottom:24px">
        El abajo firmante declara que los registros de control de temperatura, las prácticas de higiene
        y manipulación de alimentos, así como los controles de trazabilidad documentados en el presente
        dossier han sido realizados de acuerdo con el Plan de Análisis de Peligros y Puntos de Control
        Crítico (APPCC) del establecimiento y con la normativa vigente (Reglamento (CE) 852/2004
        relativo a la higiene de los productos alimenticios).
        ${numKo > 0 ? ` Se registraron ${numKo} no conformidad(es) que fueron corregidas según el protocolo de acciones correctoras documentado.` : ''}
      </p>
      <div class="firma-grid">
        <div><div class="firma-box"><div style="margin-bottom:40px"></div>Firma del responsable APPCC</div></div>
        <div><div class="firma-box"><div style="margin-bottom:40px"></div>Sello del establecimiento</div></div>
      </div>
      <div style="margin-top:20px;font-size:9px;color:#9ca3af;text-align:center">
        Expediente ${numExpediente} · Generado con ia.rest · ${rest?.razon_social ?? rest?.nombre ?? ''}${rest?.nif ? ` · NIF ${rest.nif}` : ''}
      </div>
    </div>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
