'use client'
import { TabChecklists, TabInformes, TabFacturacion } from './extra-tabs'
import { useState, useEffect, useCallback } from 'react'
import { eur } from '@/lib/dinero'

// ─── Constantes ────────────────────────────────────────────────
const PROPS = [
  { id: 'prop_house_sevillana', name: 'House Sevillana', color: '#16a34a', short: 'HS' },
  { id: 'prop_duplex_center',   name: 'Dúplex Center',   color: '#2563eb', short: 'DC' },
  { id: 'prop_luxury_busto',    name: 'Luxury Busto',    color: '#9333ea', short: 'LB' },
  { id: 'prop_busto_reform',    name: 'Busto Reform',    color: '#ea580c', short: 'BR' },
]
const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TIPO_LIMPIEZA = [
  { value: 'estandar',      label: '🧹 Estándar',      color: '#16a34a' },
  { value: 'profunda',      label: '🫧 Profunda',       color: '#2563eb' },
  { value: 'gran_suciedad', label: '⚠️ Gran suciedad',  color: '#dc2626' },
]
const CAT_PROVEEDOR = ['general', 'limpieza', 'lenceria', 'lavanderia', 'mantenimiento']
const CAT_PRODUCTO  = ['limpieza', 'lenceria', 'amenities', 'consumible', 'herramienta']
const TIPO_LENCERIA = [
  'sabana_bajera', 'sabana_encimera', 'funda_almohada', 'toalla_bano',
  'toalla_mano', 'alfombrin', 'colcha', 'almohada', 'nórdico', 'otro',
]
const TABS = ['Hoy', 'Tareas', 'Semana', 'Limpiadoras', 'Disponibilidad', 'Proveedores', 'Stock', 'Lencería', 'Checklists', 'Informes', 'Facturación']

function pBy(id: string) { return PROPS.find(p => p.id === id) }
function todayISO() { return new Date().toISOString().split('T')[0] }
function fmtTime(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
}
function getDurMin(s: any): number {
  if (s.hora_llegada && s.hora_salida)
    return Math.round((new Date(s.hora_salida).getTime() - new Date(s.hora_llegada).getTime()) / 60000)
  if (s.started_at && s.completed_at)
    return Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000)
  return 0
}

