'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type Lead = {
  id: string; nombre_cliente: string; email: string | null; telefono: string | null
  tipo_evento: string; fecha_tentativa: string | null; aforo_estimado: number | null
  presupuesto_cliente: number | null; estado: string; probabilidad_pct: number
  proxima_accion: string | null; proxima_accion_fecha: string | null
  notas: string | null; coordinador: { nombre: string } | null
  espacio: { nombre: string } | null; created_at: string
}

const ESTADOS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  nuevo:               { label: 'Nuevo',               color: '#6B7280', emoji: '🆕' },
  contactado:          { label: 'Contactado',           color: '#2B6A6E', emoji: '📞' },
  presupuesto_enviado: { label: 'Presupuesto enviado',  color: '#E8A33B', emoji: '📄' },
  negociacion:         { label: 'En negociación',       color: '#6366F1', emoji: '🤝' },
  ganado:              { label: 'Ganado',               color: '#3F7D44', emoji: '🏆' },
  perdido:             { label: 'Perdido',              color: '#9CA3AF', emoji: '❌' },
}

const TIPO_ICON: Record<string, string> = { boda:'💍', comunion:'⛪', bautizo:'👶', cumpleanos:'🎂', empresa:'🏢', otro:'📅' }
const fmtEur = (n: number | null) => n ? `${n.toLocaleString('es-ES')} €` : '—'
const fmtFecha = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

interface CRMEventosTabProps {
  restauranteId: string
  sh: () => Record<string, string>
  esCoordinador?: boolean
}

