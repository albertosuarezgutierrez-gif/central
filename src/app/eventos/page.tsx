'use client'
import { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ───────────────────────────────────────────────────────────────────
type Espacio = { id: string; nombre: string; tipo: string; aforo_maximo: number | null }
type DiaDisp = { fecha: string; disponible: boolean; evento_id: string | null; evento_tipo: string | null; coordinador: string | null }

type Evento = {
  id: string; numero_evento: string; tipo: string; estado: string
  fecha_evento: string; hora_inicio: string | null; hora_fin: string | null
  cliente_nombre: string; cliente_telefono: string | null; cliente_email: string | null
  aforo_previsto: number; precio_por_persona: number | null; precio_total: number | null
  modo_local: string; senial_pagada: boolean; notas_cocina: string | null
  espacios_evento: Espacio | null; coordinador: { nombre: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS_SEMANA = ['L','M','X','J','V','S','D']
const TIPO_ICON: Record<string, string> = { boda:'💍', comunion:'⛪', bautizo:'👶', cumpleanos:'🎂', empresa:'🏢', otro:'📅' }
const ESTADO_COLOR: Record<string, string> = { presupuesto:'#E8A33B', confirmado:'#3F7D44', en_curso:C.red, completado:'#6B7280', facturado:'#2B6A6E' }
const fmtEur = (n: number | null) => n ? `${n.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €` : '—'
const fmtFecha = (d: string) => { const dt = new Date(d + 'T00:00:00'); return `${dt.getDate()} ${MESES[dt.getMonth()]} ${dt.getFullYear()}` }
const diasHasta = (f: string) => { const d = Math.ceil((new Date(f + 'T00:00:00').getTime() - Date.now()) / 86400000); return d < 0 ? null : d === 0 ? '¡HOY!' : d === 1 ? 'mañana' : `${d}d` }

// ─── Calendario de disponibilidad ─────────────────────────────────────────────
function CalendarioDisponibilidad({ espacio, sh }: { espacio: Espacio; sh: () => Record<string, string> }) {
  const [mes, setMes] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [dias, setDias] = useState<DiaDisp[]>([])
  const [loading, setLoading] = useState(false)
  const [seleccionado, setSeleccionado] = useState<DiaDisp | null>(null)
  const [modalBloqueo, setModalBloqueo] = useState(false)
  const [formBloqueo, setFormBloqueo] = useState({ motivo: 'bloqueado', notas: '' })

  const cargar = useCallback(async () => {
    setLoading(true)
    const desde = `${mes.y}-${String(mes.m + 1).padStart(2, '0')}-01`
    const ultimoDia = new Date(mes.y, mes.m + 1, 0).getDate()
    const hasta = `${mes.y}-${String(mes.m + 1).padStart(2, '0')}-${ultimoDia}`
    const res = await fetch(`/api/owner/eventos/disponibilidad?espacio_id=${espacio.id}&desde=${desde}&hasta=${hasta}`, { headers: sh() })
    const data = await res.json()
    setDias(data.dias ?? [])
    setLoading(false)
  }, [espacio.id, mes, sh])

  useEffect(() => { cargar() }, [cargar])

  const primerDiaMes = new Date(mes.y, mes.m, 1).getDay()
  const offset = primerDiaMes === 0 ? 6 : primerDiaMes - 1 // lunes = 0
  const totalDias = new Date(mes.y, mes.m + 1, 0).getDate()

  const getDia = (n: number) => dias.find(d => new Date(d.fecha + 'T00:00:00').getDate() === n)
  const hoy = new Date().toISOString().slice(0, 10)

  const handleBloquear = async () => {
    if (!seleccionado) return
    await fetch('/api/owner/eventos/disponibilidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({
        espacio_id: espacio.id,
        fecha_inicio: seleccionado.fecha,
        fecha_fin: seleccionado.fecha,
        ...formBloqueo,
      }),
    })
    setModalBloqueo(false)
    setSeleccionado(null)
    cargar()
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      {/* Header espacio */}
      <div style={{ background: C.ink, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 16, fontWeight: 700, color: C.paper, fontStyle: 'italic' }}>{espacio.nombre}</div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 1 }}>
            {espacio.tipo} · {espacio.aforo_maximo ? `hasta ${espacio.aforo_maximo} personas` : 'aforo libre'}
          </div>
        </div>
        {/* Navegación mes */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setMes(m => { const d = new Date(m.y, m.m - 1); return { y: d.getFullYear(), m: d.getMonth() } })}
            style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.rule}`, background: 'transparent', color: C.paper, cursor: 'pointer', fontFamily: SN, fontSize: 13 }}>←</button>
          <span style={{ fontFamily: SE, fontSize: 14, color: C.paper, minWidth: 90, textAlign: 'center' }}>
            {MESES[mes.m]} {mes.y}
          </span>
          <button onClick={() => setMes(m => { const d = new Date(m.y, m.m + 1); return { y: d.getFullYear(), m: d.getMonth() } })}
            style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.rule}`, background: 'transparent', color: C.paper, cursor: 'pointer', fontFamily: SN, fontSize: 13 }}>→</button>
        </div>
      </div>

      {/* Cabecera días semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: C.bone }}>
        {DIAS_SEMANA.map(d => (
          <div key={d} style={{ padding: '6px 0', textAlign: 'center', fontFamily: SN, fontSize: 10, fontWeight: 700, color: d === 'S' || d === 'D' ? C.red : C.ink3, textTransform: 'uppercase', letterSpacing: '.08em' }}>{d}</div>
        ))}
      </div>

      {/* Grid días */}
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: C.rule, padding: 1 }}>
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} style={{ background: C.paper, minHeight: 52 }} />)}
          {Array.from({ length: totalDias }).map((_, i) => {
            const n = i + 1
            const fechaStr = `${mes.y}-${String(mes.m + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`
            const dia = getDia(n)
            const esHoy = fechaStr === hoy
            const pasado = fechaStr < hoy
            const disponible = dia?.disponible ?? true
            const esSel = seleccionado?.fecha === fechaStr

            return (
              <div
                key={n}
                onClick={() => !pasado && setSeleccionado(dia ?? { fecha: fechaStr, disponible: true, evento_id: null, evento_tipo: null, coordinador: null })}
                style={{
                  background: esSel ? C.ink : disponible ? C.paper : '#FFF0EE',
                  minHeight: 52, padding: '6px 6px 4px',
                  cursor: pasado ? 'default' : 'pointer',
                  opacity: pasado ? 0.4 : 1,
                  borderTop: esHoy ? `2px solid ${C.red}` : undefined,
                }}
              >
                <div style={{ fontFamily: SN, fontSize: 12, fontWeight: esHoy ? 700 : 400, color: esSel ? C.paper : esHoy ? C.red : C.ink }}>{n}</div>
                {!disponible && dia?.evento_tipo && (
                  <div style={{ fontFamily: SN, fontSize: 9, color: esSel ? C.paper : C.red, marginTop: 2, lineHeight: 1.2 }}>
                    {TIPO_ICON[dia.evento_tipo] ?? '📅'}
                    {dia.coordinador ? ` ${dia.coordinador.split(' ')[0]}` : ''}
                  </div>
                )}
                {!disponible && !dia?.evento_tipo && (
                  <div style={{ fontFamily: SN, fontSize: 9, color: C.ink3, marginTop: 2 }}>🔒</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Panel día seleccionado */}
      {seleccionado && (
        <div style={{ borderTop: `1px solid ${C.rule}`, padding: '12px 16px', background: C.bone }}>
          <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
            {fmtFecha(seleccionado.fecha)}
          </div>
          {seleccionado.disponible ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: SN, fontSize: 12, color: C.green }}>✓ Disponible</span>
              <button onClick={() => setModalBloqueo(true)} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 11, color: C.ink3, cursor: 'pointer' }}>
                🔒 Bloquear
              </button>
            </div>
          ) : (
            <div style={{ fontFamily: SN, fontSize: 12, color: C.red }}>
              {seleccionado.evento_tipo ? `${TIPO_ICON[seleccionado.evento_tipo]} Ocupado — ${seleccionado.evento_tipo}${seleccionado.coordinador ? ` (${seleccionado.coordinador})` : ''}` : '🔒 Bloqueado manualmente'}
            </div>
          )}
        </div>
      )}

      {/* Modal bloquear fecha */}
      {modalBloqueo && seleccionado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: C.paper, borderRadius: 12, padding: 20, width: '100%', maxWidth: 340 }}>
            <div style={{ fontFamily: SE, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 12 }}>
              Bloquear {fmtFecha(seleccionado.fecha)}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Motivo</div>
              <select value={formBloqueo.motivo} onChange={e => setFormBloqueo(f => ({ ...f, motivo: e.target.value }))}
                style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 13, color: C.ink }}>
                <option value="bloqueado">Bloqueado</option>
                <option value="mantenimiento">Mantenimiento</option>
                <option value="reserva_tentativa">Reserva tentativa</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Notas</div>
              <input type="text" placeholder="Opcional" value={formBloqueo.notas} onChange={e => setFormBloqueo(f => ({ ...f, notas: e.target.value }))}
                style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalBloqueo(false)} style={{ padding: '7px 14px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleBloquear} style={{ padding: '7px 14px', borderRadius: 5, border: 'none', background: C.ink, color: C.paper, fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔒 Bloquear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tarjeta evento coordinador ───────────────────────────────────────────────
function TarjetaEventoCoord({ evento, sh, onEstado }: {
  evento: Evento; sh: () => Record<string, string>
  onEstado: (id: string, estado: string) => void
}) {
  const dias = diasHasta(evento.fecha_evento)
  const color = ESTADO_COLOR[evento.estado] ?? C.ink3

  const abrirPresupuesto = () => window.open(`/api/owner/eventos/presupuesto?evento_id=${evento.id}`, '_blank')

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{evento.numero_evento}</span>
            <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 7px', borderRadius: 99, background: color + '22', color, fontWeight: 600 }}>
              {evento.estado}
            </span>
            {dias && <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 7px', borderRadius: 99, background: dias === '¡HOY!' ? C.red + '22' : C.amber + '22', color: dias === '¡HOY!' ? C.red : C.amber, fontWeight: 700 }}>{dias}</span>}
          </div>
          <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>
            {TIPO_ICON[evento.tipo]} {evento.cliente_nombre}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>{fmtEur(evento.precio_total)}</div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{evento.aforo_previsto} pers</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>📅 {fmtFecha(evento.fecha_evento)}{evento.hora_inicio ? ` · ${evento.hora_inicio}` : ''}</span>
        {evento.espacios_evento && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>📍 {evento.espacios_evento.nombre}</span>}
        {evento.cliente_telefono && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>📞 {evento.cliente_telefono}</span>}
      </div>

      {/* Señal */}
      {evento.precio_total && (
        <div style={{ fontFamily: SN, fontSize: 11, color: evento.senial_pagada ? C.green : C.amber, marginBottom: 10 }}>
          {evento.senial_pagada ? '✓ Señal cobrada' : '⚠ Señal pendiente'}
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={abrirPresupuesto} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: '#2B6A6E', cursor: 'pointer' }}>
          📄 Presupuesto
        </button>
        {!evento.senial_pagada && evento.estado === 'confirmado' && (
          <button onClick={() => onEstado(evento.id, 'senial')} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: C.green + '22', fontFamily: SN, fontSize: 12, color: C.green, fontWeight: 600, cursor: 'pointer' }}>
            ✓ Señal cobrada
          </button>
        )}
        {evento.estado === 'presupuesto' && (
          <button onClick={() => onEstado(evento.id, 'confirmado')} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: C.green + '22', fontFamily: SN, fontSize: 12, color: C.green, fontWeight: 600, cursor: 'pointer' }}>
            ✓ Confirmar
          </button>
        )}
        {evento.cliente_telefono && (
          <a href={`https://wa.me/34${evento.cliente_telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
            style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: '#25D366', textDecoration: 'none', cursor: 'pointer' }}>
            💬 WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Panel principal /eventos ─────────────────────────────────────────────────
export default function EventosPage() {
  const { session, checking: authLoading } = useAuth()
  const [tab, setTab] = useState<'mis_eventos' | 'disponibilidad'>('mis_eventos')
  const [eventos, setEventos] = useState<Evento[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [loading, setLoading] = useState(true)

  const sh = useCallback((): Record<string, string> => {
    if (!session) return {}
    return {
      'x-ia-session': JSON.stringify(session),
      'x-ia-restaurante-id': session.restaurante_id,
    }
  }, [session])

  const cargar = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [evRes, espRes] = await Promise.all([
        fetch('/api/eventos', { headers: sh() }),
        fetch('/api/owner/eventos/espacios', { headers: sh() }),
      ])
      const [evData, espData] = await Promise.all([evRes.json(), espRes.json()])
      setEventos(evData.eventos ?? [])
      setEspacios(espData.espacios ?? [])
    } finally { setLoading(false) }
  }, [session, sh])

  useEffect(() => { if (session) cargar() }, [session, cargar])

  const onEstado = async (id: string, accion: string) => {
    if (accion === 'senial') {
      await fetch('/api/owner/eventos', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id, senial_pagada: true }) })
    } else {
      await fetch('/api/owner/eventos', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id, estado: accion }) })
    }
    cargar()
  }

  if (authLoading) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: C.ink3, fontFamily: SN }}>Cargando...</span></div>

  if (!session) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: SE, fontSize: 22, color: C.paper, marginBottom: 8 }}>Acceso restringido</div>
        <a href="/login" style={{ color: C.red, fontFamily: SN, fontSize: 14 }}>Iniciar sesión →</a>
      </div>
    </div>
  )

  // Stats rápidas
  const hoy = new Date().toISOString().slice(0, 10)
  const proximos = eventos.filter(e => e.fecha_evento >= hoy)
  const pendientesConfirmar = eventos.filter(e => e.estado === 'presupuesto')
  const ingresosPrev = eventos.filter(e => ['confirmado', 'en_curso'].includes(e.estado)).reduce((s, e) => s + (e.precio_total ?? 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* Header */}
      <div style={{ background: C.ink, borderBottom: `1px solid ${C.rule}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, color: C.paper, fontStyle: 'italic' }}>ia.rest Eventos</div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{session.nombre} · {session.restaurante_id?.slice(0, 8)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['mis_eventos', 'disponibilidad'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 12px', borderRadius: 6,
              background: tab === t ? C.red : 'transparent',
              border: `1px solid ${tab === t ? C.red : C.rule}`,
              color: tab === t ? '#fff' : C.ink3,
              fontFamily: SN, fontSize: 12, cursor: 'pointer',
            }}>
              {t === 'mis_eventos' ? '📋 Mis eventos' : '📅 Disponibilidad'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 40px', maxWidth: 600, margin: '0 auto' }}>

        {tab === 'mis_eventos' && (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Próximos', value: proximos.length.toString() },
                { label: 'Por confirmar', value: pendientesConfirmar.length.toString(), alert: pendientesConfirmar.length > 0 },
                { label: 'Ingresos previstos', value: fmtEur(ingresosPrev) },
              ].map(s => (
                <div key={s.label} style={{ background: C.paper, border: `1px solid ${s.alert ? C.amber : C.rule}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontFamily: SN, fontSize: 10, color: s.alert ? C.amber : C.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, color: s.alert ? C.amber : C.ink, fontStyle: 'italic' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, fontFamily: SN, fontSize: 13, color: C.ink3 }}>Cargando eventos...</div>
            ) : eventos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, background: C.paper, borderRadius: 10 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                <div style={{ fontFamily: SE, fontSize: 16, color: C.ink }}>Sin eventos asignados</div>
              </div>
            ) : (
              eventos.map(e => <TarjetaEventoCoord key={e.id} evento={e} sh={sh} onEstado={onEstado} />)
            )}
          </>
        )}

        {tab === 'disponibilidad' && (
          <>
            <div style={{ fontFamily: SE, fontSize: 16, fontWeight: 700, color: C.paper, fontStyle: 'italic', marginBottom: 12 }}>
              Disponibilidad de espacios
            </div>
            {espacios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, background: C.paper, borderRadius: 10 }}>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>No hay espacios configurados. El owner debe añadirlos en /owner → Eventos.</div>
              </div>
            ) : (
              espacios.map(esp => <CalendarioDisponibilidad key={esp.id} espacio={esp} sh={sh} />)
            )}
            {/* Leyenda */}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '12px 0', flexWrap: 'wrap' }}>
              {[
                { color: C.paper, label: 'Disponible' },
                { color: '#FFF0EE', label: 'Ocupado' },
                { color: C.ink, label: 'Seleccionado' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: l.color, border: `1px solid ${C.rule}` }} />
                  <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{l.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
