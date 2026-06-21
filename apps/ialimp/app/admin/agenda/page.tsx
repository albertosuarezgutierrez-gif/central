'use client'
import { useState, useEffect } from 'react'
import NuevaLimpiezaModal from '@/components/NuevaLimpiezaModal'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const COLORES = ['#4f46e5','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2']

function getLunes(d = new Date()) {
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  const l = new Date(d)
  l.setDate(d.getDate() + diff)
  return l
}

function isoDate(d: Date) { return d.toISOString().split('T')[0] }

// hora_* puede llegar como Date, ISO o "HH:MM:SS" → la dejamos en "HH:MM"
const hhmm = (v: any): string => {
  if (!v) return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(11, 16)
  const s = String(v)
  return (s.includes('T') ? s.split('T')[1] : s).slice(0, 5)
}

// Misma regla de orden que en Inicio: manual → urgente → ventana → entrada → hora
function prioridad(a: any, b: any) {
  const am = a.orden_manual ?? null, bm = b.orden_manual ?? null
  if (am !== null || bm !== null) {
    if (am === null) return 1
    if (bm === null) return -1
    if (am !== bm) return am - bm
  }
  const au = a.urgente_manual ? 0 : 1, bu = b.urgente_manual ? 0 : 1
  if (au !== bu) return au - bu
  const av = a.alerta_ventana ? 0 : 1, bv = b.alerta_ventana ? 0 : 1
  if (av !== bv) return av - bv
  const ae = a.hora_checkin_siguiente ? 0 : 1, be = b.hora_checkin_siguiente ? 0 : 1
  if (ae !== be) return ae - be
  const ac = hhmm(a.hora_checkin_siguiente) || '99:99', bc = hhmm(b.hora_checkin_siguiente) || '99:99'
  if (ac !== bc) return ac < bc ? -1 : 1
  return (hhmm(a.hora_inicio) || '99:99').localeCompare(hhmm(b.hora_inicio) || '99:99')
}