// ─── Componentes UI ────────────────────────────────────────────
function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <span style={{ background: bg, color, borderRadius: 12, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{label}</span>
}

function TipoBadge({ tipo }: { tipo: string }) {
  const t = TIPO_LIMPIEZA.find(x => x.value === tipo) || TIPO_LIMPIEZA[0]
  return <Badge label={t.label} color={t.color} bg={t.color + '18'} />
}

function StatCard({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Spinner() {
  return <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>Cargando...</div>
}

// ─── TAB HOY ────────────────────────────────────────────────────
function TabHoy() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [candidatas, setCandidatas] = useState<Record<string, any[]>>({})
  const today = todayISO()

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/sivra/limpiadoras/historial?from=${today}&to=${today}`)
    const d = await r.json()
    setSessions(d.sessions || [])
    setLoading(false)
  }, [today])

  useEffect(() => { load() }, [load])

  async function assign(sessionId: string, limpiadId: string | null) {
    await fetch('/api/sivra/limpiadoras/asignacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, limpiadora_id: limpiadId })
    })
    load()
  }

  async function setTipo(sessionId: string, tipo: string) {
    await fetch('/api/sivra/limpiadoras/asignacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, tipo_limpieza: tipo })
    })
    load()
  }

  async function fetchCandidatas(s: any) {
    if (candidatas[s.id]) return
    const r = await fetch(`/api/sivra/limpiadoras/asignacion?fecha=${today}&property_id=${s.property_id}`)
    const d = await r.json()
    setCandidatas(prev => ({ ...prev, [s.id]: d.candidatas || [] }))
  }

  const pending = sessions.filter(s => !s.completed_at).length
  const done    = sessions.filter(s => !!s.completed_at).length
  const hTotal  = sessions.reduce((a, s) => a + getDurMin(s), 0)

  if (loading && sessions.length === 0) return <Spinner />
  return (
    <div>
      <div className="limp-stats-row" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <StatCard value={sessions.length} label="Total hoy" />
        <StatCard value={pending} label="Pendientes" color="#f59e0b" />
        <StatCard value={done} label="Completadas" color="#16a34a" />
        <StatCard value={hTotal > 0 ? `${Math.floor(hTotal/60)}h ${hTotal%60}m` : '—'} label="Tiempo total" color="#2563eb" />
      </div>
      {sessions.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          Sin limpiezas programadas hoy 🎉
        </div>
      )}
      {sessions.map(s => {
        const p = pBy(s.property_id)
        const dur = getDurMin(s)
        const sts = s.completed_at ? 'completada' : s.started_at ? 'en_curso' : 'pendiente'
        return (
          <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div className="limp-session-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: p?.color }}>{p?.name}</span>
                  <TipoBadge tipo={s.tipo_limpieza || 'estandar'} />
                  {sts === 'completada' && <Badge label="✓ Hecho" color="#16a34a" bg="#dcfce7" />}
                  {sts === 'en_curso'   && <Badge label="↻ En curso" color="#2563eb" bg="#dbeafe" />}
                  {sts === 'pendiente'  && <Badge label="○ Pendiente" color="var(--muted)" bg="var(--border)" />}
                </div>
                {s.guest_out && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Sale: {s.guest_out} · Entra: {s.guest_in || '—'}</div>}
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                {s.hora_llegada && <div>⏱ Entrada: {fmtTime(s.hora_llegada)}</div>}
                {s.hora_salida  && <div>⏱ Salida: {fmtTime(s.hora_salida)}</div>}
                {dur > 0        && <div style={{ fontWeight: 700, color: 'var(--text)' }}>⏱ {Math.floor(dur/60)}h {dur%60}m</div>}
              </div>
            </div>

            <div className="limp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Tipo</div>
                <select value={s.tipo_limpieza || 'estandar'} onChange={e => setTipo(s.id, e.target.value)}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
                  {TIPO_LIMPIEZA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Limpiadora</div>
                <select
                  value={s.limpiadora_id || ''}
                  onFocus={() => fetchCandidatas(s)}
                  onChange={e => assign(s.id, e.target.value || null)}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)',
                    borderColor: s.limpiadora_id ? '#16a34a' : '#f59e0b' }}>
                  <option value="">Sin asignar</option>
                  {(candidatas[s.id] || (s.limpiadora_id ? [{ id: s.limpiadora_id, nombre: s.limpiadora_nombre || s.limpiadora_id }] : [])).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}{c.horas_asignadas_min > 0 ? ` (${Math.round(c.horas_asignadas_min/60*10)/10}h asig.)` : ''}
                      {c.prioridad === 1 ? ' ⭐' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {s.nota_propietario && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#92400e' }}>
                📌 {s.nota_propietario}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── TAB TAREAS ─────────────────────────────────────────────────
// Tareas sueltas para la limpieza (Sique Brilla) — aparte de las limpiezas por reserva. Las ven y
// las marcan hechas desde su intranet (/invitado/limpieza); aquí se crean, editan y borran.
function TabTareas() {
  const [tareas, setTareas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [enlace, setEnlace] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [nueva, setNueva] = useState({ fecha: todayISO(), property_id: '', texto: '' })
  const [guardando, setGuardando] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/sivra/limpiadoras/tareas')
    const d = await r.json()
    setTareas(d.tareas || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    fetch('/api/sivra/limpieza-intranet/enlace').then(r => r.json()).then(d => setEnlace(d.enlace || null)).catch(() => {})
  }, [load])

  async function crear() {
    if (!nueva.texto.trim() || guardando) return
    setGuardando(true)
    await fetch('/api/sivra/limpiadoras/tareas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: nueva.fecha, property_id: nueva.property_id || null, texto: nueva.texto }),
    })
    setNueva(n => ({ ...n, texto: '' }))
    setGuardando(false)
    load()
  }
  async function toggle(t: any) {
    await fetch('/api/sivra/limpiadoras/tareas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, hecha: !t.hecha }),
    })
    load()
  }
  async function borrar(id: string) {
    await fetch('/api/sivra/limpiadoras/tareas', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    load()
  }
  async function copiarEnlace() {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(new URL(enlace, window.location.origin).toString())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sin permiso de portapapeles: queda el botón Ver */ }
  }

  const porFecha: Record<string, any[]> = {}
  for (const t of tareas) {
    const f = String(t.fecha).slice(0, 10)
    ;(porFecha[f] ||= []).push(t)
  }

  if (loading) return <Spinner />
  return (
    <div>
      {/* Acceso de Sique Brilla */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>🧽 Intranet de Sique Brilla</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {enlace ? 'Calendario + resumen diario con estas tareas y las notas 📌.' : 'Sin token activo (limpieza_acceso_token) — genera uno para poder compartir el enlace.'}
          </div>
        </div>
        {enlace && (
          <div className="limp-btn-row" style={{ display: 'flex', gap: 8 }}>
            <a href={enlace} target="_blank" rel="noreferrer" style={{ ...btnTarea, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>👁 Ver pantalla</a>
            <button onClick={copiarEnlace} style={btnTarea}>{copiado ? '✓ Copiado' : '🔗 Copiar enlace'}</button>
          </div>
        )}
      </div>

      {/* Nueva tarea */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>➕ Nueva tarea</div>
        <div className="limp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input type="date" value={nueva.fecha} min={todayISO()} onChange={e => setNueva(n => ({ ...n, fecha: e.target.value }))} style={inputTarea} />
          <select value={nueva.property_id} onChange={e => setNueva(n => ({ ...n, property_id: e.target.value }))} style={inputTarea}>
            <option value="">Todos / general</option>
            {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={nueva.texto} placeholder="Qué hay que hacer (p. ej. repasar cristales del salón)"
            onChange={e => setNueva(n => ({ ...n, texto: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') crear() }}
            style={{ ...inputTarea, flex: 1 }} />
          <button onClick={crear} disabled={!nueva.texto.trim() || guardando}
            style={{ ...btnTarea, background: '#16a34a', color: '#fff', border: 'none', opacity: !nueva.texto.trim() || guardando ? .5 : 1 }}>
            Añadir
          </button>
        </div>
      </div>

      {/* Lista */}
      {tareas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          Sin tareas apuntadas. Las que añadas le aparecen a Sique Brilla en su resumen del día.
        </div>
      )}
      {Object.entries(porFecha).map(([fecha, ts]) => (
        <div key={fecha} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', margin: '0 0 6px 2px', textTransform: 'capitalize' }}>{fmtDate(fecha)}</div>
          {ts.map(t => {
            const p = t.property_id ? pBy(t.property_id) : null
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                <button onClick={() => toggle(t)} title={t.hecha ? 'Marcar pendiente' : 'Marcar hecha'}
                  style={{ width: 24, height: 24, minWidth: 24, borderRadius: 8, border: `2px solid ${t.hecha ? '#16a34a' : 'var(--border)'}`, background: t.hecha ? '#16a34a' : 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>
                  {t.hecha ? '✓' : ''}
                </button>
                <div style={{ flex: 1, fontSize: 13, color: t.hecha ? 'var(--muted)' : 'var(--text)', textDecoration: t.hecha ? 'line-through' : 'none' }}>
                  {p && <span style={{ fontWeight: 700, color: p.color, marginRight: 6 }}>{p.short}</span>}
                  {t.texto}
                </div>
                <button onClick={() => borrar(t.id)} title="Borrar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15, padding: 4 }}>🗑</button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const inputTarea: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13,
  background: 'var(--surface)', color: 'var(--text)', minHeight: 40,
}
const btnTarea: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13,
  fontWeight: 600, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', minHeight: 40,
}

// ─── TAB SEMANA ──────────────────────────────────────────────────
function TabSemana() {
  const [sessions, setSessions] = useState<any[]>([])
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)

  function getWeek(offset: number) {
    const d = new Date(); d.setDate(d.getDate() + offset * 7)
    const day = d.getDay() || 7
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1)
    const days = Array.from({ length: 7 }, (_, i) => {
      const x = new Date(mon); x.setDate(mon.getDate() + i)
      return x.toISOString().split('T')[0]
    })
    return days
  }

  const days = getWeek(weekOffset)
  const today = todayISO()

  const load = useCallback(async () => {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      fetch(`/api/sivra/limpiadoras/historial?from=${days[0]}&to=${days[6]}`),
      fetch('/api/sivra/limpiadoras/usuarios'),
    ])
    const d1 = await r1.json(); const d2 = await r2.json()
    setSessions(d1.sessions || []); setLimpiadoras(d2.limpiadoras || [])
    setLoading(false)
  }, [weekOffset])

  useEffect(() => { load() }, [load])

  const totalHoras = sessions.reduce((a, s) => a + getDurMin(s), 0)

  if (loading && sessions.length === 0) return <Spinner />
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={() => setWeekOffset(o => o - 1)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>‹ Ant.</button>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
          {fmtDate(days[0])} — {fmtDate(days[6])}
        </span>
        <button onClick={() => setWeekOffset(o => o + 1)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>Sig. ›</button>
      </div>

      <div className="limp-stats-row" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <StatCard value={sessions.length} label="Sesiones" />
        <StatCard value={sessions.filter(s => s.completed_at).length} label="Completadas" color="#16a34a" />
        <StatCard value={totalHoras > 0 ? `${Math.floor(totalHoras/60)}h` : '—'} label="Horas totales" color="#2563eb" />
      </div>

      {limpiadoras.map(l => {
        const mySessions = sessions.filter(s => s.limpiadora_id === l.id)
        const myHoras = mySessions.reduce((a, s) => a + getDurMin(s), 0)
        if (mySessions.length === 0) return null
        return (
          <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ background: l.color + '15', borderBottom: '1px solid var(--border)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{l.nombre}</span>
                <Badge label={`${mySessions.length} sesiones`} color={l.color} bg={l.color + '20'} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                {myHoras > 0 ? `${Math.floor(myHoras/60)}h ${myHoras%60}m` : `${mySessions.length} × ~2h`}
              </span>
            </div>
            <div style={{ padding: '10px 16px' }}>
              {days.map(day => {
                const ds = mySessions.filter(s => s.session_date?.slice(0, 10) === day)
                if (ds.length === 0) return null
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 60, fontSize: 11, color: day === today ? '#16a34a' : 'var(--muted)', fontWeight: day === today ? 700 : 400, paddingTop: 2, flexShrink: 0 }}>{fmtDate(day)}</div>
                    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ds.map(s => {
                        const p = pBy(s.property_id)
                        const done = !!s.completed_at
                        return (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: done ? '#dcfce7' : p?.color + '18', border: `1px solid ${done ? '#86efac' : p?.color + '40'}`, borderRadius: 8, padding: '3px 8px', fontSize: 11 }}>
                            <span style={{ fontWeight: 700, color: p?.color }}>{p?.short}</span>
                            {done && <span>✓</span>}
                            {s.tipo_limpieza === 'gran_suciedad' && <span>⚠️</span>}
                            {getDurMin(s) > 0 && <span style={{ color: 'var(--muted)' }}>{getDurMin(s)}m</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {sessions.filter(s => !s.limpiadora_id).length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#c2410c', marginBottom: 8 }}>
            ⚠️ {sessions.filter(s => !s.limpiadora_id).length} sesiones sin asignar
          </div>
          {sessions.filter(s => !s.limpiadora_id).map(s => {
            const p = pBy(s.property_id)
            return (
              <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: p?.color, fontWeight: 600, fontSize: 12 }}>{p?.short}</span>
                <span style={{ fontSize: 12, color: 'var(--text)' }}>{fmtDate(s.session_date)}</span>
                <TipoBadge tipo={s.tipo_limpieza || 'estandar'} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TAB DISPONIBILIDAD ──────────────────────────────────────────
function TabDisponibilidad() {
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [disponibilidad, setDisponibilidad] = useState<Record<string, any[]>>({})
  const [ausencias, setAusencias] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newAus, setNewAus] = useState({ limpiadora_id: '', fecha_inicio: '', fecha_fin: '', motivo: 'vacaciones', notas: '' })
  const [showAusForm, setShowAusForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [r1, r2, r3] = await Promise.all([
      fetch('/api/sivra/limpiadoras/usuarios'),
      fetch('/api/sivra/limpiadoras/disponibilidad'),
      fetch('/api/sivra/limpiadoras/ausencias'),
    ])
    const d1 = await r1.json(); const d2 = await r2.json(); const d3 = await r3.json()
    const limp = d1.limpiadoras || []
    setLimpiadoras(limp)
    const map: Record<string, any[]> = {}
    limp.forEach((l: any) => {
      const dias = (d2.disponibilidad || []).filter((d: any) => d.limpiadora_id === l.id)
      map[l.id] = Array.from({ length: 7 }, (_, i) => {
        const existing = dias.find((d: any) => d.dia_semana === i + 1)
        return existing || { limpiadora_id: l.id, dia_semana: i + 1, hora_inicio: '09:00', hora_fin: '17:00', horas_max: 8, activo: false }
      })
    })
    setDisponibilidad(map)
    setAusencias(d3.ausencias || [])
    if (limp.length > 0 && !selected) setSelected(limp[0].id)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function updateDia(limpId: string, diaIdx: number, field: string, val: any) {
    setDisponibilidad(prev => ({
      ...prev,
      [limpId]: prev[limpId].map((d, i) => i === diaIdx ? { ...d, [field]: val } : d)
    }))
  }

  async function saveDisp(limpId: string) {
    setSaving(true)
    await fetch('/api/sivra/limpiadoras/disponibilidad', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limpiadora_id: limpId, dias: disponibilidad[limpId] || [] })
    })
    setSaving(false)
  }

  async function addAusencia() {
    if (!newAus.limpiadora_id || !newAus.fecha_inicio || !newAus.fecha_fin) return
    await fetch('/api/sivra/limpiadoras/ausencias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAus)
    })
    setNewAus({ limpiadora_id: '', fecha_inicio: '', fecha_fin: '', motivo: 'vacaciones', notas: '' })
    setShowAusForm(false); load()
  }

  async function delAusencia(id: string) {
    await fetch('/api/sivra/limpiadoras/ausencias', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  if (loading && limpiadoras.length === 0) return <Spinner />
  const limp = limpiadoras.find(l => l.id === selected)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {limpiadoras.map(l => (
          <button key={l.id} onClick={() => setSelected(l.id)}
            style={{ padding: '8px 16px', borderRadius: 10, border: `2px solid ${l.color}`,
              background: selected === l.id ? l.color : 'var(--surface)', color: selected === l.id ? '#fff' : l.color,
              fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {l.nombre}
          </button>
        ))}
      </div>

      {limp && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: limp.color }}>
            Horario semanal — {limp.nombre}
          </div>
          {(disponibilidad[limp.id] || []).map((d, i) => (
            <div key={i} className="limp-disp-row" style={{ display: 'grid', gridTemplateColumns: '60px 48px 1fr 1fr 70px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: d.activo ? 'var(--text)' : 'var(--muted)' }}>{DIAS[i + 1]}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!d.activo} onChange={e => updateDia(limp.id, i, 'activo', e.target.checked)} />
              </label>
              <input type="time" value={d.hora_inicio} disabled={!d.activo} onChange={e => updateDia(limp.id, i, 'hora_inicio', e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', fontSize: 12, opacity: d.activo ? 1 : 0.4, background: 'var(--surface)', color: 'var(--text)' }} />
              <input type="time" value={d.hora_fin} disabled={!d.activo} onChange={e => updateDia(limp.id, i, 'hora_fin', e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', fontSize: 12, opacity: d.activo ? 1 : 0.4, background: 'var(--surface)', color: 'var(--text)' }} />
              <input type="number" value={d.horas_max} min={1} max={12} disabled={!d.activo} onChange={e => updateDia(limp.id, i, 'horas_max', +e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', fontSize: 12, opacity: d.activo ? 1 : 0.4, width: '100%', background: 'var(--surface)', color: 'var(--text)' }} />
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>Hora inicio · Hora fin · Horas máx/día</div>
          <button onClick={() => saveDisp(limp.id)} disabled={saving}
            style={{ background: limp.color, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : '💾 Guardar horario'}
          </button>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Ausencias programadas</span>
          <button onClick={() => setShowAusForm(v => !v)}
            style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + Añadir
          </button>
        </div>
        {showAusForm && (
          <div style={{ background: 'var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <select value={newAus.limpiadora_id} onChange={e => setNewAus(p => ({ ...p, limpiadora_id: e.target.value }))}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
                <option value="">Limpiadora</option>
                {limpiadoras.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
              <select value={newAus.motivo} onChange={e => setNewAus(p => ({ ...p, motivo: e.target.value }))}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
                {['vacaciones', 'baja', 'personal', 'otro'].map(m => <option key={m}>{m}</option>)}
              </select>
              <input type="date" value={newAus.fecha_inicio} onChange={e => setNewAus(p => ({ ...p, fecha_inicio: e.target.value }))}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
              <input type="date" value={newAus.fecha_fin} onChange={e => setNewAus(p => ({ ...p, fecha_fin: e.target.value }))}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
            </div>
            <input placeholder="Notas opcionales" value={newAus.notas} onChange={e => setNewAus(p => ({ ...p, notas: e.target.value }))}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)' }} />
            <button onClick={addAusencia}
              style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Guardar ausencia
            </button>
          </div>
        )}
        {ausencias.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 12 }}>Sin ausencias registradas</div>}
        {ausencias.map(a => {
          const l = limpiadoras.find(x => x.id === a.limpiadora_id)
          return (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, color: l?.color || 'var(--text)' }}>{a.nombre || l?.nombre}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{a.fecha_inicio} → {a.fecha_fin}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{a.motivo}</span>
              </div>
              <button onClick={() => delAusencia(a.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── TAB PROVEEDORES ─────────────────────────────────────────────
function TabProveedores() {
  const [proveedores, setProveedores] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'proveedores' | 'productos'>('proveedores')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({ nombre: '', empresa: '', telefono: '', email: '', whatsapp: '', categoria: 'general', notas: '' })
  const [formProd, setFormProd] = useState<any>({ proveedor_id: '', nombre: '', referencia: '', categoria: 'limpieza', unidad: 'unidad', precio_unitario: '', notas: '' })
  const [showFormProd, setShowFormProd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      fetch('/api/sivra/limpiadoras/proveedores'),
      fetch('/api/sivra/limpiadoras/productos'),
    ])
    const d1 = await r1.json(); const d2 = await r2.json()
    setProveedores(d1.proveedores || []); setProductos(d2.productos || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveProveedor() {
    if (!form.nombre) return
    await fetch('/api/sivra/limpiadoras/proveedores', {
      method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    setForm({ nombre: '', empresa: '', telefono: '', email: '', whatsapp: '', categoria: 'general', notas: '' })
    setShowForm(false); load()
  }

  async function saveProducto() {
    if (!formProd.nombre) return
    await fetch('/api/sivra/limpiadoras/productos', {
      method: formProd.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formProd)
    })
    setFormProd({ proveedor_id: '', nombre: '', referencia: '', categoria: 'limpieza', unidad: 'unidad', precio_unitario: '', notas: '' })
    setShowFormProd(false); load()
  }

  if (loading && proveedores.length === 0 && productos.length === 0) return <Spinner />
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['proveedores', 'productos'].map(v => (
          <button key={v} onClick={() => setView(v as any)}
            style={{ padding: '7px 18px', borderRadius: 9, border: '1px solid var(--border)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              background: view === v ? '#1B4332' : 'var(--surface)', color: view === v ? '#fff' : 'var(--text)' }}>
            {v === 'proveedores' ? `🏢 Proveedores (${proveedores.length})` : `📦 Catálogo (${productos.length})`}
          </button>
        ))}
      </div>

      {view === 'proveedores' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setShowForm(v => !v)}
              style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Nuevo proveedor
            </button>
          </div>
          {showForm && (
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid var(--border)' }}>
              <div className="limp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[['nombre', 'Nombre *'], ['empresa', 'Empresa'], ['telefono', 'Teléfono'], ['email', 'Email'], ['whatsapp', 'WhatsApp']].map(([k, l]) => (
                  <input key={k} placeholder={l} value={form[k] || ''} onChange={e => setForm((p: any) => ({ ...p, [k]: e.target.value }))}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                ))}
                <select value={form.categoria} onChange={e => setForm((p: any) => ({ ...p, categoria: e.target.value }))}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
                  {CAT_PROVEEDOR.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <textarea placeholder="Notas" value={form.notas || ''} onChange={e => setForm((p: any) => ({ ...p, notas: e.target.value }))} rows={2}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, resize: 'none', marginBottom: 8, boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)' }} />
              <button onClick={saveProveedor}
                style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Guardar
              </button>
            </div>
          )}
          {proveedores.map(p => (
            <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{p.nombre}</div>
                  {p.empresa && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.empresa}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge label={p.categoria} color="#1B4332" bg="#f0fdf4" />
                    {p.num_productos > 0 && <Badge label={`${p.num_productos} productos`} color="#2563eb" bg="#eff6ff" />}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  {p.telefono && <a href={`tel:${p.telefono}`} style={{ fontSize: 18, textDecoration: 'none' }}>📞</a>}
                  {p.whatsapp && <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ fontSize: 18, textDecoration: 'none' }}>💬</a>}
                  {p.email && <a href={`mailto:${p.email}`} style={{ fontSize: 18, textDecoration: 'none' }}>✉️</a>}
                  <button onClick={() => { setForm({ ...p }); setShowForm(true) }}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text)' }}>✏️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'productos' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setShowFormProd(v => !v)}
              style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Nuevo producto
            </button>
          </div>
          {showFormProd && (
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid var(--border)' }}>
              <div className="limp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <select value={formProd.proveedor_id} onChange={e => setFormProd((p: any) => ({ ...p, proveedor_id: e.target.value }))}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <select value={formProd.categoria} onChange={e => setFormProd((p: any) => ({ ...p, categoria: e.target.value }))}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
                  {CAT_PRODUCTO.map(c => <option key={c}>{c}</option>)}
                </select>
                {[['nombre', 'Nombre producto *'], ['referencia', 'Referencia'], ['unidad', 'Unidad (litro, kg…)'], ['precio_unitario', 'Precio unitario €']].map(([k, l]) => (
                  <input key={k} placeholder={l} value={formProd[k] || ''} type={k === 'precio_unitario' ? 'number' : 'text'}
                    onChange={e => setFormProd((p: any) => ({ ...p, [k]: e.target.value }))}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                ))}
              </div>
              <button onClick={saveProducto}
                style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Guardar
              </button>
            </div>
          )}
          {Object.entries(productos.reduce((acc: any, p: any) => {
            if (!acc[p.categoria]) acc[p.categoria] = []
            acc[p.categoria].push(p); return acc
          }, {})).map(([cat, prods]: any) => (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{cat}</div>
              {prods.map((p: any) => (
                <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.proveedor_nombre || 'Sin proveedor'} · {p.unidad}{p.referencia ? ` · Ref: ${p.referencia}` : ''}</div>
                  </div>
                  {p.precio_unitario && <div style={{ fontWeight: 700, fontSize: 14, color: '#1B4332' }}>{eur(Number(p.precio_unitario))}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TAB LENCERÍA ────────────────────────────────────────────────
function TabLenceria() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selProp, setSelProp] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({ property_id: PROPS[0].id, tipo: 'sabana_bajera', talla: 'matrimonio', cantidad_total: '', cantidad_disponible: '', coste_unidad: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/sivra/limpiadoras/lenceria')
    const d = await r.json()
    setItems(d.items || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = selProp === 'all' ? items : items.filter(i => i.property_id === selProp)

  async function saveItem() {
    await fetch('/api/sivra/limpiadoras/lenceria', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, cantidad_total: +form.cantidad_total, cantidad_disponible: +form.cantidad_disponible, coste_unidad: +form.coste_unidad || null })
    })
    setShowForm(false); load()
  }

  async function updateStock(item: any, field: string, val: number) {
    await fetch('/api/sivra/limpiadoras/lenceria', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, [field]: val })
    })
    load()
  }

  if (loading && items.length === 0) return <Spinner />

  const totalPiezas = filtered.reduce((a, i) => a + (i.cantidad_total || 0), 0)
  const enLavanderia = filtered.reduce((a, i) => a + (i.cantidad_lavanderia || 0), 0)
  const disponibles = filtered.reduce((a, i) => a + (i.cantidad_disponible || 0), 0)

  return (
    <div>
      <div className="limp-stats-row" style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <StatCard value={totalPiezas} label="Total piezas" />
        <StatCard value={disponibles} label="Disponibles" color="#16a34a" />
        <StatCard value={enLavanderia} label="En lavandería" color="#2563eb" />
        <StatCard value={filtered.reduce((a, i) => a + (i.cantidad_sucia || 0), 0)} label="Sucias" color="#f59e0b" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setSelProp('all')}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: selProp === 'all' ? '#1B4332' : 'var(--surface)', color: selProp === 'all' ? '#fff' : 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Todos
        </button>
        {PROPS.map(p => (
          <button key={p.id} onClick={() => setSelProp(p.id)}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${p.color}`,
              background: selProp === p.id ? p.color : 'var(--surface)', color: selProp === p.id ? '#fff' : p.color,
              fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {p.short}
          </button>
        ))}
        <button onClick={() => setShowForm(v => !v)}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, background: '#1B4332', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + Añadir
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
          <div className="limp-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select value={form.property_id} onChange={e => setForm((p: any) => ({ ...p, property_id: e.target.value }))}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
              {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={form.tipo} onChange={e => setForm((p: any) => ({ ...p, tipo: e.target.value }))}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}>
              {TIPO_LENCERIA.map(t => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="Talla (matrimonio, 90…)" value={form.talla} onChange={e => setForm((p: any) => ({ ...p, talla: e.target.value }))}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
            <input type="number" placeholder="Total piezas" value={form.cantidad_total} onChange={e => setForm((p: any) => ({ ...p, cantidad_total: e.target.value }))}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
            <input type="number" placeholder="Disponibles ahora" value={form.cantidad_disponible} onChange={e => setForm((p: any) => ({ ...p, cantidad_disponible: e.target.value }))}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
            <input type="number" placeholder="Coste/ud €" value={form.coste_unidad} onChange={e => setForm((p: any) => ({ ...p, coste_unidad: e.target.value }))}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
          </div>
          <button onClick={saveItem}
            style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Guardar
          </button>
        </div>
      )}

      {Object.entries(filtered.reduce((acc: any, i: any) => {
        const p = pBy(i.property_id)?.name || i.property_id
        if (!acc[p]) acc[p] = []; acc[p].push(i); return acc
      }, {})).map(([propName, its]: any) => (
        <div key={propName} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>{propName}</div>
          {its.map((item: any) => {
            const bajoBajo = item.cantidad_disponible < 2
            return (
              <div key={item.id} style={{ background: bajoBajo ? '#fff7ed' : 'var(--surface)', border: `1px solid ${bajoBajo ? '#fed7aa' : 'var(--border)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{item.tipo.replace(/_/g, ' ')}</span>
                    {item.talla && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{item.talla}</span>}
                    {bajoBajo && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#c2410c' }}>⚠️ Stock bajo</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Disp: </span>
                      <input type="number" value={item.cantidad_disponible} min={0}
                        onChange={e => updateStock(item, 'cantidad_disponible', +e.target.value)}
                        style={{ width: 48, border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontSize: 12, textAlign: 'center', background: 'var(--surface)', color: 'var(--text)' }} />
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Lav: </span>
                      <input type="number" value={item.cantidad_lavanderia} min={0}
                        onChange={e => updateStock(item, 'cantidad_lavanderia', +e.target.value)}
                        style={{ width: 48, border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontSize: 12, textAlign: 'center', background: 'var(--surface)', color: 'var(--text)' }} />
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Sucia: </span>
                      <input type="number" value={item.cantidad_sucia} min={0}
                        onChange={e => updateStock(item, 'cantidad_sucia', +e.target.value)}
                        style={{ width: 48, border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontSize: 12, textAlign: 'center', background: 'var(--surface)', color: 'var(--text)' }} />
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>/{item.cantidad_total}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── TAB LIMPIADORAS (gestión) ───────────────────────────────────
function TabLimpiadoras() {
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', telefono: '', pin: '', color: '#16a34a', propiedades: [] as string[] })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/sivra/limpiadoras/usuarios')
    const d = await r.json()
    setLimpiadoras(d.limpiadoras || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveForm() {
    if (!form.nombre || !form.pin) return
    await fetch('/api/sivra/limpiadoras/usuarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    setForm({ nombre: '', telefono: '', pin: '', color: '#16a34a', propiedades: [] })
    setShowForm(false); load()
  }

  if (loading && limpiadoras.length === 0) return <Spinner />
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Nueva limpiadora
        </button>
      </div>
      {showForm && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
          <div className="limp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {[['nombre', 'Nombre *'], ['telefono', 'Teléfono'], ['pin', 'PIN (4 dígitos) *']].map(([k, l]) => (
              <input key={k} placeholder={l} value={(form as any)[k]} type={k === 'pin' ? 'password' : 'text'}
                onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }} />
            ))}
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Color</label>
              <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                style={{ width: '100%', height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Pisos asignados:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROPS.map(p => {
                const sel = form.propiedades.includes(p.id)
                return (
                  <button key={p.id} onClick={() => setForm(prev => ({ ...prev, propiedades: sel ? prev.propiedades.filter(x => x !== p.id) : [...prev.propiedades, p.id] }))}
                    style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${p.color}`, background: sel ? p.color : 'var(--surface)', color: sel ? '#fff' : p.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {p.short}
                  </button>
                )
              })}
            </div>
          </div>
          <button onClick={saveForm}
            style={{ background: '#1B4332', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Crear limpiadora
          </button>
        </div>
      )}
      {limpiadoras.map(l => (
        <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: l.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>
              {l.nombre?.charAt(0)}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{l.nombre}</div>
              {l.telefono && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.telefono}</div>}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Badge label={l.activa ? 'Activa' : 'Inactiva'} color={l.activa ? '#16a34a' : 'var(--muted)'} bg={l.activa ? '#dcfce7' : 'var(--border)'} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(l.propiedades || []).map((pid: string) => {
              const p = pBy(pid); return p ? <Badge key={pid} label={p.short} color={p.color} bg={p.color + '18'} /> : null
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TAB STOCK ───────────────────────────────────────────────────
function TabStock() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selProp, setSelProp] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/sivra/limpiadoras/items')
    const d = await r.json()
    setItems(d.items || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = selProp === 'all' ? items : items.filter(i => i.property_id === selProp)
  const alertas = filtered.filter(i => i.stock_actual < i.stock_minimo)

  if (loading && items.length === 0) return <Spinner />
  return (
    <div>
      <div className="limp-stats-row" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <StatCard value={filtered.length} label="Artículos" />
        <StatCard value={alertas.length} label="⚠️ Alertas" color={alertas.length > 0 ? '#dc2626' : '#16a34a'} />
      </div>
      {alertas.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626', marginBottom: 8 }}>⚠️ Stock bajo</div>
          {alertas.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #fecaca' }}>
              <span style={{ color: 'var(--text)' }}>{i.articulo} — {pBy(i.property_id)?.short}</span>
              <span style={{ color: '#dc2626', fontWeight: 700 }}>{i.stock_actual} / mín {i.stock_minimo} {i.unidad}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setSelProp('all')}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: selProp === 'all' ? '#1B4332' : 'var(--surface)', color: selProp === 'all' ? '#fff' : 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
          Todos
        </button>
        {PROPS.map(p => (
          <button key={p.id} onClick={() => setSelProp(p.id)}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${p.color}`, background: selProp === p.id ? p.color : 'var(--surface)', color: selProp === p.id ? '#fff' : p.color, fontSize: 12, cursor: 'pointer' }}>
            {p.short}
          </button>
        ))}
      </div>
      {filtered.map(i => {
        const bajo = i.stock_actual < i.stock_minimo
        const pct = Math.min(100, Math.round(i.stock_actual / Math.max(1, i.stock_minimo) * 100))
        return (
          <div key={i.id} style={{ background: bajo ? '#fff7ed' : 'var(--surface)', border: `1px solid ${bajo ? '#fed7aa' : 'var(--border)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{i.articulo}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{pBy(i.property_id)?.short} · {i.categoria}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: bajo ? '#c2410c' : 'var(--text)' }}>{i.stock_actual} {i.unidad}</span>
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 4, height: 4 }}>
              <div style={{ width: `${pct}%`, height: 4, borderRadius: 4, background: bajo ? '#ef4444' : '#16a34a', transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Mínimo: {i.stock_minimo} {i.unidad}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── MAIN CLIENT COMPONENT ───────────────────────────────────────
export default function LimpiadoresClient() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .limp-stats-row { flex-direction: column !important; }
          .limp-stats-row > div { flex: none !important; width: 100% !important; }
          .limp-grid-2 { grid-template-columns: 1fr !important; }
          .limp-grid-3 { grid-template-columns: 1fr !important; }
          .limp-disp-row { grid-template-columns: 50px 36px 1fr 1fr 60px !important; gap: 4px !important; }
          .limp-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }
          .limp-card { width: 100% !important; min-width: unset !important; }
          .limp-factura-grid { grid-template-columns: 1fr 1fr !important; }
          .limp-tarifa-grid { grid-template-columns: 1fr 1fr !important; }
          .limp-session-header { flex-direction: column !important; align-items: flex-start !important; }
          .limp-session-header > div:last-child { text-align: left !important; }
          .limp-btn-row { flex-wrap: wrap !important; }
        }
        @media (max-width: 480px) {
          .limp-factura-grid { grid-template-columns: 1fr !important; }
          .limp-tarifa-grid { grid-template-columns: 1fr !important; }
          .limp-hide-xs { display: none !important; }
          /* Disponibilidad: el grid de 5 columnas fijas (día · check · inicio · fin · horas)
             no cabe en ≤320px (los 2 inputs 'time' no bajan de su min-content) → scroll
             horizontal de la página. Pasa a flex-wrap: día a lo ancho arriba, el resto envuelve. */
          .limp-disp-row { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 6px 8px !important; }
          .limp-disp-row > span { flex: 1 0 100% !important; }
          .limp-disp-row input[type="time"] { flex: 1 1 90px !important; min-width: 0 !important; }
        }
      `}</style>
      <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', minHeight: '100vh', background: 'var(--surface)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)', padding: '20px 24px 0' }}>
          <div style={{ color: '#fff', marginBottom: 16 }}>
            <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 2 }}>SIVRA</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Gestión limpiadoras</div>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setActiveTab(i)}
                style={{ padding: '10px 16px', border: 'none', borderBottom: activeTab === i ? '3px solid #a3e635' : '3px solid transparent',
                  background: 'transparent', color: activeTab === i ? '#fff' : 'rgba(255,255,255,0.6)',
                  fontWeight: activeTab === i ? 700 : 500, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 20 }}>
          {activeTab === 0 && <TabHoy />}
          {activeTab === 1 && <TabTareas />}
          {activeTab === 2 && <TabSemana />}
          {activeTab === 3 && <TabLimpiadoras />}
          {activeTab === 4 && <TabDisponibilidad />}
          {activeTab === 5 && <TabProveedores />}
          {activeTab === 6 && <TabStock />}
          {activeTab === 7 && <TabLenceria />}
          {activeTab === 8 && <TabChecklists />}
          {activeTab === 9 && <TabInformes />}
          {activeTab === 10 && <TabFacturacion />}
        </div>
      </div>
    </>
  )
}
