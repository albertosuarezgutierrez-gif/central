'use client'
import { useState, useEffect, useMemo } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9',
  text: '#1e1b4b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2', white: '#ffffff'
}

const TABS = [
  { id: 'clientes',  label: '👥 Clientes'  },
  { id: 'crm',       label: '📊 CRM Leads' },
  { id: 'facturas',  label: '🧾 Facturas'  },
  { id: 'informes',  label: '📄 Informes'  },
]

export default function NegocioPage() {
  const [tab, setTab] = useState('clientes')

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: C.primary, padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0 0' }}>
          <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
          <h1 style={{ color: C.white, fontWeight: 800, fontSize: 20 }}>Negocio</h1>
        </div>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', marginTop: 12 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: 'transparent', whiteSpace: 'nowrap', fontSize: 13,
                color: tab === t.id ? C.white : 'rgba(255,255,255,0.55)',
                fontWeight: tab === t.id ? 700 : 400,
                borderBottom: `2.5px solid ${tab === t.id ? C.white : 'transparent'}`,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        {tab === 'clientes' && <TabClientes />}
        {tab === 'crm'      && <TabCRM />}
        {tab === 'facturas' && <TabFacturas />}
        {tab === 'informes' && <TabInformes />}
      </div>
    </div>
  )
}

