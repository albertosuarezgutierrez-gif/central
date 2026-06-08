'use client'
// src/app/asesoria/page.tsx
// Portal para asesorías y contables — gestión contable de múltiples restaurantes

import { useState, useEffect, useCallback } from 'react'

const C = {
  bg: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  red: '#D9442B', ink: '#F6F1E7', ink2: '#D8CDB6',
  ink3: '#9C8E7E', ink4: '#6B5F52', rule: '#2E2720',
  green: '#3F7D44', amber: '#E8A33B',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'
const fmt = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'

type AsesoriaSession = {
  contable_id: string; nombre: string; nombre_asesoria?: string | null; email: string
  restaurantes: { id: string; nombre: string; ciudad?: string; permisos: string[] }[]
}
type Cliente = {
  id: string; nombre: string; ciudad?: string
  ventas_mes: number; base_mes: number; iva_repercutido: number
  dias_con_cierre: number; food_cost_pct?: number; num_tickets?: number
  iva_303: { cuota_diferencial: number; estado: string; fecha_limite: string } | null
  ultimo_arqueo: string | null; facturas_revisar: number; alertas: string[]
}
type Totales = { ventas_mes: number; iva_pendiente: number; num_restaurantes: number; total_alertas: number }
type ResumenCliente = {
  kpis: { ingresos_brutos: number; base_ventas: number; iva_repercutido: number; gastos_compras: number; iva_soportado: number; resultado_bruto: number; food_cost_pct: number; num_tickets: number }
  evolucion: { fecha: string; ventas: number }[]
}
type IVACliente = {
  liquidacion: { cuota_diferencial: number; total_rep: number; total_sop: number; resultado: number; base_rep_10: number; cuota_rep_10: number; base_rep_21: number; cuota_rep_21: number }
  resumen_texto: string; periodo: { año: number; trimestre: number; limite: string }
}

export default function AsesoriaPage() {
  const [session, setSession]     = useState<AsesoriaSession | null>(null)
  const [loginEmail, setEmail]    = useState('')
  const [loginPin,   setPin]      = useState('')
  const [loginErr,   setLoginErr] = useState('')
  const [loginLoad,  setLoginLoad]= useState(false)
  const [clientes,   setClientes] = useState<Cliente[]>([])
  const [totales,    setTotales]  = useState<Totales | null>(null)
  const [loading,    setLoading]  = useState(false)
  const [selected,   setSelected] = useState<string | null>(null)
  const [subTab,     setSubTab]   = useState<'resumen' | 'iva' | 'exportar'>('resumen')
  const [resumen,    setResumen]  = useState<ResumenCliente | null>(null)
  const [ivaData,    setIvaData]  = useState<IVACliente | null>(null)
  const [detLoading, setDetLoading] = useState(false)
  const [toast,      setToast]    = useState('')
  const [exportando, setExportando] = useState(false)
  const [formatoExp, setFormatoExp] = useState('csv')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    const raw = localStorage.getItem('ia_asesoria_session')
    if (raw) { try { setSession(JSON.parse(raw)) } catch { /* ignore */ } }
  }, [])

  const sh = useCallback((s?: AsesoriaSession) => ({
    'Content-Type': 'application/json',
    'x-asesoria-session': JSON.stringify(s ?? session),
  }), [session])

  const login = async () => {
    if (!loginEmail || !loginPin) return
    setLoginLoad(true); setLoginErr('')
    try {
      const r = await fetch('/api/asesoria/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, pin: loginPin }),
      })
      const d = await r.json()
      if (!d.ok) { setLoginErr(d.error ?? 'Credenciales incorrectas'); return }
      localStorage.setItem('ia_asesoria_session', JSON.stringify(d.session))
      setSession(d.session)
    } finally { setLoginLoad(false) }
  }

  const cargarClientes = useCallback(async (s: AsesoriaSession) => {
    setLoading(true)
    const r = await fetch('/api/asesoria/clientes', { headers: sh(s) })
    const d = await r.json()
    if (d.ok) { setClientes(d.clientes ?? []); setTotales(d.totales) }
    setLoading(false)
  }, [sh])

  useEffect(() => { if (session) cargarClientes(session) }, [session])

  const abrirCliente = async (id: string) => {
    setSelected(id); setSubTab('resumen'); setResumen(null); setIvaData(null)
    setDetLoading(true)
    const mes = new Date().toISOString().slice(0, 7)
    const r = await fetch(`/api/asesoria/cliente/${id}?accion=resumen&mes=${mes}`, { headers: sh() as Record<string, string> })
    const d = await r.json()
    if (d.ok) setResumen(d)
    setDetLoading(false)
  }

  const cargarIVA = async (id: string) => {
    setDetLoading(true)
    const r = await fetch(`/api/asesoria/cliente/${id}?accion=iva`, { headers: sh() as Record<string, string> })
    const d = await r.json()
    if (d.ok) setIvaData(d)
    setDetLoading(false)
  }

  const exportar = async (id: string) => {
    setExportando(true)
    const hoy = new Date()
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
    const hasta  = hoy.toISOString().split('T')[0]
    const r = await fetch(`/api/asesoria/cliente/${id}`, {
      method: 'POST', headers: sh() as Record<string, string>,
      body: JSON.stringify({ accion: 'exportar', formato: formatoExp, desde, hasta }),
    })
    if (!r.ok) { const d = await r.json(); showToast('Error: ' + d.error); setExportando(false); return }
    const blob = await r.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = r.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') ?? `contabilidad.${formatoExp === 'a3' ? 'dat' : 'csv'}`
    a.click()
    URL.revokeObjectURL(url)
    showToast('✅ Exportado')
    setExportando(false)
  }

  const cerrarSesion = () => { localStorage.removeItem('ia_asesoria_session'); setSession(null); setClientes([]) }

  const clienteActual = clientes.find(c => c.id === selected)

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!session) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.bg2, borderRadius: 14, padding: 32, width: '100%', maxWidth: 360 }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.red, marginBottom: 4 }}>ia.rest</div>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink, marginBottom: 24 }}>Portal asesoría</div>

        {(['Email', 'PIN'] as const).map((l, i) => (
          <div key={l} style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{l}</div>
            <input
              type={i === 0 ? 'email' : 'password'}
              value={i === 0 ? loginEmail : loginPin}
              onChange={e => i === 0 ? setEmail(e.target.value) : setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              autoFocus={i === 0}
              style={{ width: '100%', padding: '10px 12px', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, fontFamily: SN, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
        ))}

        {loginErr && <div style={{ fontFamily: SN, fontSize: 12, color: '#F87171', marginBottom: 10 }}>{loginErr}</div>}

        <button onClick={login} disabled={loginLoad}
          style={{ width: '100%', padding: '12px', background: loginLoad ? C.bg3 : C.red, color: C.ink, fontFamily: SN, fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 4 }}>
          {loginLoad ? 'Entrando…' : 'Entrar →'}
        </button>

        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
          El acceso lo genera el restaurante desde su panel.<br />
          Si no tienes credenciales, pídelas al restaurante.
        </div>
      </div>
    </div>
  )

  // ── PORTAL ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink }}>
      {/* Header */}
      <div style={{ background: C.bg2, borderBottom: `1px solid ${C.rule}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.red }}>ia.rest</div>
          <div style={{ width: 1, height: 14, background: C.rule }} />
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: C.ink }}>
            {session.nombre_asesoria ?? 'Portal contabilidad'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{session.nombre}</div>
          <button onClick={cerrarSesion}
            style={{ fontFamily: SN, fontSize: 11, padding: '4px 10px', background: 'none', border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink4, cursor: 'pointer' }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px', display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: 16 }}>

        {/* ── LISTA DE CLIENTES ── */}
        <div>
          {/* Totales */}
          {totales && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Ventas mes', val: fmt(totales.ventas_mes), col: C.ink },
                { label: 'IVA pendiente', val: fmt(totales.iva_pendiente), col: totales.iva_pendiente > 0 ? C.amber : C.green },
              ].map(({ label, val, col }) => (
                <div key={label} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: col }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Header lista */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {clientes.length} restaurante{clientes.length !== 1 ? 's' : ''}
            </div>
            {totales && totales.total_alertas > 0 && (
              <div style={{ fontFamily: SN, fontSize: 11, color: C.amber }}>
                ⚠️ {totales.total_alertas} alerta{totales.total_alertas !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {loading && <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 13, color: C.ink3, padding: '20px 0' }}>Cargando…</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientes.map(c => (
              <div key={c.id} onClick={() => abrirCliente(c.id)}
                style={{ background: selected === c.id ? C.bg3 : C.bg2, border: `1.5px solid ${selected === c.id ? C.red + '77' : C.rule}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink }}>{c.nombre}</div>
                  <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: C.ink }}>{fmt(c.ventas_mes)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: c.alertas.length > 0 ? 6 : 0 }}>
                  {c.ciudad && <span style={{ fontFamily: SN, fontSize: 10, color: C.ink4 }}>{c.ciudad}</span>}
                  {c.iva_303 && (
                    <span style={{ fontFamily: SM, fontSize: 10, padding: '1px 7px', borderRadius: 10,
                      background: c.iva_303.estado === 'presentado' ? '#0A2614' : '#2E1A0A',
                      color: c.iva_303.estado === 'presentado' ? '#4ADE80' : C.amber }}>
                      303 T{new Date().getMonth() < 3 ? 1 : new Date().getMonth() < 6 ? 2 : new Date().getMonth() < 9 ? 3 : 4}: {c.iva_303.cuota_diferencial > 0 ? `${c.iva_303.cuota_diferencial.toFixed(0)} €` : 'a compensar'}
                    </span>
                  )}
                  {c.facturas_revisar > 0 && (
                    <span style={{ fontFamily: SM, fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#2E1A0A', color: C.amber }}>
                      {c.facturas_revisar} fc. diferencia
                    </span>
                  )}
                </div>
                {c.alertas.map((a, i) => (
                  <div key={i} style={{ fontFamily: SN, fontSize: 11, color: C.amber, marginTop: 2 }}>⚠️ {a}</div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── DETALLE CLIENTE ── */}
        {selected && clienteActual && (
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink }}>{clienteActual.nombre}</div>
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: C.ink4, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {[
                { id: 'resumen' as const, label: '📊 Resumen' },
                { id: 'iva'     as const, label: '📋 IVA 303' },
                { id: 'exportar'as const, label: '📤 Exportar' },
              ].map(t => (
                <button key={t.id} onClick={() => {
                  setSubTab(t.id)
                  if (t.id === 'iva' && !ivaData) cargarIVA(selected)
                }} style={{
                  fontFamily: SN, fontSize: 12, padding: '5px 12px', borderRadius: 20,
                  background: subTab === t.id ? C.ink : 'transparent',
                  color: subTab === t.id ? C.bg : C.ink3,
                  border: `1px solid ${subTab === t.id ? C.ink : C.rule}`, cursor: 'pointer',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {detLoading && <div style={{ fontFamily: SE, fontStyle: 'italic', color: C.ink3 }}>Cargando…</div>}

            {/* RESUMEN */}
            {subTab === 'resumen' && resumen && !detLoading && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {[
                    { l: 'Ingresos brutos', v: fmt(resumen.kpis.ingresos_brutos), c: C.ink },
                    { l: 'Resultado bruto', v: fmt(resumen.kpis.resultado_bruto), c: resumen.kpis.resultado_bruto >= 0 ? C.green : C.red },
                    { l: 'Food cost', v: resumen.kpis.food_cost_pct.toFixed(1) + '%', c: resumen.kpis.food_cost_pct < 35 ? C.green : C.amber },
                    { l: 'IVA repercutido', v: fmt(resumen.kpis.iva_repercutido), c: C.amber },
                    { l: 'IVA soportado', v: fmt(resumen.kpis.iva_soportado), c: '#60A5FA' },
                    { l: 'Diferencia IVA', v: fmt(resumen.kpis.iva_repercutido - resumen.kpis.iva_soportado), c: C.ink },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ background: C.bg3, borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {resumen.evolucion.length > 0 && (
                  <div style={{ background: C.bg3, borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', marginBottom: 8 }}>Evolución del mes</div>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 48 }}>
                      {resumen.evolucion.map(d => {
                        const max = Math.max(...resumen.evolucion.map(x => x.ventas))
                        const h = max > 0 ? Math.round(d.ventas / max * 44) : 0
                        return <div key={d.fecha} style={{ flex: 1, height: h, background: C.ink, borderRadius: 2, minHeight: 2 }} title={`${d.fecha}: ${fmt(d.ventas)}`} />
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* IVA 303 */}
            {subTab === 'iva' && ivaData && !detLoading && (
              <div>
                <div style={{ background: ivaData.liquidacion.cuota_diferencial > 0 ? '#2E1A0A' : '#0A2614', border: `1px solid ${ivaData.liquidacion.cuota_diferencial > 0 ? C.amber + '44' : C.green + '44'}`, borderRadius: 10, padding: '14px', marginBottom: 14 }}>
                  <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: ivaData.liquidacion.cuota_diferencial > 0 ? C.amber : C.green }}>{ivaData.resumen_texto}</div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 4 }}>Límite: {ivaData.periodo.limite}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['IVA repercutido', fmt(ivaData.liquidacion.total_rep)],
                    ['IVA soportado', fmt(ivaData.liquidacion.total_sop)],
                    ['Base 10%', fmt(ivaData.liquidacion.base_rep_10)],
                    ['Cuota 10%', fmt(ivaData.liquidacion.cuota_rep_10)],
                    ['Base 21%', fmt(ivaData.liquidacion.base_rep_21)],
                    ['Cuota 21%', fmt(ivaData.liquidacion.cuota_rep_21)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: C.bg3, borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{v}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => {
                  const txt = `303 T${ivaData.periodo.trimestre} ${ivaData.periodo.año} — ${clienteActual?.nombre}\nIVA repercutido: ${fmt(ivaData.liquidacion.total_rep)}\nIVA soportado: ${fmt(ivaData.liquidacion.total_sop)}\n${ivaData.resumen_texto}`
                  navigator.clipboard.writeText(txt)
                  showToast('📋 Copiado')
                }} style={{ marginTop: 12, fontFamily: SN, fontSize: 12, padding: '8px 14px', background: 'none', border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink3, cursor: 'pointer' }}>
                  📋 Copiar resumen
                </button>
              </div>
            )}

            {/* EXPORTAR */}
            {subTab === 'exportar' && (
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, marginBottom: 14 }}>
                  Exporta los asientos del mes actual en el formato de tu software contable.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {[
                    { id: 'a3',     label: 'A3 Wolters Kluwer', desc: 'SUENLACE.DAT' },
                    { id: 'sage',   label: 'Sage 50',           desc: 'CSV Sage' },
                    { id: 'holded', label: 'Holded / Contasimple', desc: 'CSV Holded' },
                    { id: 'csv',    label: 'CSV genérico',      desc: 'Compatible con cualquier software' },
                  ].map(f => (
                    <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: formatoExp === f.id ? C.bg3 : 'transparent', border: `1.5px solid ${formatoExp === f.id ? C.ink : C.rule}`, borderRadius: 8, cursor: 'pointer' }}>
                      <input type="radio" value={f.id} checked={formatoExp === f.id} onChange={() => setFormatoExp(f.id)} style={{ accentColor: C.red }} />
                      <div>
                        <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{f.label}</div>
                        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{f.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button onClick={() => exportar(selected)} disabled={exportando}
                  style={{ width: '100%', padding: '11px', background: exportando ? C.bg3 : C.red, color: C.ink, fontFamily: SN, fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                  {exportando ? 'Generando…' : '📤 Exportar asientos del mes'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.ink, color: C.bg, fontFamily: SN, fontSize: 13, padding: '10px 20px', borderRadius: 20, zIndex: 999 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