export default function AgendaPage() {
  const [semana, setSemana]   = useState(getLunes())
  const [sesiones, setSes]    = useState<any[]>([])
  const [limp, setLimp]       = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Gestión manual por día (asignar / reasignar / desasignar / cancelar / editar / reordenar)
  const [gestDate, setGestDate] = useState(isoDate(new Date()))
  const [gestSes, setGestSes]   = useState<any[]>([])
  const [busyId, setBusyId]     = useState<string | null>(null)
  const [editSesion, setEditSesion] = useState<any | null>(null)
  const [toast, setToast]       = useState<{ msg: string; tipo: 'ok' | 'warn' | 'error' } | null>(null)

  useEffect(() => { cargar() }, [semana])
  useEffect(() => { cargarGest() }, [gestDate])

  function showToast(msg: string, tipo: 'ok' | 'warn' | 'error' = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 4500)
  }

  async function cargar() {
    setLoading(true)
    const dias = Array.from({length: 7}, (_, i) => {
      const d = new Date(semana); d.setDate(semana.getDate() + i)
      return isoDate(d)
    })
    const [r1, r2, r3] = await Promise.all([
      fetch('/api/admin/agenda?desde=' + dias[0] + '&hasta=' + dias[6], { credentials: 'include' }),
      fetch('/api/admin/limpiadoras/usuarios', { credentials: 'include' }),
      fetch('/api/admin/clientes', { credentials: 'include' }),
    ])
    const d1 = await r1.json()
    const d2 = await r2.json()
    const d3 = await r3.json().catch(() => ({}))
    setSes(d1.sesiones || [])
    setLimp(d2.limpiadoras || [])
    setClientes(d3.clientes || [])
    setLoading(false)
  }

  async function cargarGest() {
    try {
      const r = await fetch('/api/admin/agenda?desde=' + gestDate + '&hasta=' + gestDate, { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'No se pudieron cargar las sesiones', 'error'); return }
      setGestSes((d.sesiones || []).slice().sort(prioridad))
    } catch { showToast('Error de red al cargar', 'error') }
  }

  async function asignar(id: string, limpiadoraId: string) {
    setBusyId(id)
    try {
      const r = await fetch('/api/admin/sesiones/' + id, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limpiadora_id: limpiadoraId || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showToast(d.error || 'No se pudo guardar', 'error'); return }
      if (!limpiadoraId)
        showToast('Limpiadora quitada. Aviso: el auto-asignador (16:00) puede reasignarla automáticamente si la dejas sin asignar.', 'warn')
      else
        showToast('Asignación guardada', 'ok')
      await Promise.all([cargarGest(), cargar()])
    } catch { showToast('Error de red', 'error') }
    finally { setBusyId(null) }
  }

  async function cancelar(id: string) {
    if (!confirm('¿Eliminar esta limpieza manual? Esta acción no se puede deshacer.')) return
    setBusyId(id)
    try {
      const r = await fetch('/api/admin/sesiones/' + id, { method: 'DELETE', credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showToast(d.error || 'No se pudo eliminar', 'error'); return }
      showToast('Limpieza eliminada', 'ok')
      await Promise.all([cargarGest(), cargar()])
    } catch { showToast('Error de red', 'error') }
    finally { setBusyId(null) }
  }

  // Mover de día (±n) — PATCH session_date; optimista (sale del día actual)
  async function moverDia(s: any, diasOffset: number) {
    const base = new Date((String(s.session_date).slice(0, 10) || gestDate) + 'T12:00:00')
    base.setDate(base.getDate() + diasOffset)
    const nueva = isoDate(base)
    setBusyId(s.id)
    try {
      const r = await fetch('/api/admin/sesiones/' + s.id, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: nueva }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showToast(d.error || 'No se pudo mover', 'error'); return }
      showToast('Movida a ' + nueva, 'ok')
      await Promise.all([cargarGest(), cargar()])
    } catch { showToast('Error de red', 'error') }
    finally { setBusyId(null) }
  }

  // Marcar/quitar urgente — PATCH urgente_manual; optimista
  async function toggleUrgente(s: any) {
    const nuevo = !s.urgente_manual
    setGestSes(ss => ss.map(x => x.id === s.id ? { ...x, urgente_manual: nuevo } : x).sort(prioridad))
    try {
      const r = await fetch('/api/admin/sesiones/' + s.id, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urgente_manual: nuevo }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { cargarGest(); showToast(d.error || 'No se pudo guardar', 'error'); return }
      showToast(nuevo ? '🔥 Marcada urgente' : 'Urgente quitado', 'ok')
    } catch { cargarGest(); showToast('Error de red', 'error') }
  }

  // Reordenar ↑↓ dentro del día — POST /reordenar; optimista por orden_manual
  async function mover(s: any, dir: -1 | 1) {
    const lista = gestSes
    const idx = lista.findIndex(x => x.id === s.id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= lista.length) return
    const reordenada = lista.slice()
    const tmp = reordenada[idx]; reordenada[idx] = reordenada[j]; reordenada[j] = tmp
    const ids = reordenada.map(x => x.id)
    const ordenById: Record<string, number> = {}
    ids.forEach((id, i) => { ordenById[id] = i })
    setGestSes(ss => ss.map(x => x.id in ordenById ? { ...x, orden_manual: ordenById[x.id] } : x).sort(prioridad))
    try {
      const r = await fetch('/api/admin/sesiones/reordenar', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: gestDate, orden: ids }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { cargarGest(); showToast(d.error || 'No se pudo reordenar', 'error'); return }
    } catch { cargarGest(); showToast('Error de red', 'error') }
  }

  async function ordenAutomatico() {
    setGestSes(ss => ss.map(x => ({ ...x, orden_manual: null })).sort(prioridad))
    try {
      const r = await fetch('/api/admin/sesiones/reordenar', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: gestDate, reset: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { cargarGest(); showToast(d.error || 'No se pudo restaurar', 'error'); return }
      showToast('Orden automático restaurado', 'ok')
    } catch { cargarGest(); showToast('Error de red', 'error') }
  }

  // Tras editar en el modal: refrescar ambas vistas
  function onSesionActualizada(s: any) {
    if (s.session_date && s.session_date !== gestDate) showToast('Movida a ' + s.session_date, 'ok')
    else showToast('Limpieza actualizada', 'ok')
    Promise.all([cargarGest(), cargar()])
  }
  function onSesionEliminada() {
    showToast('Limpieza eliminada', 'ok')
    Promise.all([cargarGest(), cargar()])
  }

  const dias = Array.from({length: 7}, (_, i) => {
    const d = new Date(semana); d.setDate(semana.getDate() + i)
    return { iso: isoDate(d), label: DIAS[i], num: d.getDate(), hoy: isoDate(d) === isoDate(new Date()) }
  })

  const sesXLimpXDia = (limpId: string, diaIso: string) =>
    sesiones.filter(s => s.limpiadora_id === limpId && s.session_date === diaIso)

  const total_sem = sesiones.length
  const completadas_sem = sesiones.filter(s => s.completed_at).length

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? C.primary : C.border}`,
    background: active ? C.primary : 'white',
    color: active ? 'white' : C.text,
  })

  return (
    <div style={{ minHeight:'100vh', background: C.bg, fontFamily:"'Nunito',-apple-system,sans-serif" }}>
      <header style={{ background: C.primary, padding:'18px 24px', display:'flex', alignItems:'center', gap:16 }}>
        <a href="/dashboard" style={{ color:'rgba(255,255,255,0.7)', fontSize:13, textDecoration:'none' }}>← Dashboard</a>
        <div style={{ flex:1 }}>
          <h1 style={{ color:'white', fontWeight:800, fontSize:20 }}>Agenda semanal</h1>
          <p style={{ color:'rgba(255,255,255,0.65)', fontSize:12 }}>
            {total_sem} limpiezas · {completadas_sem} completadas
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { const n=new Date(semana); n.setDate(n.getDate()-7); setSemana(n) }}
            style={{ background:'rgba(255,255,255,0.15)', color:'white', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:14 }}>
            ‹
          </button>
          <button onClick={() => setSemana(getLunes())}
            style={{ background:'rgba(255,255,255,0.15)', color:'white', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:600 }}>
            Hoy
          </button>
          <button onClick={() => { const n=new Date(semana); n.setDate(n.getDate()+7); setSemana(n) }}
            style={{ background:'rgba(255,255,255,0.15)', color:'white', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:14 }}>
            ›
          </button>
        </div>
      </header>

      <div style={{ overflowX:'auto', padding:'16px' }}>
        {loading && <div style={{ textAlign:'center', padding:40, color: C.muted }}>Cargando...</div>}

        {!loading && (
          <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
            <thead>
              <tr>
                <th style={{ width:120, padding:'8px 12px', textAlign:'left', fontSize:12, color: C.muted }}>Limpiadora</th>
                {dias.map(d => (
                  <th key={d.iso} style={{
                    padding:'8px 6px', textAlign:'center', fontSize:12, fontWeight: d.hoy ? 800 : 600,
                    color: d.hoy ? C.primary : C.text,
                    background: d.hoy ? C.light : 'transparent',
                    borderRadius: d.hoy ? 8 : 0
                  }}>
                    <div>{d.label}</div>
                    <div style={{ fontSize:16, fontWeight:800 }}>{d.num}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {limp.map((l: any, li: number) => (
                <tr key={l.id} style={{ borderTop:`1px solid ${C.border}` }}>
                  <td style={{ padding:'8px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background: COLORES[li % COLORES.length] }} />
                      <span style={{ fontSize:13, fontWeight:600, color: C.text }}>{l.nombre}</span>
                    </div>
                  </td>
                  {dias.map(d => {
                    const ses = sesXLimpXDia(l.id, d.iso)
                    return (
                      <td key={d.iso} style={{
                        padding:'4px 3px', textAlign:'center', verticalAlign:'top',
                        background: d.hoy ? '#f5f3ff' : 'transparent'
                      }}>
                        {ses.map((s: any) => (
                          <div key={s.id} style={{
                            fontSize:10, marginBottom:3, padding:'4px 6px', borderRadius:6,
                            background: s.completed_at ? C.okBg : s.started_at ? C.light : 'white',
                            border:`1px solid ${s.completed_at ? '#bbf7d0' : s.started_at ? '#c7d2fe' : C.border}`,
                            color: C.text, lineHeight:1.3
                          }}>
                            <div style={{ fontWeight:700, fontSize:9 }}>
                              {s.property_name?.split(' ').pop()}
                            </div>
                            <div style={{ color: C.muted }}>
                              {s.hora_checkout?.slice(0,5) || '—'}
                            </div>
                            {s.completed_at && <div>✅</div>}
                            {s.started_at && !s.completed_at && <div style={{ color: C.brand }}>🔄</div>}
                          </div>
                        ))}
                        {ses.length === 0 && (
                          <div style={{ fontSize:9, color:'#d1d5db', padding:4 }}>—</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {limp.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign:'center', padding:40, color: C.muted }}>
                    Sin limpiadoras configuradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}

        {/* Leyenda */}
        <div style={{ display:'flex', gap:16, marginTop:16, flexWrap:'wrap' }}>
          {[
            { color:'#bbf7d0', bg: C.okBg, label:'Completada' },
            { color:'#c7d2fe', bg: C.light, label:'En curso' },
            { color: C.border, bg:'white', label:'Pendiente' },
          ].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color: C.muted }}>
              <div style={{ width:12, height:12, borderRadius:3, border:`1px solid ${l.color}`, background: l.bg }} />
              {l.label}
            </div>
          ))}
        </div>

        {/* ── Gestión manual por día (asignar / reasignar / desasignar / cancelar) ── */}
        <div style={{ background:'white', border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginTop:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            <h2 style={{ fontSize:16, fontWeight:800, color: C.text, margin:0 }}>Asignar limpiadora por día</h2>
            <div style={{ flex:1 }} />
            {gestSes.some(s => s.orden_manual != null) && (
              <button onClick={ordenAutomatico} title="Volver al orden automático (por prioridad)"
                style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', border:`1px solid ${C.border}`, background:'white', color: C.muted }}>
                ↺ Orden automático
              </button>
            )}
            <button onClick={() => setGestDate(isoDate(new Date()))} style={pill(gestDate === isoDate(new Date()))}>Hoy</button>
            <button onClick={() => setGestDate(isoDate(new Date(Date.now() + 86400000)))} style={pill(gestDate === isoDate(new Date(Date.now() + 86400000)))}>Mañana</button>
            <input type="date" value={gestDate} onChange={e => setGestDate(e.target.value)}
              style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${C.border}`, fontFamily:'inherit', fontSize:14 }} />
          </div>

          {gestSes.length === 0 ? (
            <div style={{ textAlign:'center', padding:24, color: C.muted, fontSize:14 }}>No hay limpiezas para este día.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {gestSes.map((s: any) => {
                const completada = !!s.completed_at
                const manual = s.origen === 'manual'
                const puedeCancelar = manual && !s.started_at && !completada
                return (
                  <div key={s.id} style={{
                    display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
                    padding:'10px 12px', borderRadius:10,
                    background: completada ? C.okBg : C.bg, border:`1px solid ${C.border}`,
                  }}>
                    <div style={{ flex:'1 1 200px', minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        <span style={{ fontSize:14, fontWeight:700, color: C.text }}>{s.property_name || 'Sin nombre'}</span>
                        {s.hora_checkin_siguiente && (
                          <span style={{ fontSize:11, fontWeight:800, color:'#dc2626', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:20, padding:'1px 8px' }}>
                            🔴 Entra {s.hora_checkin_siguiente.slice(0,5)}
                          </span>
                        )}
                        {s.alerta_ventana && (
                          <span style={{ fontSize:11, fontWeight:700, color:'#b91c1c', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:20, padding:'1px 8px' }}>
                            ⚠️ Ventana ajustada
                          </span>
                        )}
                        {s.urgente_manual && (
                          <span style={{ fontSize:11, fontWeight:800, color:'#dc2626', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:20, padding:'1px 8px' }}>
                            🔥 Urgente
                          </span>
                        )}
                        {s.notas && (
                          <span title={s.notas} style={{ fontSize:11, fontWeight:700, color:'#b45309', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:20, padding:'1px 8px' }}>
                            📝 con notas
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color: C.muted }}>
                        {hhmm(s.hora_checkout || s.hora_inicio) || 'sin hora'}
                        {manual ? ' · manual' : ' · Smoobu'}
                        {completada ? ' · ✅ completada' : s.started_at ? ' · 🔄 en curso' : ''}
                      </div>

                      {/* Fila de acciones (editar / reordenar / mover día / urgente) */}
                      {!completada && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:7 }}>
                          {[
                            { lbl:'✏️ Editar', on:() => setEditSesion(s), title:'Editar fecha, hora o detalles' },
                            { lbl:'↑',         on:() => mover(s, -1),     title:'Subir en el orden' },
                            { lbl:'↓',         on:() => mover(s, 1),      title:'Bajar en el orden' },
                            { lbl:'⏰→Mañana', on:() => moverDia(s, 1),   title:'Mover al día siguiente' },
                            { lbl:'←Día ant.', on:() => moverDia(s, -1),  title:'Mover al día anterior' },
                          ].map(b => (
                            <button key={b.lbl} onClick={b.on} disabled={busyId === s.id} title={b.title}
                              style={{ padding:'4px 9px', borderRadius:8, border:`1px solid ${C.border}`, background:'white', color: C.text, fontFamily:'inherit', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                              {b.lbl}
                            </button>
                          ))}
                          <button onClick={() => toggleUrgente(s)} disabled={busyId === s.id} title="Marcar/quitar urgente"
                            style={{ padding:'4px 9px', borderRadius:8, fontFamily:'inherit', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap',
                              border:`1px solid ${s.urgente_manual ? '#fca5a5' : C.border}`,
                              background: s.urgente_manual ? '#fef2f2' : 'white',
                              color: s.urgente_manual ? '#dc2626' : C.text }}>
                            🔥 Urgente
                          </button>
                        </div>
                      )}
                    </div>

                    {completada ? (
                      <span style={{ fontSize:13, color: C.ok, fontWeight:700 }}>{s.limpiadora_nombre || '—'}</span>
                    ) : (
                      <select value={s.limpiadora_id || ''} disabled={busyId === s.id}
                        onChange={e => asignar(s.id, e.target.value)}
                        style={{
                          padding:'6px 10px', borderRadius:8, border:`1px solid ${C.border}`,
                          fontFamily:'inherit', fontSize:13, background:'white', minWidth:160,
                          color: s.limpiadora_id ? C.text : C.warn,
                        }}>
                        <option value="">— Sin asignar —</option>
                        {limp.map((l: any) => (<option key={l.id} value={l.id}>{l.nombre}</option>))}
                      </select>
                    )}

                    {puedeCancelar && (
                      <button onClick={() => cancelar(s.id)} disabled={busyId === s.id}
                        style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        Eliminar
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p style={{ fontSize:11, color: C.muted, marginTop:10 }}>
            Reasigna o quita la limpiadora aunque la limpieza sea de hoy (mientras no esté completada). Con ✏️ Editar cambias fecha, hora, notas y datos; ↑↓ reordena dentro del día (↺ vuelve al orden automático); ⏰→Mañana / ←Día ant. la mueven de día; 🔥 Urgente la sube de prioridad. «Eliminar» solo aparece en limpiezas manuales que no han empezado.
          </p>
        </div>
      </div>

      {/* Modal de edición de una limpieza existente (PATCH) */}
      {editSesion && (
        <NuevaLimpiezaModal
          clientes={clientes}
          limpiadoras={limp}
          sesion={editSesion}
          onCreada={() => {}}
          onActualizada={(s) => { onSesionActualizada(s); setEditSesion(null) }}
          onEliminada={() => { onSesionEliminada(); setEditSesion(null) }}
          onClose={() => setEditSesion(null)}
        />
      )}

      {toast && (
        <div style={{
          position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', zIndex:50,
          maxWidth:380, padding:'12px 16px', borderRadius:10, fontSize:13, fontWeight:600, color:'white',
          boxShadow:'0 8px 24px rgba(0,0,0,0.18)', textAlign:'center',
          background: toast.tipo === 'error' ? '#dc2626' : toast.tipo === 'warn' ? '#d97706' : '#16a34a',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