// ─── TAB CLIENTES ────────────────────────────────────────────────
function TabClientes() {
  const [clientes, setClientes]     = useState<any[]>([])
  const [tiposCliente, setTipos]    = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editando, setEditando]     = useState<any>(null)
  const [form, setForm]             = useState({ nombre: '', tipo: 'apartamentos_turisticos', contacto_nombre: '', contacto_tel: '', contacto_email: '', direccion: '', notas: '' })
  const [saving, setSaving]         = useState(false)
  const [enviandoAcceso, setEnviandoAcceso] = useState<string | null>(null)

  async function enviarAcceso(c: any) {
    const destino = prompt(
      `Enviar a ${c.nombre} un email con el enlace de acceso a su intranet.\n\nEmail destinatario:`,
      c.notif_email || c.contacto_email || ''
    )
    if (destino === null) return
    setEnviandoAcceso(c.id)
    try {
      const res = await fetch('/api/admin/clientes/' + c.id + '/enviar-acceso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: destino.trim() || undefined })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'No se pudo enviar'); return }
      alert('✅ Acceso enviado a ' + data.destinatario)
    } catch {
      alert('Error de red al enviar el acceso')
    } finally {
      setEnviandoAcceso(null)
    }
  }

  useEffect(() => { cargar() }, [])
  async function cargar() {
    const [rC, rT] = await Promise.all([fetch('/api/admin/clientes'), fetch('/api/admin/catalogos')])
    const [dC, dT] = await Promise.all([rC.json(), rT.json()])
    setClientes(dC.clientes || [])
    const tipos = dT.catalogos?.tipos_cliente?.filter((t: any) => t.activo !== false) || []
    setTipos(tipos.map((t: any) => ({ ...t, icon: t.emoji || t.icon || '📋' })))
    setLoading(false)
  }

  const t = (tipo: string) => tiposCliente.find(tc => tc.id === tipo) || { label: tipo, icon: '📋', color: '#64748b' }
  const filtered = useMemo(() => clientes.filter(c => {
    const ms = !search || c.nombre?.toLowerCase().includes(search.toLowerCase()) || c.contacto_nombre?.toLowerCase().includes(search.toLowerCase())
    const mt = !filtroTipo || c.tipo === filtroTipo
    return ms && mt
  }), [clientes, search, filtroTipo])

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const url = editando ? '/api/admin/clientes/' + editando.id : '/api/admin/clientes'
    const method = editando ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    if (res.ok) {
      await cargar()
      setShowModal(false)
    }
    setSaving(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..."
          style={{ flex: 1, minWidth: 200, padding: '9px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
        <button onClick={() => { setEditando(null); setForm({ nombre: '', tipo: tiposCliente[0]?.id || 'apartamentos_turisticos', contacto_nombre: '', contacto_tel: '', contacto_email: '', direccion: '', notas: '' }); setShowModal(true) }}
          style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Nuevo cliente
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['', ...tiposCliente.map(tc => tc.id)].map(tipo => (
          <button key={tipo} onClick={() => setFiltroTipo(tipo)}
            style={{ padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: filtroTipo === tipo ? 700 : 400,
              background: filtroTipo === tipo ? (tipo ? t(tipo).color : C.primary) : C.bg,
              color: filtroTipo === tipo ? C.white : C.muted }}>
            {tipo ? `${t(tipo).icon} ${t(tipo).label}` : 'Todos'} {tipo ? `(${clientes.filter(c => c.tipo === tipo).length})` : ''}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((c: any) => {
          const tipo = t(c.tipo)
          return (
            <div key={c.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 18px', borderLeft: `4px solid ${tipo.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20 }}>{tipo.icon}</span>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{c.nombre}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{tipo.label} {c.contacto_nombre ? `· ${c.contacto_nombre}` : ''}</div>
                </div>
                <a href={`/admin/clientes/${c.id}/propiedades`}
                  style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.primary}`, background: C.light, fontSize: 12, cursor: 'pointer', color: C.primary, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  🏠 Propiedades
                </a>
                <button onClick={() => { setEditando(c); setForm({ nombre: c.nombre||'', tipo: c.tipo||'', contacto_nombre: c.contacto_nombre||'', contacto_tel: c.contacto_tel||'', contacto_email: c.contacto_email||'', direccion: c.direccion||'', notas: c.notas||'' }); setShowModal(true) }}
                  style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 12, cursor: 'pointer', color: C.text }}>
                  Editar
                </button>
                <button onClick={() => enviarAcceso(c)} disabled={enviandoAcceso === c.id}
                  title="Enviar al cliente el acceso a su intranet por email"
                  style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.primary}`, background: C.primary, fontSize: 12, cursor: 'pointer', color: C.white, fontWeight: 600, whiteSpace: 'nowrap', opacity: enviandoAcceso === c.id ? 0.5 : 1 }}>
                  {enviandoAcceso === c.id ? 'Enviando…' : '✉️ Acceso'}
                </button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted }}>Sin clientes que coincidan</div>}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: C.white, borderRadius: 16, width: '100%', maxWidth: 460, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, color: C.text }}>{editando ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Tipo</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
                  {tiposCliente.map(val => (
                    <button key={val.id} type="button" onClick={() => setForm(f => ({ ...f, tipo: val.id }))}
                      style={{ padding: '7px 10px', borderRadius: 8, border: `2px solid ${form.tipo === val.id ? val.color : C.border}`, background: form.tipo === val.id ? val.color + '15' : C.white, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                      {val.icon} {val.label}
                    </button>
                  ))}
                </div>
              </div>
              {[{k:'nombre',label:'Nombre *',ph:'Empresa o persona'},{k:'contacto_nombre',label:'Contacto',ph:'Nombre'},{k:'contacto_tel',label:'Teléfono',ph:'6xx...'},{k:'contacto_email',label:'Email',ph:'email@...'},{k:'direccion',label:'Dirección',ph:'Calle...'},{k:'notas',label:'Notas',ph:'...'}].map(f => (
                <div key={f.k}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 3 }}>{f.label}</label>
                  <input value={(form as any)[f.k]} onChange={e => setForm(p => ({...p, [f.k]: e.target.value}))} placeholder={f.ph} required={f.k==='nombre'}
                    style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: 10, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: 10, background: C.primary, color: C.white, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB CRM ────────────────────────────────────────────────────
function TabCRM() {
  const [leads, setLeads]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro]   = useState('todos')
  const [selLead, setSelLead] = useState<any>(null)
  const [genIA, setGenIA]     = useState<string|null>(null)

  const ESTADOS: Record<string,{label:string;color:string;bg:string}> = {
    nuevo:             { label: 'Nuevo',             color: C.brand,   bg: C.light   },
    contactado:        { label: 'Contactado',         color: C.warn,    bg: C.warnBg  },
    propuesta_enviada: { label: 'Propuesta enviada',  color: '#7c3aed', bg: '#faf5ff' },
    presupuestado:     { label: 'Presupuestado',      color: '#0891b2', bg: '#ecfeff' },
    ganado:            { label: 'Ganado ✅',           color: C.ok,      bg: C.okBg    },
    perdido:           { label: 'Perdido',            color: C.red,     bg: C.redBg   },
  }

  useEffect(() => { fetch('/api/admin/leads').then(r => r.json()).then(d => { setLeads(d.leads || []); setLoading(false) }) }, [])

  async function cambiarEstado(id: string, estado: string) {
    await fetch('/api/admin/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estado }) })
    setLeads(ls => ls.map(l => l.id === id ? { ...l, estado } : l))
    if (selLead?.id === id) setSelLead((l: any) => ({ ...l, estado }))
  }

  async function generarPropuesta(lead: any) {
    setGenIA(lead.id)
    try {
      const r = await fetch('/api/admin/ia/agente-cotizador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: lead.id }) })
      const d = await r.json()
      if (d.propuesta_url) {
        setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, propuesta_url: d.propuesta_url, estado: 'propuesta_enviada' } : l))
        if (selLead?.id === lead.id) setSelLead((l: any) => ({ ...l, propuesta_url: d.propuesta_url, estado: 'propuesta_enviada' }))
      }
    } catch {}
    setGenIA(null)
  }

  const filtrados = filtro === 'todos' ? leads : leads.filter(l => l.estado === filtro)
  const pendientes = leads.filter(l => ['nuevo', 'contactado'].includes(l.estado)).length
  const ganados    = leads.filter(l => l.estado === 'ganado').length

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.muted }}>{leads.length} leads · {pendientes} pendientes · {ganados} ganados</span>
        <a href="/cotizador" target="_blank" style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.brand, textDecoration: 'none', fontWeight: 600 }}>🔗 Cotizador público</a>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {[['todos','Todos'], ...Object.entries(ESTADOS).map(([k,v]) => [k,v.label])].map(([id,label]) => (
          <button key={id} onClick={() => setFiltro(id)}
            style={{ padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: filtro === id ? 700 : 400, whiteSpace: 'nowrap',
              background: filtro === id ? C.primary : C.bg, color: filtro === id ? C.white : C.muted }}>
            {label} {id !== 'todos' ? `(${leads.filter(l=>l.estado===id).length})` : ''}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtrados.map((lead: any) => {
          const est = ESTADOS[lead.estado] || ESTADOS.nuevo
          return (
            <div key={lead.id} onClick={() => setSelLead(selLead?.id === lead.id ? null : lead)}
              style={{ background: C.white, borderRadius: 12, border: `1px solid ${selLead?.id === lead.id ? C.primary : C.border}`, padding: '14px 16px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3 }}>{lead.nombre}
                    {lead.propuesta_url && <span style={{ fontSize: 10, background: C.light, color: C.primary, padding: '1px 6px', borderRadius: 99, fontWeight: 700, marginLeft: 6 }}>✨ IA</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {lead.telefono && <span>📞 {lead.telefono}</span>}
                    {lead.zona && <span>📍 {lead.zona}</span>}
                    {lead.tipo_servicio && <span>🏠 {lead.tipo_servicio}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {lead.precio_estimado && <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>{lead.precio_estimado}€/mes</div>}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: est.bg, color: est.color }}>{est.label}</span>
                </div>
              </div>
              {selLead?.id === lead.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(ESTADOS).filter(([k]) => k !== lead.estado).map(([k, v]) => (
                      <button key={k} onClick={e => { e.stopPropagation(); cambiarEstado(lead.id, k) }}
                        style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${v.color}`, background: v.bg, color: v.color, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {v.label}
                      </button>
                    ))}
                    {!lead.propuesta_url && (
                      <button onClick={e => { e.stopPropagation(); generarPropuesta(lead) }} disabled={genIA === lead.id}
                        style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: C.primary, color: C.white, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {genIA === lead.id ? 'Generando...' : '✨ Propuesta IA'}
                      </button>
                    )}
                    {lead.propuesta_url && (
                      <a href={lead.propuesta_url} target="_blank" onClick={e => e.stopPropagation()}
                        style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.ok}`, background: C.okBg, color: C.ok, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                        📄 Ver propuesta
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtrados.length === 0 && <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted }}>Sin leads en este estado</div>}
      </div>
    </div>
  )
}

// ─── TAB FACTURAS ────────────────────────────────────────────────
function TabFacturas() {
  const [facturas, setFacturas] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [generando, setGen]     = useState<string|null>(null)

  useEffect(() => {
    fetch('/api/admin/facturas').then(r => r.json()).then(d => { setFacturas(d.facturas || []); setLoading(false) })
  }, [])

  async function verPDF(cliente_id: string, periodo: string) {
    setGen(cliente_id + periodo)
    const r = await fetch('/api/admin/informes/generar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id, periodo, enviar_email: false }) })
    const d = await r.json()
    if (d.html) { const w = window.open('', '_blank'); if (w) { w.document.write(d.html); w.document.close() } }
    setGen(null)
  }

  async function enviarEmail(cliente_id: string, periodo: string) {
    setGen('email_' + cliente_id + periodo)
    await fetch('/api/admin/informes/generar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id, periodo, enviar_email: true }) })
    setGen(null)
    fetch('/api/admin/facturas').then(r => r.json()).then(d => setFacturas(d.facturas || []))
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>

  return (
    <div>
      <div style={{ background: C.light, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: C.brand }}>
        💡 Las facturas se generan automáticamente el día 1 de cada mes y se envían por email a cada cliente.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {facturas.map((f: any) => (
          <div key={f.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 18px' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{f.cliente_nombre}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{f.periodo} · {f.total_sesiones||0} sesiones · {f.total_horas ? f.total_horas + 'h' : '—'} · <strong>€{f.total_facturado||0}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => verPDF(f.cliente_id, f.periodo)} disabled={generando === f.cliente_id + f.periodo}
                  style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {generando === f.cliente_id + f.periodo ? '...' : '👁️ PDF'}
                </button>
                {f.contacto_email && (
                  <button onClick={() => enviarEmail(f.cliente_id, f.periodo)} disabled={generando === 'email_' + f.cliente_id + f.periodo}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: f.email_enviado ? C.okBg : C.primary, color: f.email_enviado ? C.ok : C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {f.email_enviado ? '✅ Enviado' : '📧 Enviar'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {facturas.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 700 }}>Sin facturas aún</div>
            <p style={{ fontSize: 13, marginTop: 4 }}>Se generarán el día 1 del próximo mes</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TAB INFORMES ────────────────────────────────────────────────
function TabInformes() {
  const [clientes, setClientes] = useState<any[]>([])
  const [periodo, setPeriodo]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7) })
  const [loading, setLoading]   = useState<string|null>(null)
  const [generados, setGenerados] = useState<Set<string>>(new Set())

  useEffect(() => { fetch('/api/admin/clientes').then(r => r.json()).then(d => setClientes(d.clientes || [])) }, [])

  async function generar(cliente_id: string, enviar: boolean) {
    setLoading(cliente_id)
    const r = await fetch('/api/admin/informes/generar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id, periodo, enviar_email: enviar }) })
    const d = await r.json()
    if (d.ok) {
      setGenerados(s => new Set([...s, cliente_id]))
      if (d.html) { const w = window.open('', '_blank'); if (w) { w.document.write(d.html); w.document.close() } }
    }
    setLoading(null)
  }

  return (
    <div>
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>📅</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>Período del informe</div>
          <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
            style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: 'none' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clientes.map((c: any) => {
          const yaGen = generados.has(c.id)
          const carg  = loading === c.id
          return (
            <div key={c.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${yaGen ? C.ok : C.border}`, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center', borderLeft: `4px solid ${yaGen ? C.ok : C.brand}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{c.nombre}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{c.tipo}</div>
              </div>
              {yaGen ? (
                <span style={{ fontSize: 13, color: C.ok, fontWeight: 600 }}>✅ Generado</span>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => generar(c.id, false)} disabled={!!carg}
                    style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {carg ? '...' : '👁️ Ver'}
                  </button>
                  <button onClick={() => generar(c.id, true)} disabled={!!carg}
                    style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: C.primary, color: C.white, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {carg ? '...' : '📧 Enviar'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
