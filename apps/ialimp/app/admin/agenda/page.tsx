'use client'
import { useState, useEffect } from 'react'

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

export default function AgendaPage() {
  const [semana, setSemana]   = useState(getLunes())
  const [sesiones, setSes]    = useState<any[]>([])
  const [limp, setLimp]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Gestión manual por día (asignar / reasignar / desasignar / cancelar)
  const [gestDate, setGestDate] = useState(isoDate(new Date()))
  const [gestSes, setGestSes]   = useState<any[]>([])
  const [busyId, setBusyId]     = useState<string | null>(null)
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
    const [r1, r2] = await Promise.all([
      fetch('/api/admin/agenda?desde=' + dias[0] + '&hasta=' + dias[6], { credentials: 'include' }),
      fetch('/api/admin/limpiadoras/usuarios', { credentials: 'include' })
    ])
    const d1 = await r1.json()
    const d2 = await r2.json()
    setSes(d1.sesiones || [])
    setLimp(d2.limpiadoras || [])
    setLoading(false)
  }

  async function cargarGest() {
    try {
      const r = await fetch('/api/admin/agenda?desde=' + gestDate + '&hasta=' + gestDate, { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'No se pudieron cargar las sesiones', 'error'); return }
      setGestSes(d.sesiones || [])
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
                      </div>
                      <div style={{ fontSize:12, color: C.muted }}>
                        {(s.hora_checkout || s.hora_inicio)?.slice(0,5) || 'sin hora'}
                        {manual ? ' · manual' : ' · Smoobu'}
                        {completada ? ' · ✅ completada' : s.started_at ? ' · 🔄 en curso' : ''}
                      </div>
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
            Reasigna o quita la limpiadora aunque la limpieza sea de hoy (mientras no esté completada). «Eliminar» solo aparece en limpiezas manuales que no han empezado.
          </p>
        </div>
      </div>

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
