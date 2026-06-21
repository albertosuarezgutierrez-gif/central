import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'

const TIPO_LABELS: Record<string, string> = {
  boda: '💍 Boda', comunion: '⛪ Comunión', bautizo: '👶 Bautizo',
  cumpleanos: '🎂 Celebración', empresa: '🏢 Evento', otro: '📅 Evento',
}
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export default async function PortalClientePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()

  // Buscar portal por token
  const { data: portal } = await supabase
    .from('evento_portal_cliente')
    .select('*, eventos(*, restaurantes(nombre,telefono,logo_url,ciudad), espacios_evento(nombre,direccion), menus_evento(nombre,descripcion))')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!portal) notFound()

  // Registrar acceso
  await supabase.from('evento_portal_cliente').update({
    ultimo_acceso: new Date().toISOString(),
    veces_accedido: (portal.veces_accedido ?? 0) + 1,
  }).eq('token', token)

  const evento = portal.eventos as {
    numero_evento: string; tipo: string; cliente_nombre: string
    fecha_evento: string; hora_inicio: string | null; hora_fin: string | null
    aforo_previsto: number; aforo_confirmado: number | null
    notas_sala: string | null; portal_token: string
    restaurantes: { nombre: string; telefono: string | null; logo_url: string | null; ciudad: string | null }
    espacios_evento: { nombre: string; direccion: string | null } | null
    menus_evento: { nombre: string; descripcion: string | null } | null
  }

  if (!evento) notFound()

  const rest = evento.restaurantes
  const fecha = new Date(evento.fecha_evento + 'T00:00:00')
  const fmtFecha = `${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`

  // Cargar pases del menú si aplica
  let pases: { numero_pase: number; nombre: string; hora_prevista: string | null; items: { nombre: string }[] }[] = []
  if (portal.mostrar_menu) {
    const { data: p } = await supabase
      .from('evento_pases')
      .select('numero_pase, nombre, hora_prevista, items:evento_pase_items(nombre)')
      .eq('evento_id', portal.evento_id)
      .order('numero_pase')
    pases = (p as typeof pases) ?? []
  }

  // Cargar timeline
  let timeline: { hora: string; titulo: string; descripcion: string | null; icono: string }[] = []
  if (portal.mostrar_timeline) {
    const { data: t } = await supabase
      .from('evento_timeline')
      .select('hora, titulo, descripcion, icono')
      .eq('evento_id', portal.evento_id)
      .eq('visible_cliente', true)
      .order('orden')
    timeline = (t as typeof timeline) ?? []
  }

  // Cargar invitados (solo el total y si hay mesa asignada para el token)
  let totalInvitados = 0
  if (portal.mostrar_invitados) {
    const { count } = await supabase.from('evento_invitados')
      .select('id', { count: 'exact', head: true }).eq('evento_id', portal.evento_id)
    totalInvitados = count ?? 0
  }

  const C = {
    bg: '#14110E', bg2: '#1E1914', bg3: '#2A221A',
    paper: '#F6F1E7', ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52',
    red: '#D9442B', amber: '#E8A33B', green: '#3F7D44', rule: '#3A332C',
  }

  return (
    <html lang="es">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{TIPO_LABELS[evento.tipo]} · {evento.cliente_nombre} · {rest.nombre}</title>
        <meta name="robots" content="noindex,nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,600;1,300;1,600&family=Inter+Tight:wght@300;400;600&display=swap" rel="stylesheet" />
        <style>{`
          * { margin:0; padding:0; box-sizing:border-box; }
          body { background:${C.bg}; color:${C.paper}; font-family:'Inter Tight',system-ui,sans-serif; min-height:100vh; }
          .serif { font-family:'Newsreader',Georgia,serif; }
          .w { max-width:560px; margin:0 auto; padding:0 16px 60px; }
          .card { background:${C.bg2}; border:1px solid ${C.rule}; border-radius:12px; overflow:hidden; margin-bottom:16px; }
          .card-hdr { padding:14px 18px; border-bottom:1px solid ${C.rule}; }
          .card-body { padding:16px 18px; }
          .tag { display:inline-block; padding:3px 10px; border-radius:99px; font-size:11px; font-weight:600; background:${C.red}22; color:${C.red}; }
          .pase-item { padding:8px 0; border-bottom:1px solid ${C.rule}22; font-size:13px; color:${C.ink3}; }
          .timeline-item { display:flex; gap:12px; padding:10px 0; border-bottom:1px solid ${C.rule}22; }
          .timeline-hora { font-family:'Inter Tight',monospace; font-size:13px; color:${C.amber}; min-width:44px; }
        `}</style>
      </head>
      <body>
        <div className="w">
          {/* Header restaurante */}
          <div style={{ padding: '24px 0 16px', textAlign: 'center' }}>
            {rest.logo_url && <img src={rest.logo_url} alt={rest.nombre} style={{ height: 40, marginBottom: 12, borderRadius: 8 }} />}
            <div style={{ fontSize: 13, color: C.ink3 }}>{rest.nombre}{rest.ciudad ? ` · ${rest.ciudad}` : ''}</div>
          </div>

          {/* Hero del evento */}
          <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{['💍','⛪','👶','🎂','🏢','📅'][['boda','comunion','bautizo','cumpleanos','empresa','otro'].indexOf(evento.tipo)] ?? '📅'}</div>
            <h1 className="serif" style={{ fontSize: 32, fontWeight: 600, fontStyle: 'italic', lineHeight: 1.2, color: C.paper, marginBottom: 8 }}>
              {evento.cliente_nombre}
            </h1>
            <div style={{ fontSize: 15, color: C.amber, fontWeight: 300 }}>{fmtFecha}</div>
            {evento.hora_inicio && (
              <div style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>
                {evento.hora_inicio}{evento.hora_fin ? ` — ${evento.hora_fin}` : ''}
              </div>
            )}
            {evento.espacios_evento && (
              <div style={{ marginTop: 8, fontSize: 13, color: C.ink3 }}>
                📍 {evento.espacios_evento.nombre}
                {evento.espacios_evento.direccion ? ` · ${evento.espacios_evento.direccion}` : ''}
              </div>
            )}
          </div>

          {/* Notas para el cliente */}
          {evento.notas_sala && (
            <div className="card" style={{ borderColor: C.amber + '44' }}>
              <div className="card-body" style={{ background: C.amber + '11' }}>
                <div style={{ fontSize: 12, color: C.amber, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>📌 Información importante</div>
                <div style={{ fontSize: 14, color: C.paper, lineHeight: 1.6 }}>{evento.notas_sala}</div>
              </div>
            </div>
          )}

          {/* Menú */}
          {portal.mostrar_menu && evento.menus_evento && (
            <div className="card">
              <div className="card-hdr">
                <div className="serif" style={{ fontSize: 18, fontWeight: 600, fontStyle: 'italic', color: C.paper }}>🍽️ {evento.menus_evento.nombre}</div>
                {evento.menus_evento.descripcion && <div style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>{evento.menus_evento.descripcion}</div>}
              </div>
              {pases.length > 0 && (
                <div className="card-body">
                  {pases.map(p => (
                    <div key={p.numero_pase} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: C.amber, marginBottom: 6 }}>
                        {p.hora_prevista ? `${p.hora_prevista} · ` : ''}{p.nombre}
                      </div>
                      {p.items.map((item, i) => (
                        <div key={i} className="pase-item">{item.nombre}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          {portal.mostrar_timeline && timeline.length > 0 && (
            <div className="card">
              <div className="card-hdr">
                <div className="serif" style={{ fontSize: 18, fontWeight: 600, fontStyle: 'italic', color: C.paper }}>🗓 Planificación del día</div>
              </div>
              <div className="card-body">
                {timeline.map((t, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-hora">{t.hora.slice(0, 5)}</div>
                    <div>
                      <div style={{ fontSize: 14, color: C.paper }}>{t.icono} {t.titulo}</div>
                      {t.descripcion && <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{t.descripcion}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invitados */}
          {portal.mostrar_invitados && totalInvitados > 0 && (
            <div className="card">
              <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em' }}>Invitados registrados</div>
                  <div className="serif" style={{ fontSize: 28, fontWeight: 600, fontStyle: 'italic', color: C.paper }}>{totalInvitados}</div>
                </div>
                <div style={{ fontSize: 13, color: C.ink3 }}>de {evento.aforo_confirmado ?? evento.aforo_previsto} previstos</div>
              </div>
            </div>
          )}

          {/* Contacto */}
          {rest.telefono && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <a href={`https://wa.me/34${rest.telefono.replace(/\D/g,'')}`}
                style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 8, background: '#25D366', color: '#fff', fontFamily: "'Inter Tight',sans-serif", fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                💬 Contactar con {rest.nombre}
              </a>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px 0 0', fontSize: 11, color: C.rule }}>
            Gestionado con ia.rest · {evento.numero_evento}
          </div>
        </div>
      </body>
    </html>
  )
}
