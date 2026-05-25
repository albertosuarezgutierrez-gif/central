import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'

const LIMITES: Record<string, { limite: number; op: 'gte'|'lte'; etiqueta: string; unidad: string }> = {
  temperatura_camara:             { limite: 4,  op: 'lte', etiqueta: 'Temperatura cámara',            unidad: '°C' },
  temperatura_coccion:            { limite: 65, op: 'gte', etiqueta: 'Temperatura cocción',            unidad: '°C' },
  temperatura_transporte_salida:  { limite: 4,  op: 'lte', etiqueta: 'Temperatura transporte (salida)',unidad: '°C' },
  temperatura_transporte_llegada: { limite: 8,  op: 'lte', etiqueta: 'Temperatura transporte (llegada)',unidad:'°C' },
  temperatura_servicio_caliente:  { limite: 63, op: 'gte', etiqueta: 'Temperatura servicio caliente',  unidad: '°C' },
  temperatura_servicio_frio:      { limite: 8,  op: 'lte', etiqueta: 'Temperatura servicio frío',      unidad: '°C' },
}

const fmtHora = (d: string) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const fmtFecha = (d: string) => new Date(d).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
const fmtFechaCorta = (d: string) => new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' })

export default async function AppccPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()

  const [
    { data: evento },
    { data: appcc },
    { data: personalEvento },
  ] = await Promise.all([
    supabase.from('eventos')
      .select(`*, restaurantes(nombre, nif, razon_social, direccion_fiscal), espacios_evento(nombre, tipo, aforo_maximo)`)
      .eq('id', id).single(),
    supabase.from('evento_appcc')
      .select(`*, registrado_por_personal:personal(nombre, rol)`)
      .eq('evento_id', id).order('hora_registro', { ascending: true }),
    supabase.from('evento_personal')
      .select(`*, personal(nombre, rol)`)
      .eq('evento_id', id).order('hora_inicio'),
  ])

  if (!evento) return notFound()

  const rest = evento.restaurantes as { nombre:string; nif?:string; razon_social?:string; direccion_fiscal?:string } | null
  const espacio = Array.isArray(evento.espacios_evento) ? evento.espacios_evento[0] : evento.espacios_evento as { nombre:string } | null

  const temperaturas = (appcc ?? []).filter(r => r.tipo_registro.startsWith('temperatura_'))
  const testigoRecords = (appcc ?? []).filter(r => r.tipo_registro === 'plato_testigo')
  const numIncidencias = temperaturas.filter(r => r.cumple === false).length
  const numTemp = temperaturas.length
  const numOk = temperaturas.filter(r => r.cumple === true).length

  const numExpediente = `APPCC-${new Date(evento.fecha_evento).getFullYear()}-${id.slice(0,8).toUpperCase()}`

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dossier APPCC — {evento.cliente_nombre} — {fmtFechaCorta(evento.fecha_evento)}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #f5f5f5; }
          .page { background: white; max-width: 210mm; margin: 0 auto; padding: 0; box-shadow: 0 0 20px rgba(0,0,0,.15); }

          /* PORTADA */
          .portada { padding: 40px 40px 30px; border-bottom: 3px solid #D9442B; }
          .portada-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
          .logo-text { font-size: 26px; font-weight: 700; letter-spacing: -1px; }
          .logo-punto { color: #D9442B; }
          .num-expediente { font-size: 10px; color: #6b7280; text-align: right; line-height: 1.6; }
          .portada-titulo { font-size: 22px; font-weight: 700; margin-bottom: 6px; color: #1a1a1a; }
          .portada-subtitulo { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
          .portada-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .portada-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px; }
          .portada-card-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; margin-bottom: 4px; }
          .portada-card-valor { font-size: 13px; font-weight: 600; color: #1a1a1a; }
          .badge-ok { display:inline-block; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }
          .badge-warn { display:inline-block; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }
          .badge-ko { display:inline-block; background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:600; }

          /* SECCIONES */
          .seccion { padding: 24px 40px; border-bottom: 1px solid #e5e7eb; }
          .seccion:last-child { border-bottom: none; }
          .seccion-titulo { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #D9442B; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
          .seccion-titulo::after { content: ''; flex: 1; height: 1px; background: #fca5a5; }

          /* TABLAS */
          table { width: 100%; border-collapse: collapse; }
          th { background: #f3f4f6; text-align: left; padding: 6px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
          td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 10.5px; vertical-align: middle; }
          tr:last-child td { border-bottom: none; }
          tr.ko td { background: #fff5f5; }
          tr.ko-corregido td { background: #fffbeb; }
          .t-ok { color: #16a34a; font-weight: 700; }
          .t-ko { color: #dc2626; font-weight: 700; }
          .t-warn { color: #d97706; font-weight: 700; }
          .valor-grande { font-size: 13px; font-weight: 700; }

          /* RESUMEN */
          .resumen-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .resumen-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; text-align: center; }
          .resumen-num { font-size: 26px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
          .resumen-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }

          /* FIRMA */
          .firma-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .firma-box { border-top: 1px solid #1a1a1a; padding-top: 8px; font-size: 9px; color: #6b7280; text-align: center; min-height: 60px; }

          /* PRINT */
          .btn-print { position: fixed; top: 20px; right: 20px; background: #D9442B; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(217,68,43,.4); z-index: 100; }
          .btn-back { position: fixed; top: 20px; right: 140px; background: #1a1a1a; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; z-index: 100; text-decoration: none; display: inline-block; }

          @media print {
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { background: white; font-size: 10px; }
            .page { box-shadow: none; max-width: 100%; }
            .btn-print, .btn-back { display: none; }
            .seccion { padding: 18px 30px; }
            .portada { padding: 30px 30px 20px; }
            @page { margin: 10mm; size: A4; }
          }
        `}</style>
      </head>
      <body>
        <button className="btn-print" onClick={() => {if(typeof window !== "undefined") window.print()}}>🖨️ Imprimir / PDF</button>
        <a className="btn-back" href={`/owner`}>← Volver</a>

        <div className="page">
          {/* PORTADA */}
          <div className="portada">
            <div className="portada-header">
              <div>
                <div className="logo-text">ia<span className="logo-punto">.</span>rest</div>
                <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>{rest?.razon_social ?? rest?.nombre ?? ''}</div>
                {rest?.nif && <div style={{fontSize:10,color:'#9ca3af'}}>NIF: {rest.nif}</div>}
              </div>
              <div className="num-expediente">
                <div style={{fontWeight:700,fontSize:11,color:'#1a1a1a'}}>{numExpediente}</div>
                <div>Expediente APPCC</div>
                <div>Generado: {fmtFechaCorta(new Date().toISOString())}</div>
              </div>
            </div>

            <div className="portada-titulo">Dossier APPCC — {evento.cliente_nombre}</div>
            <div className="portada-subtitulo">{fmtFecha(evento.fecha_evento)}</div>

            <div className="portada-grid">
              <div className="portada-card">
                <div className="portada-card-label">Establecimiento</div>
                <div className="portada-card-valor">{rest?.nombre ?? '—'}</div>
                {rest?.direccion_fiscal && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{rest.direccion_fiscal}</div>}
              </div>
              <div className="portada-card">
                <div className="portada-card-label">Tipo de evento</div>
                <div className="portada-card-valor" style={{textTransform:'capitalize'}}>{evento.tipo}</div>
                {espacio && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>📍 {espacio.nombre}</div>}
              </div>
              <div className="portada-card">
                <div className="portada-card-label">Comensales</div>
                <div className="portada-card-valor">{evento.aforo_confirmado ?? evento.aforo_previsto ?? '—'}</div>
              </div>
              <div className="portada-card">
                <div className="portada-card-label">Cumplimiento APPCC</div>
                <div style={{marginTop:4}}>
                  {numIncidencias === 0
                    ? <span className="badge-ok">✅ Sin incidencias</span>
                    : <span className="badge-warn">⚠️ {numIncidencias} incidencia{numIncidencias > 1 ? 's' : ''}</span>
                  }
                </div>
              </div>
            </div>
          </div>

          {/* RESUMEN EJECUTIVO */}
          <div className="seccion">
            <div className="seccion-titulo">Resumen de controles</div>
            <div className="resumen-grid">
              {[
                { num: numTemp, label: 'Registros temperatura', color: '#1a1a1a' },
                { num: numOk, label: 'Conformes', color: '#16a34a' },
                { num: numIncidencias, label: 'No conformes', color: numIncidencias > 0 ? '#dc2626' : '#16a34a' },
                { num: testigoRecords.length, label: 'Platos testigo', color: '#1a1a1a' },
              ].map((k,i) => (
                <div key={i} className="resumen-card">
                  <div className="resumen-num" style={{color:k.color}}>{k.num}</div>
                  <div className="resumen-label">{k.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PERSONAL ASIGNADO */}
          {personalEvento && personalEvento.length > 0 && (
            <div className="seccion">
              <div className="seccion-titulo">Personal asignado al evento</div>
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Función</th>
                    <th>Horario</th>
                    <th>Confirmado</th>
                  </tr>
                </thead>
                <tbody>
                  {personalEvento.map((p: { id:string; nombre_externo?:string; rol:string; hora_inicio?:string; hora_fin?:string; confirmado:boolean; personal?:{nombre:string;rol:string} }) => (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{(p.personal as {nombre:string}|null)?.nombre ?? p.nombre_externo ?? '—'}</td>
                      <td style={{textTransform:'capitalize'}}>{p.rol.replace('_',' ')}</td>
                      <td>{p.hora_inicio ? `${p.hora_inicio} – ${p.hora_fin ?? '?'}` : '—'}</td>
                      <td>{p.confirmado ? <span className="t-ok">✅ Confirmado</span> : <span className="t-warn">⏳ Pendiente</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* REGISTROS DE TEMPERATURA */}
          <div className="seccion">
            <div className="seccion-titulo">Registros de temperatura</div>
            {temperaturas.length === 0 ? (
              <div style={{color:'#9ca3af',fontSize:11,padding:'8px 0'}}>Sin registros de temperatura para este evento.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Control</th>
                    <th>Valor</th>
                    <th>Límite legal</th>
                    <th>Resultado</th>
                    <th>Registrado por</th>
                    <th>Notas / Acción correctora</th>
                  </tr>
                </thead>
                <tbody>
                  {temperaturas.map((r: {id:string;tipo_registro:string;valor:string|null;limite_legal:number|null;cumple:boolean|null;hora_registro:string;registrado_por_personal?:{nombre:string}|null;notas?:string}) => {
                    const lim = LIMITES[r.tipo_registro]
                    const cumple = r.cumple
                    const rowClass = cumple === false ? 'ko' : ''
                    return (
                      <tr key={r.id} className={rowClass}>
                        <td style={{whiteSpace:'nowrap',fontWeight:600}}>{fmtHora(r.hora_registro)}</td>
                        <td>{lim?.etiqueta ?? r.tipo_registro}</td>
                        <td>
                          <span className={`valor-grande ${cumple === true ? 't-ok' : cumple === false ? 't-ko' : ''}`}>
                            {r.valor}°C
                          </span>
                        </td>
                        <td style={{color:'#6b7280'}}>
                          {lim ? `${lim.op === 'lte' ? '≤' : '≥'}${lim.limite}°C` : (r.limite_legal ? `${r.limite_legal}°C` : '—')}
                        </td>
                        <td>
                          {cumple === true && <span className="badge-ok">✅ CONFORME</span>}
                          {cumple === false && <span className="badge-ko">❌ NO CONFORME</span>}
                          {cumple === null && <span style={{color:'#9ca3af'}}>—</span>}
                        </td>
                        <td style={{color:'#6b7280'}}>{(r.registrado_por_personal as {nombre:string}|null)?.nombre ?? '—'}</td>
                        <td style={{color:'#6b7280',fontSize:10}}>{r.notas ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* PLATOS TESTIGO */}
          <div className="seccion">
            <div className="seccion-titulo">Platos testigo</div>
            {testigoRecords.length === 0 ? (
              <div style={{color:'#9ca3af',fontSize:11,padding:'8px 0'}}>Sin platos testigo registrados para este evento.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Plato</th>
                    <th>Nº Lote</th>
                    <th>Ubicación</th>
                    <th>Peso</th>
                    <th>Caduca</th>
                    <th>Etiqueta</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {testigoRecords.map((r: {id:string;hora_registro:string;plato_testigo_plato?:string;plato_testigo_lote?:string;plato_testigo_ubicacion?:string;plato_testigo_cantidad_gramos?:number;plato_testigo_expira_at?:string;etiqueta_impresa?:boolean;registrado_por_personal?:{nombre:string}|null}) => (
                    <tr key={r.id}>
                      <td style={{fontWeight:600,whiteSpace:'nowrap'}}>{fmtHora(r.hora_registro)}</td>
                      <td style={{fontWeight:600}}>{r.plato_testigo_plato ?? '—'}</td>
                      <td style={{fontFamily:'monospace',fontSize:10}}>{r.plato_testigo_lote ?? '—'}</td>
                      <td>{r.plato_testigo_ubicacion ?? '—'}</td>
                      <td>{r.plato_testigo_cantidad_gramos ? `${r.plato_testigo_cantidad_gramos} g` : '—'}</td>
                      <td style={{color: r.plato_testigo_expira_at ? '#1a1a1a' : '#9ca3af'}}>
                        {r.plato_testigo_expira_at ? fmtFechaCorta(r.plato_testigo_expira_at) : '—'}
                      </td>
                      <td>{r.etiqueta_impresa ? <span className="badge-ok">✅</span> : <span className="badge-warn">Pendiente</span>}</td>
                      <td style={{color:'#6b7280'}}>{(r.registrado_por_personal as {nombre:string}|null)?.nombre ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* DECLARACIÓN Y FIRMA */}
          <div className="seccion">
            <div className="seccion-titulo">Declaración de conformidad</div>
            <p style={{fontSize:10,color:'#4b5563',lineHeight:1.7,marginBottom:24}}>
              El abajo firmante declara que los registros de control de temperatura, las prácticas de higiene
              y manipulación de alimentos, así como los controles de trazabilidad documentados en el presente
              dossier han sido realizados de acuerdo con el Plan de Análisis de Peligros y Puntos de Control
              Crítico (APPCC) del establecimiento y con la normativa vigente (Reglamento (CE) 852/2004 relativo
              a la higiene de los productos alimenticios).
              {numIncidencias > 0 && ` Se registraron ${numIncidencias} no conformidad(es) que fueron corregidas según el protocolo de acciones correctoras documentado.`}
            </p>
            <div className="firma-grid">
              <div>
                <div className="firma-box">
                  <div style={{marginBottom:40}}></div>
                  Firma del responsable APPCC
                </div>
              </div>
              <div>
                <div className="firma-box">
                  <div style={{marginBottom:40}}></div>
                  Sello del establecimiento
                </div>
              </div>
            </div>
            <div style={{marginTop:20,fontSize:9,color:'#9ca3af',textAlign:'center'}}>
              Expediente {numExpediente} · Generado con ia.rest · {rest?.razon_social ?? rest?.nombre ?? ''} {rest?.nif ? `· NIF ${rest.nif}` : ''}
            </div>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelector('.btn-print').addEventListener('click', function(){ window.print() });
        `}} />
      </body>
    </html>
  )
}
