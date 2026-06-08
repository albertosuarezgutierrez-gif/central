'use client'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9',
  text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2'
}

const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  nuevo:             { label: 'Nuevo',             color: C.brand,   bg: C.light   },
  contactado:        { label: 'Contactado',         color: C.warn,    bg: C.warnBg  },
  propuesta_enviada: { label: 'Propuesta enviada',  color: '#7c3aed', bg: '#faf5ff' },
  presupuestado:     { label: 'Presupuestado',      color: '#0891b2', bg: '#ecfeff' },
  ganado:            { label: 'Ganado ✅',           color: C.ok,      bg: C.okBg    },
  perdido:           { label: 'Perdido',            color: C.red,     bg: C.redBg   },
}

export default function CRMPage() {
  const [leads, setLeads]       = useState<any[]>([])
  const [filtro, setFiltro]     = useState('todos')
  const [loading, setLoading]   = useState(true)
  const [selLead, setSelLead]   = useState<any>(null)
  const [nota, setNota]         = useState('')
  const [genIA, setGenIA]       = useState<string | null>(null) // lead_id generando

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const r = await fetch('/api/admin/leads')
    const d = await r.json()
    setLeads(d.leads || [])
    setLoading(false)
  }

  async function cambiarEstado(id: string, estado: string) {
    await fetch('/api/admin/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    })
    setLeads(ls => ls.map(l => l.id === id ? { ...l, estado } : l))
    if (selLead?.id === id) setSelLead((l: any) => ({ ...l, estado }))
  }

  async function guardarNota(id: string) {
    if (!nota.trim()) return
    await fetch('/api/admin/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, notas: nota })
    })
    setLeads(ls => ls.map(l => l.id === id ? { ...l, notas: nota } : l))
    if (selLead?.id === id) setSelLead((l: any) => ({ ...l, notas: nota }))
    setNota('')
  }

  async function generarPropuesta(lead_id: string, empresa_id: string) {
    setGenIA(lead_id)
    try {
      const r = await fetch('/api/admin/ia/agente-cotizador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id, empresa_id })
      })
      const d = await r.json()
      if (d.ok) {
        // Actualizar lead en estado local con propuesta_url
        setLeads(ls => ls.map(l => l.id === lead_id
          ? { ...l, propuesta_url: d.propuesta_url, estado: 'propuesta_enviada' }
          : l
        ))
        if (selLead?.id === lead_id) {
          setSelLead((l: any) => ({ ...l, propuesta_url: d.propuesta_url, estado: 'propuesta_enviada' }))
        }
      }
    } finally {
      setGenIA(null)
    }
  }

  const filtrados  = filtro === 'todos' ? leads : leads.filter(l => l.estado === filtro)
  const total      = leads.length
  const pendientes = leads.filter(l => ['nuevo', 'contactado'].includes(l.estado)).length
  const ganados    = leads.filter(l => l.estado === 'ganado').length
  const conPropuesta = leads.filter(l => l.propuesta_url).length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>

      {/* Header */}
      <header style={{ background: C.primary, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
        <div style={{ flex: 1 }}>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>CRM de leads</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
            {total} leads · {pendientes} pendientes · {ganados} ganados · {conPropuesta} propuestas IA
          </p>
        </div>
        <a href="/cotizador" target="_blank"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
          🔗 Cotizador público
        </a>
      </header>

      {/* Filtros */}
      <div style={{ background: 'white', borderBottom: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {[['todos', 'Todos'], ...Object.entries(ESTADOS).map(([k, v]) => [k, v.label])].map(([id, label]) => (
          <button key={id} onClick={() => setFiltro(id)}
            style={{ padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: filtro === id ? 700 : 500, background: filtro === id ? C.primary : C.bg, color: filtro === id ? 'white' : C.muted, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            {label} {id !== 'todos' ? '(' + leads.filter(l => l.estado === id).length + ')' : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selLead ? '1fr 400px' : '1fr', gap: 0, maxHeight: 'calc(100vh - 120px)', overflow: 'hidden' }}>

        {/* Lista */}
        <div style={{ padding: '16px 24px', overflowY: 'auto' }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>}
          {!loading && filtrados.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
              <div style={{ fontWeight: 700 }}>Sin leads {filtro !== 'todos' ? 'en este estado' : ''}</div>
              <p style={{ fontSize: 13, marginTop: 4 }}>Los leads del cotizador aparecerán aquí automáticamente</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtrados.map((lead: any) => {
              const est = ESTADOS[lead.estado] || ESTADOS.nuevo
              const tieneIA = !!lead.propuesta_url || !!lead.propuesta_ia_at
              return (
                <div key={lead.id} onClick={() => setSelLead(lead)}
                  style={{ background: 'white', borderRadius: 12, border: `1px solid ${selLead?.id === lead.id ? C.primary : C.border}`, padding: '14px 18px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {lead.nombre}
                        {tieneIA && <span style={{ fontSize: 10, background: C.light, color: C.primary, padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>✨ IA</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {lead.telefono && <a href={'tel:' + lead.telefono} onClick={e => e.stopPropagation()} style={{ color: C.primary, textDecoration: 'none' }}>📞 {lead.telefono}</a>}
                        {lead.zona && <span>📍 {lead.zona}</span>}
                        {lead.tipo_servicio && <span>🏠 {lead.tipo_servicio}</span>}
                        {lead.m2 && <span>📐 {lead.m2}m²</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {lead.precio_estimado && <div style={{ fontWeight: 800, color: C.primary, fontSize: 15 }}>{lead.precio_estimado}€/mes</div>}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: est.bg, color: est.color }}>{est.label}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Panel detalle */}
        {selLead && (() => {
          const est = ESTADOS[selLead.estado] || ESTADOS.nuevo
          const tieneIA = !!selLead.propuesta_url || !!selLead.propuesta_ia_at
          const generando = genIA === selLead.id
          return (
            <div style={{ background: 'white', borderLeft: `1px solid ${C.border}`, overflowY: 'auto' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{selLead.nombre}</h3>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: est.bg, color: est.color }}>{est.label}</span>
                </div>
                <button onClick={() => setSelLead(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ padding: '16px 20px' }}>

                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {[
                    ['📞', selLead.telefono, 'tel:'],
                    ['✉️', selLead.email, 'mailto:'],
                    ['📍', selLead.zona, null],
                    ['🏠', selLead.tipo_servicio, null],
                    ['📐', selLead.m2 ? selLead.m2 + ' m²' : null, null],
                    ['🔄', selLead.frecuencia, null],
                    ['💶', selLead.precio_estimado ? selLead.precio_estimado + '€/mes estimado' : null, null],
                  ].filter(([, v]) => v).map(([icon, val, href]) => (
                    <div key={String(icon)} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                      <span>{icon}</span>
                      {href ? <a href={href + val} style={{ color: C.primary, textDecoration: 'none' }}>{val}</a> : <span style={{ color: C.text }}>{val}</span>}
                    </div>
                  ))}
                </div>

                {/* Propuesta IA */}
                <div style={{ marginBottom: 20, background: tieneIA ? C.light : C.bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${tieneIA ? C.brand : C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: tieneIA ? C.primary : C.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    ✨ Propuesta IA
                  </div>
                  {tieneIA ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, color: C.ok, fontWeight: 600 }}>✅ Propuesta generada automáticamente</div>
                      {selLead.propuesta_ia_at && (
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {new Date(selLead.propuesta_ia_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {selLead.propuesta_email_at ? ' · Email enviado ✉️' : ''}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {selLead.propuesta_url && (
                          <a href={selLead.propuesta_url} target="_blank"
                            style={{ flex: 1, padding: '8px', borderRadius: 8, background: C.primary, color: 'white', textDecoration: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                            👁️ Ver propuesta
                          </a>
                        )}
                        <button
                          onClick={() => generarPropuesta(selLead.id, selLead.empresa_id)}
                          disabled={generando}
                          style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'white', color: C.primary, border: `1px solid ${C.primary}`, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          🔄 Regenerar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                        Genera una propuesta personalizada con IA para este lead
                      </div>
                      <button
                        onClick={() => generarPropuesta(selLead.id, selLead.empresa_id)}
                        disabled={generando}
                        style={{ width: '100%', padding: '10px', borderRadius: 8, background: generando ? C.muted : C.primary, color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: generando ? 'not-allowed' : 'pointer' }}>
                        {generando ? '⏳ Generando propuesta...' : '✨ Generar propuesta con IA'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Acciones rápidas */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {selLead.telefono && (
                    <a href={'https://wa.me/' + selLead.telefono.replace('+', '').replace(/ /g, '')} target="_blank"
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#25d366', color: 'white', textDecoration: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                      💬 WhatsApp
                    </a>
                  )}
                  {selLead.telefono && (
                    <a href={'tel:' + selLead.telefono}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: C.light, color: C.primary, textDecoration: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                      📞 Llamar
                    </a>
                  )}
                  {selLead.email && (
                    <a href={'mailto:' + selLead.email}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, background: C.bg, color: C.text, textDecoration: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                      ✉️ Email
                    </a>
                  )}
                </div>

                {/* Estado */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estado</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(ESTADOS).map(([k, v]) => (
                      <button key={k} onClick={() => cambiarEstado(selLead.id, k)}
                        style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${selLead.estado === k ? v.color : C.border}`, background: selLead.estado === k ? v.bg : 'white', color: selLead.estado === k ? v.color : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notas */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notas</div>
                  {selLead.notas && <p style={{ fontSize: 13, color: C.text, marginBottom: 8, background: C.bg, padding: '10px 12px', borderRadius: 8 }}>{selLead.notas}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={nota} onChange={e => setNota(e.target.value)}
                      placeholder="Añadir nota..."
                      style={{ flex: 1, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => guardarNota(selLead.id)}
                      style={{ padding: '8px 14px', background: C.primary, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      ✓
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
