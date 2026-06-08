'use client'
import { useState, useEffect } from 'react'
import SuperHeader, { BrandMark } from '@/components/SuperHeader'
import { C } from './_ui'

function StatCard({ label, value, sub, color }: any) {
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || C.accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function SuperadminPage() {
  const [empresas, setEmpresas] = useState<any[]>([])
  const [consent, setConsent]   = useState<any[]>([])
  const [soloMkt, setSoloMkt]   = useState(false)
  const [qEmpresas, setQEmpresas] = useState('')
  const [qConsent, setQConsent]   = useState('')
  const [loading, setLoading]   = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: 'alberto.suarez.gutierrez@gmail.com', password: '' })
  const [loginErr, setLoginErr]   = useState('')

  useEffect(() => {
    // Try to load — if 403, show login
    fetch('/api/superadmin/empresas')
      .then(r => { if (r.ok) { setLoggedIn(true); return r.json() } throw r })
      .then(d => { setEmpresas(d.empresas || []); setLoading(false) })
      .catch(() => { setLoggedIn(false); setLoading(false) })
    fetch('/api/superadmin/consentimientos')
      .then(r => r.ok ? r.json() : { clientes: [] })
      .then(d => setConsent(d.clientes || []))
      .catch(() => {})
  }, [])

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setLoginErr('')
    const r = await fetch('/api/superadmin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm),
    })
    const d = await r.json()
    if (d.ok) {
      setLoggedIn(true); setLoading(true)
      const r2 = await fetch('/api/superadmin/empresas')
      const d2 = await r2.json()
      setEmpresas(d2.empresas || [])
      const r3 = await fetch('/api/superadmin/consentimientos')
      const d3 = await r3.json().catch(() => ({ clientes: [] }))
      setConsent(d3.clientes || [])
      setLoading(false)
    } else {
      setLoginErr(d.error || 'Error')
    }
  }

  // ── LOGIN ────────────────────────────────────────────────────────
  if (!loggedIn) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ background: C.card, borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 380, border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <BrandMark size={30} />
          <div style={{ fontSize: 13, color: C.muted }}>Panel superadmin</div>
        </div>
        <form onSubmit={doLogin}>
          {loginErr && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: C.red }}>{loginErr}</div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>EMAIL</label>
            <input value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
              type="email" required
              style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#f8fafc', color: C.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>CONTRASEÑA</label>
            <input value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
              type="password" required placeholder="••••••••"
              style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#f8fafc', color: C.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <button type="submit"
            style={{ width: '100%', padding: '13px', background: C.accent, border: 'none', borderRadius: 10, fontSize: 15, color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800 }}>
            Entrar →
          </button>
        </form>
        <div style={{ marginTop: 16, fontSize: 11, color: C.muted, textAlign: 'center' }}>
          Primera vez: pon cualquier contraseña — quedará guardada como la tuya
        </div>
      </div>
    </div>
  )

  // ── STATS ───────────────────────────────────────────────────────
  const totalEmpresas        = empresas.length
  const totalActivas         = empresas.filter(e => e.activa).length
  const totalLimpiadoras     = empresas.reduce((a, e) => a + Number(e.limpiadoras_activas || 0), 0)
  const totalSesiones        = empresas.reduce((a, e) => a + Number(e.sesiones_mes || 0), 0)
  const mrr                  = empresas.reduce((a, e) => a + 49 + Number(e.limpiadoras_activas || 0) * 12, 0)

  // ── Consentimientos ─────────────────────────────────────────────
  const fmtFecha = (v: any) => v ? new Date(v).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  const matchQ = (q: string, ...vals: any[]) => { const s = q.trim().toLowerCase(); return !s || vals.some(v => String(v ?? '').toLowerCase().includes(s)) }
  const empresasView = empresas.filter(e => matchQ(qEmpresas, e.nombre, e.email))
  const consentView  = consent
    .filter(c => !soloMkt || c.marketing_aceptado)
    .filter(c => matchQ(qConsent, c.nombre, c.empresa_nombre, c.email))
  const totalMkt    = consent.filter(c => c.marketing_aceptado).length
  const inpSearch: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#f8fafc', color: C.text, fontSize: 13, fontFamily: 'inherit', minWidth: 180, maxWidth: 260, flex: 1 }

  function exportarCSV() {
    const filas = consent.filter(c => c.marketing_aceptado)
    const head  = ['Cliente', 'Empresa', 'Email', 'Telefono', 'Acepta_ofertas_desde']
    const esc   = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const csv   = [head.join(',')].concat(
      filas.map(c => [c.nombre, c.empresa_nombre, c.email, c.telefono, fmtFecha(c.marketing_aceptado_at)].map(esc).join(','))
    ).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `marketing-clientes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif", color: C.text }}>

      {/* Header */}
      <SuperHeader activo="inicio" />

      <div style={{ padding: '28px', maxWidth: 1000, margin: '0 auto' }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
          <StatCard label="Empresas" value={totalActivas} sub={`${totalEmpresas} total`} />
          <StatCard label="Limpiadoras activas" value={totalLimpiadoras} color={C.ok} />
          <StatCard label="Sesiones este mes" value={totalSesiones} />
          <StatCard label="MRR estimado" value={`${mrr}€`} sub="49€ base + 12€/limp." color="#f59e0b" />
          <StatCard label="ARR estimado" value={`${mrr * 12}€`} color="#f59e0b" />
        </div>

        {/* Tabla empresas */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Empresas registradas</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
              <input value={qEmpresas} onChange={e => setQEmpresas(e.target.value)} placeholder="🔎 Buscar empresa o email…" style={inpSearch} />
              <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>{loading ? 'Cargando...' : `${empresasView.length}${qEmpresas ? ' de ' + totalEmpresas : ''} empresa${(qEmpresas ? empresasView.length : totalEmpresas) !== 1 ? 's' : ''}`}</div>
            </div>
          </div>

          {loading
            ? <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Cargando...</div>
            : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Empresa', 'Email', 'Limpiadoras', 'Clientes', 'Propiedades', 'Sesiones/mes', 'Cuota est.', 'Estado'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: C.muted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empresasView.map((e: any) => {
                    const cuota = 49 + Number(e.limpiadoras_activas || 0) * 12
                    return (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{e.nombre}</td>
                        <td style={{ padding: '12px 16px', color: C.muted, fontSize: 12 }}>{e.email}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 800, color: C.ok }}>{e.limpiadoras_activas || 0}</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: C.text }}>{e.total_clientes || 0}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: C.text }}>{e.total_propiedades || 0}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: C.text }}>{e.sesiones_mes || 0}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, color: '#f59e0b' }}>{cuota}€/mes</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px',
                            background: e.activa ? C.okBg : '#fef2f2',
                            color: e.activa ? C.ok : C.red
                          }}>
                            {e.activa ? '● Activa' : '● Inactiva'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer tabla */}
          {!loading && empresas.length > 0 && (
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
              <span style={{ color: C.muted }}>Total limpiadoras: <strong style={{ color: C.text }}>{totalLimpiadoras}</strong></span>
              <span style={{ color: C.muted }}>MRR: <strong style={{ color: '#f59e0b' }}>{mrr}€</strong></span>
              <span style={{ color: C.muted }}>ARR: <strong style={{ color: '#f59e0b' }}>{mrr * 12}€</strong></span>
            </div>
          )}
        </div>

        {/* Consentimientos RGPD (cross-empresa) */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', marginTop: 28 }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Consentimientos de clientes</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {consent.length} con consentimiento · <strong style={{ color: C.ok }}>{totalMkt}</strong> aceptan ofertas (marketing)
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input value={qConsent} onChange={e => setQConsent(e.target.value)} placeholder="🔎 Buscar cliente, empresa o email…" style={inpSearch} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={soloMkt} onChange={e => setSoloMkt(e.target.checked)} style={{ accentColor: C.accent }} />
                Solo los que aceptan ofertas
              </label>
              <button onClick={exportarCSV} disabled={totalMkt === 0}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: totalMkt === 0 ? '#c7d2fe' : C.accent,
                  color: '#fff', fontWeight: 800, fontSize: 12, fontFamily: 'inherit', cursor: totalMkt === 0 ? 'default' : 'pointer' }}>
                ⬇ Exportar CSV marketing
              </button>
            </div>
          </div>

          {consentView.length === 0
            ? <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>{(qConsent || soloMkt) && consent.length > 0 ? 'Sin resultados para el filtro.' : 'Sin consentimientos todavía.'}</div>
            : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Cliente', 'Empresa', 'Email', 'Teléfono', 'Servicio', 'Ofertas', 'Desde'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: C.muted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consentView.map((c: any) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{c.nombre}</td>
                      <td style={{ padding: '12px 16px', color: C.muted, fontSize: 12 }}>{c.empresa_nombre}</td>
                      <td style={{ padding: '12px 16px', color: C.muted, fontSize: 12 }}>{c.email || '—'}</td>
                      <td style={{ padding: '12px 16px', color: C.muted, fontSize: 12 }}>{c.telefono || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px',
                          background: c.rgpd_aceptado ? C.okBg : '#fef2f2', color: c.rgpd_aceptado ? C.ok : C.red }}>
                          {c.rgpd_aceptado ? `✓ v${c.rgpd_version || '?'}` : '✗'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px',
                          background: c.marketing_aceptado ? C.okBg : C.light, color: c.marketing_aceptado ? C.ok : C.muted }}>
                          {c.marketing_aceptado ? '✓ Sí' : '— No'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtFecha(c.marketing_aceptado_at || c.rgpd_aceptado_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
