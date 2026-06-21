'use client'
import { useState, useEffect, useCallback } from 'react'
import { fmtMin } from './Tarifas'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9',
  text: '#1e1b4b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2', white: '#ffffff',
}
const eur = (v: any) => Number(v || 0).toFixed(2).replace('.', ',') + ' €'
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

export default function Nominas() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [quincena, setQuincena] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2)

  const desde = quincena === 1 ? iso(year, month, 1) : iso(year, month, 16)
  const hasta = quincena === 1 ? iso(year, month, 15) : iso(year, month, lastDay(year, month))

  const [resumen, setResumen] = useState<any[]>([])
  const [partes, setPartes]   = useState<any[]>([])     // todos los partes del rango
  const [limpiadoras, setLimp] = useState<any[]>([])
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState<string | null>(null)
  const [modal, setModal]     = useState<any | null>(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<string>('')

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  const cargar = useCallback(async () => {
    setLoading(true)
    const [rN, rP] = await Promise.all([
      fetch(`/api/admin/nomina?desde=${desde}&hasta=${hasta}`),
      fetch(`/api/admin/partes-trabajo?desde=${desde}&hasta=${hasta}`),
    ])
    const [dN, dP] = await Promise.all([rN.json(), rP.json()])
    setResumen(dN.resumen || [])
    setPartes(dP.partes || [])
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    fetch('/api/admin/limpiadoras').then(r => r.json()).then(d => setLimp(d.limpiadoras || []))
    fetch('/api/admin/catalogo-tarifas').then(r => r.json()).then(d => setCatalogo(d.tarifas || []))
  }, [])

  function navMonth(delta: number) {
    let m = month + delta, y = year
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y)
  }

  async function importarSesiones() {
    setSaving(true); setMsg('')
    const r = await fetch('/api/admin/partes-trabajo/desde-sesiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde, hasta }),
    })
    const d = await r.json()
    setSaving(false)
    setMsg(d.ok ? `✅ ${d.generados || 0} partes generados desde sesiones completadas` : (d.error || 'Error'))
    cargar()
  }

  async function guardarParte() {
    if (!modal.limpiadora_id || !modal.concepto?.trim()) return
    setSaving(true)
    if (modal.id) {
      await fetch('/api/admin/partes-trabajo', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal) })
    } else {
      await fetch('/api/admin/partes-trabajo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal) })
    }
    setSaving(false); setModal(null); cargar()
  }
  async function borrarParte(id: string) {
    if (!confirm('¿Eliminar este parte?')) return
    await fetch('/api/admin/partes-trabajo', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    cargar()
  }

  function onSelectConcepto(catId: string) {
    const c = catalogo.find(x => x.id === catId)
    setModal((m: any) => ({
      ...m, catalogo_id: catId,
      concepto: c ? c.nombre : m.concepto,
      tiempo_min: c ? (c.tiempo_min ?? '') : m.tiempo_min,
      importe: c ? (c.precio ?? '') : m.importe,
    }))
  }

  function nuevoParte(limpiadora_id = '') {
    setModal({ id: '', limpiadora_id, catalogo_id: '', concepto: '', tiempo_min: '', importe: '', cantidad: 1, fecha: hasta, notas: '' })
  }

  function exportCSV() {
    const head = ['Limpiadora', 'Fecha', 'Concepto', 'Cantidad', 'Tiempo (min)', 'Precio', 'Importe']
    const lines = partes.map(p => [p.limpiadora_nombre, p.fecha, p.concepto, p.cantidad,
      (p.tiempo_min ?? '') === '' ? '' : Number(p.tiempo_min) * Number(p.cantidad),
      Number(p.importe).toFixed(2), Number(p.importe_total).toFixed(2)])
    const csv = [head, ...lines].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nomina_${desde}_${hasta}.csv`
    a.click()
  }

  const totalImporte = resumen.reduce((s, r) => s + Number(r.total_importe || 0), 0)
  const totalMin     = resumen.reduce((s, r) => s + Number(r.total_min || 0), 0)

  return (
    <div>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
        Lo que ha hecho cada limpiadora en la quincena y cuánto se le paga. Añade partes a mano o
        <strong> impórtalos de las sesiones completadas</strong>. Los precios salen del catálogo de Tarifas.
      </p>

      {/* Selector de quincena */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navMonth(-1)} style={navBtn}>‹</button>
          <span style={{ fontWeight: 800, fontSize: 15, color: C.text, minWidth: 130, textAlign: 'center' }}>{MESES[month]} {year}</span>
          <button onClick={() => navMonth(1)} style={navBtn}>›</button>
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
            {([1, 2] as const).map(qz => (
              <button key={qz} onClick={() => setQuincena(qz)}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: quincena === qz ? 700 : 500,
                  background: quincena === qz ? C.primary : C.bg, color: quincena === qz ? C.white : C.muted }}>
                {qz === 1 ? '1ª quincena' : '2ª quincena'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 8 }}>
          {desde.split('-').reverse().join('/')} → {hasta.split('-').reverse().join('/')}
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => nuevoParte()} style={{ ...actBtn, background: C.primary, color: C.white, border: 'none' }}>➕ Añadir parte</button>
        <button onClick={importarSesiones} disabled={saving} style={actBtn}>🔄 Importar de sesiones</button>
        <button onClick={() => window.print()} disabled={!partes.length} style={actBtn}>🖨 Imprimir</button>
        <button onClick={exportCSV} disabled={!partes.length} style={actBtn}>⬇️ CSV</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: C.ok, marginBottom: 12 }}>{msg}</div>}

      {/* Totales */}
      {resumen.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={kpi}><div style={kpiN}>{resumen.length}</div><div style={kpiL}>Limpiadoras</div></div>
          <div style={kpi}><div style={kpiN}>{fmtMin(totalMin)}</div><div style={kpiL}>Tiempo total</div></div>
          <div style={{ ...kpi, color: C.primary }}><div style={{ ...kpiN, color: C.primary }}>{eur(totalImporte)}</div><div style={kpiL}>Total a pagar</div></div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando…</div> : (
        resumen.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>
            <div style={{ fontWeight: 700 }}>Sin partes en esta quincena</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Añade partes a mano o impórtalos de las sesiones completadas.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {resumen.map(r => {
              const isOpen = open === r.limpiadora_id
              const suyos = partes.filter(p => p.limpiadora_id === r.limpiadora_id)
              return (
                <div key={r.limpiadora_id} className="nomina-card" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', borderLeft: `4px solid ${r.color || C.brand}` }}>
                  <div onClick={() => setOpen(isOpen ? null : r.limpiadora_id)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexWrap: 'wrap' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: r.color || C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontWeight: 800 }}>
                      {r.nombre?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>{r.nombre}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{Number(r.total_servicios)} servicios · ⏱ {fmtMin(Number(r.total_min))}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: C.primary }}>{eur(r.total_importe)}</div>
                    <span style={{ color: C.muted, fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 14px', background: '#fafbff' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <button onClick={() => nuevoParte(r.limpiadora_id)} style={{ ...actBtn, padding: '5px 12px', fontSize: 12 }}>➕ Añadir a {r.nombre.split(' ')[0]}</button>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
                          <thead>
                            <tr style={{ color: C.muted, textAlign: 'left' }}>
                              <th style={th}>Fecha</th><th style={th}>Concepto</th><th style={{ ...th, textAlign: 'center' }}>Cant.</th>
                              <th style={{ ...th, textAlign: 'right' }}>Tiempo</th><th style={{ ...th, textAlign: 'right' }}>Importe</th><th style={th}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {suyos.map(p => (
                              <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={td}>{p.fecha.split('-').reverse().slice(0, 2).join('/')}</td>
                                <td style={{ ...td, fontWeight: 600, color: C.text }}>{p.concepto}{p.origen === 'sesion' && <span title="Importado de sesión" style={{ marginLeft: 5, fontSize: 10, color: C.brand }}>●</span>}</td>
                                <td style={{ ...td, textAlign: 'center' }}>{Number(p.cantidad)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{p.tiempo_min == null ? '—' : fmtMin(Number(p.tiempo_min) * Number(p.cantidad))}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{eur(p.importe_total)}</td>
                                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <button onClick={() => setModal({ ...p, tiempo_min: p.tiempo_min ?? '', importe: p.importe ?? '' })} style={iconBtn}>✏️</button>
                                  <button onClick={() => borrarParte(p.id)} style={{ ...iconBtn, color: C.red }}>×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Modal parte */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: C.white, borderRadius: 16, width: '100%', maxWidth: 440, padding: 22, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: C.text }}>{modal.id ? 'Editar parte' : 'Nuevo parte'}</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={lbl}>Limpiadora
                <select value={modal.limpiadora_id} onChange={e => setModal((m: any) => ({ ...m, limpiadora_id: e.target.value }))} style={inp} disabled={!!modal.id}>
                  <option value="">Selecciona…</option>
                  {limpiadoras.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              {!modal.id && (
                <label style={lbl}>Concepto del catálogo <span style={{ fontWeight: 400 }}>· autocompleta precio y tiempo</span>
                  <select value={modal.catalogo_id} onChange={e => onSelectConcepto(e.target.value)} style={inp}>
                    <option value="">— elige o escribe abajo —</option>
                    {catalogo.map(c => <option key={c.id} value={c.id}>{c.nombre} · {eur(c.precio)}</option>)}
                  </select>
                </label>
              )}
              <label style={lbl}>Concepto
                <input value={modal.concepto} onChange={e => setModal((m: any) => ({ ...m, concepto: e.target.value }))} style={inp} placeholder="ej. Limpieza profunda puntual" />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <label style={lbl}>Fecha
                  <input type="date" value={modal.fecha} min={desde} max={hasta} onChange={e => setModal((m: any) => ({ ...m, fecha: e.target.value }))} style={inp} />
                </label>
                <label style={lbl}>Cantidad
                  <input type="number" min="0.5" step="0.5" value={modal.cantidad} onChange={e => setModal((m: any) => ({ ...m, cantidad: e.target.value }))} style={inp} />
                </label>
                <label style={lbl}>Tiempo (min)
                  <input type="number" min="0" value={modal.tiempo_min} onChange={e => setModal((m: any) => ({ ...m, tiempo_min: e.target.value }))} style={inp} />
                </label>
              </div>
              <label style={lbl}>Importe a pagar (€) <span style={{ fontWeight: 400 }}>· por unidad</span>
                <input type="number" min="0" step="0.5" value={modal.importe} onChange={e => setModal((m: any) => ({ ...m, importe: e.target.value }))} style={inp} placeholder="ej. 13" />
              </label>
              <label style={lbl}>Notas <span style={{ fontWeight: 400 }}>· opcional</span>
                <input value={modal.notas || ''} onChange={e => setModal((m: any) => ({ ...m, notas: e.target.value }))} style={inp} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 10, borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarParte} disabled={saving || !modal.limpiadora_id || !modal.concepto?.trim()}
                style={{ flex: 2, padding: 10, borderRadius: 9, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando…' : modal.id ? 'Guardar' : 'Añadir parte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.primary, fontSize: 18, cursor: 'pointer', fontWeight: 700 }
const actBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, color: C.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const kpi: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', flex: 1, minWidth: 100 }
const kpiN: React.CSSProperties = { fontWeight: 800, fontSize: 18, color: C.text }
const kpiL: React.CSSProperties = { fontSize: 11, color: C.muted }
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600, fontSize: 11.5 }
const td: React.CSSProperties = { padding: '7px 8px', color: C.muted }
const lbl: React.CSSProperties = { fontSize: 12, color: C.muted, fontWeight: 600 }
const inp: React.CSSProperties = { width: '100%', marginTop: 4, padding: '9px 11px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: C.brand, padding: '0 4px' }