export default function CRMEventosTab({ restauranteId, sh, esCoordinador }: CRMEventosTabProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [pipeline, setPipeline] = useState<Record<string, number>>({})
  const [valorPipeline, setValorPipeline] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('activos')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [leadSeleccionado, setLeadSeleccionado] = useState<Lead | null>(null)
  const [form, setForm] = useState({
    nombre_cliente: '', email: '', telefono: '',
    tipo_evento: 'boda', fecha_tentativa: '',
    aforo_estimado: '', presupuesto_cliente: '',
    proxima_accion: '', proxima_accion_fecha: '', notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [notaRapida, setNotaRapida] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const params = filtroEstado !== 'activos' ? `&estado=${filtroEstado}` : ''
    const res = await fetch(`/api/owner/eventos/leads?${params}`, { headers: sh() })
    const data = await res.json()
    let leads = data.leads ?? []
    if (filtroEstado === 'activos') {
      leads = leads.filter((l: Lead) => !['ganado','perdido'].includes(l.estado))
    }
    setLeads(leads)
    setPipeline(data.pipeline ?? {})
    setValorPipeline(data.valor_pipeline ?? 0)
    setLoading(false)
  }, [sh, filtroEstado])

  useEffect(() => { cargar() }, [cargar])

  const crearLead = async () => {
    if (!form.nombre_cliente) return
    setSaving(true)
    try {
      await fetch('/api/owner/eventos/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({
          ...form,
          aforo_estimado: form.aforo_estimado ? parseInt(form.aforo_estimado) : null,
          presupuesto_cliente: form.presupuesto_cliente ? parseFloat(form.presupuesto_cliente) : null,
        }),
      })
      setMostrarForm(false)
      setForm({ nombre_cliente:'',email:'',telefono:'',tipo_evento:'boda',fecha_tentativa:'',aforo_estimado:'',presupuesto_cliente:'',proxima_accion:'',proxima_accion_fecha:'',notas:'' })
      cargar()
    } finally { setSaving(false) }
  }

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/owner/eventos/leads', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, estado }),
    })
    cargar()
    if (leadSeleccionado?.id === id) setLeadSeleccionado(prev => prev ? { ...prev, estado } : null)
  }

  const añadirNota = async (id: string) => {
    if (!notaRapida) return
    await fetch('/api/owner/eventos/leads', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, nota: notaRapida, tipo_nota: 'nota' }),
    })
    setNotaRapida('')
    cargar()
  }

  const estadoConf = (e: string) => ESTADOS_CONFIG[e] ?? { label: e, color: C.ink3, emoji: '•' }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Stats pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'En pipeline', value: Object.entries(pipeline).filter(([k]) => !['ganado','perdido'].includes(k)).reduce((s,[,v]) => s+v, 0).toString(), color: C.ink },
          { label: 'Ganados', value: (pipeline.ganado ?? 0).toString(), color: C.green },
          { label: 'Valor pipeline', value: fmtEur(valorPipeline), color: C.amber },
        ].map(s => (
          <div key={s.label} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, color: s.color, fontStyle: 'italic' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros + botón nuevo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        {['activos','nuevo','contactado','presupuesto_enviado','negociacion','ganado','perdido'].map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)} style={{
            padding: '4px 10px', borderRadius: 5,
            background: filtroEstado === e ? C.ink : 'transparent',
            border: `1px solid ${C.rule}`,
            color: filtroEstado === e ? C.paper : C.ink3,
            fontFamily: SN, fontSize: 11, cursor: 'pointer',
          }}>
            {e === 'activos' ? 'Activos' : estadoConf(e).emoji + ' ' + estadoConf(e).label}
            {e !== 'activos' && pipeline[e] ? ` (${pipeline[e]})` : ''}
          </button>
        ))}
        <button onClick={() => setMostrarForm(v => !v)} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Nuevo lead
        </button>
      </div>

      {/* Form nuevo lead */}
      {mostrarForm && (
        <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ fontFamily: SE, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 12 }}>Nuevo lead</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            {[
              { field: 'nombre_cliente', label: 'Cliente *', type: 'text', ph: 'María y Juan' },
              { field: 'telefono', label: 'Teléfono', type: 'tel', ph: '600 000 000' },
              { field: 'email', label: 'Email', type: 'email', ph: 'novios@email.com' },
              { field: 'fecha_tentativa', label: 'Fecha tentativa', type: 'date', ph: '' },
              { field: 'aforo_estimado', label: 'Aforo estimado', type: 'number', ph: '200' },
              { field: 'presupuesto_cliente', label: 'Presupuesto cliente €', type: 'number', ph: '8000' },
            ].map(({ field, label, type, ph }) => (
              <div key={field}>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>{label}</div>
                <input type={type} placeholder={ph}
                  value={(form as Record<string, string>)[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' as const }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Próxima acción</div>
            <input type="text" placeholder="Llamar para confirmar menú..."
              value={form.proxima_accion}
              onChange={e => setForm(f => ({ ...f, proxima_accion: e.target.value }))}
              style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '7px 14px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={crearLead} disabled={saving} style={{ padding: '7px 14px', borderRadius: 5, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? '...' : 'Crear lead'}
            </button>
          </div>
        </div>
      )}

      {/* Lista leads */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, fontFamily: SN, fontSize: 13, color: C.ink3 }}>Cargando leads...</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, background: C.paper, borderRadius: 10, border: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
          <div style={{ fontFamily: SE, fontSize: 16, color: C.ink }}>Sin leads en este estado</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginTop: 4 }}>Añade el primer lead con el botón de arriba</div>
        </div>
      ) : (
        leads.map(lead => {
          const est = estadoConf(lead.estado)
          const isSelected = leadSeleccionado?.id === lead.id
          return (
            <div key={lead.id} style={{ background: C.paper, border: `1px solid ${isSelected ? C.ink : C.rule}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
              {/* Header lead */}
              <div style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => setLeadSeleccionado(isSelected ? null : lead)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 8px', borderRadius: 99, background: est.color + '22', color: est.color, fontWeight: 600 }}>
                        {est.emoji} {est.label}
                      </span>
                      {lead.probabilidad_pct > 0 && (
                        <span style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>{lead.probabilidad_pct}%</span>
                      )}
                    </div>
                    <div style={{ fontFamily: SE, fontSize: 16, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>
                      {TIPO_ICON[lead.tipo_evento] ?? '📅'} {lead.nombre_cliente}
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 2 }}>
                      {lead.fecha_tentativa ? fmtFecha(lead.fecha_tentativa) : 'Fecha sin definir'}
                      {lead.aforo_estimado ? ` · ~${lead.aforo_estimado}p` : ''}
                      {lead.espacio ? ` · ${lead.espacio.nombre}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {lead.presupuesto_cliente && (
                      <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.green, fontStyle: 'italic' }}>{fmtEur(lead.presupuesto_cliente)}</div>
                    )}
                    {lead.telefono && (
                      <a href={`https://wa.me/34${lead.telefono.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'block', marginTop: 4, fontFamily: SN, fontSize: 11, color: '#25D366', textDecoration: 'none' }}>
                        💬 WhatsApp
                      </a>
                    )}
                  </div>
                </div>
                {lead.proxima_accion && (
                  <div style={{ marginTop: 6, fontFamily: SN, fontSize: 11, color: C.amber }}>
                    ⏰ {lead.proxima_accion}
                    {lead.proxima_accion_fecha ? ` · ${fmtFecha(lead.proxima_accion_fecha)}` : ''}
                  </div>
                )}
              </div>

              {/* Detalle expandido */}
              {isSelected && (
                <div style={{ borderTop: `1px solid ${C.rule}`, padding: '12px 16px', background: C.bone }}>
                  {/* Cambiar estado */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 6 }}>Mover a</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                      {Object.entries(ESTADOS_CONFIG).filter(([k]) => k !== lead.estado).map(([k, v]) => (
                        <button key={k} onClick={() => cambiarEstado(lead.id, k)} style={{
                          padding: '4px 10px', borderRadius: 5,
                          border: `1px solid ${v.color}44`,
                          background: v.color + '11',
                          color: v.color, fontFamily: SN, fontSize: 11, cursor: 'pointer',
                        }}>
                          {v.emoji} {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Añadir nota rápida */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" placeholder="Añadir nota de seguimiento..."
                      value={notaRapida}
                      onChange={e => setNotaRapida(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && añadirNota(lead.id)}
                      style={{ flex: 1, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SN, fontSize: 12, color: C.ink }} />
                    <button onClick={() => añadirNota(lead.id)} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: C.ink, color: C.paper, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
                      Añadir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
