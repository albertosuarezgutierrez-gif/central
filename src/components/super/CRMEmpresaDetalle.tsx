'use client'
import { useState, useEffect, useCallback } from 'react'
import { C, SN, SE } from '@/lib/colors'

interface LeadEvento { tipo: string; texto: string; fecha: string }
interface Lead {
  id: string; nombre: string; restaurante: string; telefono: string; email?: string
  estado: string; notas: string | null; created_at: string
  tipo: string; locales?: string; tpv?: string; contacto?: string
  eventos: LeadEvento[]; puntuacion?: number
  landing_slug?: string; propuesta_url?: string
  siguiente_contacto_texto?: string | null; siguiente_contacto_at?: string | null
  ultima_actividad_at?: string | null
}
interface Local { id: string; nombre: string; ciudad: string | null; tipo: string; aforo: number | null; notas: string | null }
interface Contacto {
  id: string; nombre: string; cargo: string | null; email: string | null
  telefono: string | null; es_decisor: boolean; canal_preferido: string
  score: number; notas: string | null; activo: boolean
  local?: { id: string; nombre: string } | null
}
interface Comunicacion {
  id: string; tipo_interaccion: string; canal: string
  resumen_ia: string | null; texto_reunion: string | null; created_at: string
  contacto?: { nombre: string; cargo: string | null } | null
}

type Tab = 'info' | 'locales' | 'contactos' | 'historial' | 'agente'

const CANAL_ICONS: Record<string, string> = {
  whatsapp: '💬', email: '📧', llamada: '📞', reunion: '🤝', instagram: '📸', nota: '📝', nota_interna: '📝'
}

const ESTADO_COLOR: Record<string, string> = {
  nuevo: '#6B5F52', contactado: '#E8A33B', demo: '#3F7D44', cliente: '#D9442B', descartado: '#444'
}

function scoreColor(s: number) {
  return s >= 70 ? C.green : s >= 40 ? C.amber : '#9B2226'
}

export default function CRMEmpresaDetalle({
  lead,
  onUpdate,
  onDelete,
  sh,
}: {
  lead: Lead
  onUpdate: (updated: Partial<Lead>) => void
  onDelete: () => void
  sh: () => Record<string, string>
}) {
  const [tab, setTab] = useState<Tab>('contactos')
  const [locales, setLocales] = useState<Local[]>([])
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [comunicaciones, setComunicaciones] = useState<Comunicacion[]>([])
  const [briefing, setBriefing] = useState<string | null>(null)
  const [loadingBriefing, setLoadingBriefing] = useState(false)

  const [nuevoLocal, setNuevoLocal] = useState({ nombre: '', ciudad: '', tipo: 'restaurante', aforo: '' })
  const [nuevoContacto, setNuevoContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '', es_decisor: false, canal_preferido: 'whatsapp', local_id: '' })
  const [showFormLocal, setShowFormLocal] = useState(false)
  const [showFormContacto, setShowFormContacto] = useState(false)
  const [buscandoLocales, setBuscandoLocales] = useState(false)
  const [resultadoBusqueda, setResultadoBusqueda] = useState<{ insertados: number; pendientes_manual: { nombre: string; ciudad: string | null; fuente: string }[] } | null>(null)

  const [textoAgente, setTextoAgente] = useState('')
  const [contactoAgente, setContactoAgente] = useState('')
  const [canalAgente, setCanalAgente] = useState('whatsapp')
  const [loadingAgente, setLoadingAgente] = useState(false)
  const [previewAgente, setPreviewAgente] = useState<Record<string, unknown> | null>(null)

  const fetchLocales = useCallback(async () => {
    const r = await fetch(`/api/super/leads/${lead.id}/locales`, { headers: sh() })
    if (r.ok) setLocales((await r.json()).locales ?? [])
  }, [lead.id, sh])

  const fetchContactos = useCallback(async () => {
    const r = await fetch(`/api/super/leads/${lead.id}/contactos`, { headers: sh() })
    if (r.ok) setContactos((await r.json()).contactos ?? [])
  }, [lead.id, sh])

  const fetchComunicaciones = useCallback(async () => {
    const r = await fetch(`/api/super/leads/${lead.id}/comunicaciones`, { headers: sh() })
    if (r.ok) setComunicaciones((await r.json()).comunicaciones ?? [])
  }, [lead.id, sh])

  const fetchBriefing = useCallback(async () => {
    setLoadingBriefing(true)
    try {
      const r = await fetch(`/api/super/leads/${lead.id}/briefing`, { headers: sh() })
      if (r.ok) setBriefing((await r.json()).briefing)
    } finally {
      setLoadingBriefing(false)
    }
  }, [lead.id, sh])

  useEffect(() => {
    fetchLocales()
    fetchContactos()
    fetchComunicaciones()
  }, [fetchLocales, fetchContactos, fetchComunicaciones])

  useEffect(() => {
    if (tab === 'info' && !briefing) fetchBriefing()
  }, [tab, briefing, fetchBriefing])

  const handleAddLocal = async () => {
    if (!nuevoLocal.nombre.trim()) return
    const r = await fetch(`/api/super/leads/${lead.id}/locales`, {
      method: 'POST', headers: sh(),
      body: JSON.stringify({ ...nuevoLocal, aforo: nuevoLocal.aforo ? parseInt(nuevoLocal.aforo) : null })
    })
    if (r.ok) { await fetchLocales(); setNuevoLocal({ nombre: '', ciudad: '', tipo: 'restaurante', aforo: '' }); setShowFormLocal(false) }
  }

  const handleBuscarLocales = async () => {
    setBuscandoLocales(true)
    setResultadoBusqueda(null)
    try {
      const r = await fetch(`/api/super/leads/${lead.id}/locales/buscar`, { method: 'POST', headers: sh() })
      const d = await r.json()
      if (r.ok) {
        await fetchLocales()
        setResultadoBusqueda({ insertados: d.insertados ?? 0, pendientes_manual: d.pendientes_manual ?? [] })
      }
    } finally {
      setBuscandoLocales(false)
    }
  }

  const handleDeleteLocal = async (localId: string) => {
    if (!confirm('¿Eliminar este local?')) return
    await fetch(`/api/super/leads/${lead.id}/locales`, { method: 'DELETE', headers: sh(), body: JSON.stringify({ localId }) })
    await fetchLocales()
  }

  const handleAddContacto = async () => {
    if (!nuevoContacto.nombre.trim()) return
    const r = await fetch(`/api/super/leads/${lead.id}/contactos`, {
      method: 'POST', headers: sh(),
      body: JSON.stringify({ ...nuevoContacto, local_id: nuevoContacto.local_id || null })
    })
    if (r.ok) {
      await fetchContactos()
      setNuevoContacto({ nombre: '', cargo: '', email: '', telefono: '', es_decisor: false, canal_preferido: 'whatsapp', local_id: '' })
      setShowFormContacto(false)
    }
  }

  const handleToggleDecisor = async (c: Contacto) => {
    await fetch(`/api/super/leads/${lead.id}/contactos`, {
      method: 'PATCH', headers: sh(),
      body: JSON.stringify({ contactoId: c.id, es_decisor: !c.es_decisor })
    })
    await fetchContactos()
  }

  const handleDeleteContacto = async (contactoId: string) => {
    if (!confirm('¿Eliminar este contacto?')) return
    await fetch(`/api/super/leads/${lead.id}/contactos`, { method: 'DELETE', headers: sh(), body: JSON.stringify({ contactoId }) })
    await fetchContactos()
  }

  const handleAnalizarAgente = async () => {
    if (!textoAgente.trim()) return
    setLoadingAgente(true)
    try {
      const r = await fetch('/api/super/leads/agente', {
        method: 'POST', headers: sh(),
        body: JSON.stringify({ lead_id: lead.id, texto: textoAgente, canal: canalAgente, contacto_id: contactoAgente || null })
      })
      if (r.ok) setPreviewAgente(await r.json())
    } finally {
      setLoadingAgente(false)
    }
  }

  const handleGuardarAgente = async () => {
    if (!previewAgente) return
    const analysis = previewAgente.analysis ?? previewAgente
    await fetch('/api/super/leads/agente', {
      method: 'PUT', headers: sh(),
      body: JSON.stringify({ lead_id: lead.id, texto: textoAgente, canal: canalAgente, contacto_id: contactoAgente || null, analysis })
    })
    setTextoAgente(''); setPreviewAgente(null); setBriefing(null)
    await fetchComunicaciones()
    onUpdate({ ultima_actividad_at: new Date().toISOString() })
    setTab('historial')
  }

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)} style={{
      padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontFamily: SN, fontSize: 11, fontWeight: 600,
      background: tab === t ? C.red : 'transparent',
      color: tab === t ? C.paper : C.ink3,
    }}>{label}</button>
  )

  // inputs: fondo bone (más claro), texto ink (oscuro legible sobre fondo claro)
  const inp = { background: C.bone, border: `1px solid ${C.ruleS}`, borderRadius: 6, padding: '7px 10px', color: C.ink, fontSize: 13, fontFamily: SN, outline: 'none' }
  const sel = { ...inp, cursor: 'pointer' }
  const diasSinActividad = lead.ultima_actividad_at
    ? Math.floor((Date.now() - new Date(lead.ultima_actividad_at).getTime()) / 86400000)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, fontFamily: SN }}>
      {/* Header empresa */}
      <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: '.08em', marginBottom: 4 }}>EMPRESA</div>
            <h2 style={{ fontFamily: SE, fontSize: 20, color: C.ink, margin: '0 0 2px', fontWeight: 400 }}>
              {lead.restaurante || lead.nombre}
            </h2>
            {lead.tpv && <div style={{ fontSize: 12, color: C.ink3 }}>TPV: {lead.tpv}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
            {lead.landing_slug && (
              <a href={`https://www.iarest.es/propuesta/${lead.landing_slug}`} target="_blank"
                style={{ fontSize: 10, color: C.red, textDecoration: 'none', padding: '4px 8px', border: `1px solid ${C.red}`, borderRadius: 5 }}>
                Propuesta ↗
              </a>
            )}
            <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: C.ink4, cursor: 'pointer', fontSize: 14 }}>🗑</button>
          </div>
        </div>

        {/* Estado pills */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_COLOR[lead.estado], background: ESTADO_COLOR[lead.estado] + '33', borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase' }}>
            {lead.estado}
          </span>
          {lead.puntuacion != null && (
            <span style={{ fontSize: 10, color: scoreColor(lead.puntuacion), background: C.paper3, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
              ★ {lead.puntuacion}
            </span>
          )}
          {diasSinActividad != null && diasSinActividad > 7 && (
            <span style={{ fontSize: 10, color: C.amberD, background: C.amberS, borderRadius: 4, padding: '2px 7px' }}>
              ⏱ {diasSinActividad}d sin actividad
            </span>
          )}
          {lead.siguiente_contacto_texto && (
            <span style={{ fontSize: 10, color: C.ink3, background: C.paper3, borderRadius: 4, padding: '2px 7px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📅 {lead.siguiente_contacto_texto}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '6px 12px', borderBottom: `1px solid ${C.rule}`, flexWrap: 'wrap' }}>
        {tabBtn('info', '🏢 Info')}
        {tabBtn('locales', locales.length ? `📍 Locales (${locales.length})` : '📍 Locales')}
        {tabBtn('contactos', contactos.length ? `👥 Contactos (${contactos.length})` : '👥 Contactos')}
        {tabBtn('historial', comunicaciones.length ? `💬 Historial (${comunicaciones.length})` : '💬 Historial')}
        {tabBtn('agente', '🤖 Agente')}
      </div>

      {/* Contenido */}
      <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: 14, maxHeight: '70vh' }}>

        {/* ── INFO ── */}
        {tab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: C.paper3, borderRadius: 8, padding: 12, border: `1px solid ${C.rule}` }}>
              <div style={{ fontSize: 10, color: C.ink3, marginBottom: 6, fontWeight: 600, letterSpacing: '.06em' }}>✨ RESUMEN DE LA RELACIÓN</div>
              {loadingBriefing ? (
                <div style={{ color: C.ink3, fontSize: 12 }}>Analizando historial...</div>
              ) : briefing ? (
                <div style={{ color: C.ink2, fontSize: 12, lineHeight: 1.6 }}>{briefing}</div>
              ) : (
                <button onClick={fetchBriefing} style={{ color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  Generar resumen →
                </button>
              )}
            </div>

            {lead.siguiente_contacto_texto && (
              <div style={{ background: '#1A1400', borderRadius: 8, padding: 12, border: `1px solid ${C.amber}44` }}>
                <div style={{ fontSize: 10, color: C.amber, marginBottom: 4, fontWeight: 600 }}>📅 PRÓXIMA ACCIÓN</div>
                <div style={{ color: C.paper, fontSize: 13 }}>{lead.siguiente_contacto_texto}</div>
                {lead.siguiente_contacto_at && (
                  <div style={{ color: C.amberS, fontSize: 11, marginTop: 3 }}>
                    {new Date(lead.siguiente_contacto_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                )}
              </div>
            )}

            {contactos.filter(c => c.es_decisor).length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: C.ink3, marginBottom: 8, fontWeight: 600, letterSpacing: '.06em' }}>⭐ DECISORES</div>
                {contactos.filter(c => c.es_decisor).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.paper3, borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.red + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                      {c.nombre.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{c.nombre}</div>
                      <div style={{ color: C.ink3, fontSize: 11 }}>{c.cargo ?? '—'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      {c.telefono && <a href={`https://wa.me/${c.telefono.replace(/\D/g, '')}`} target="_blank" style={{ fontSize: 18, textDecoration: 'none' }}>💬</a>}
                      {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 18, textDecoration: 'none' }}>📧</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {lead.notas && (
              <div style={{ color: C.ink2, fontSize: 12, fontStyle: 'italic', padding: '10px 12px', background: C.paper3, borderRadius: 8 }}>
                {lead.notas}
              </div>
            )}
          </div>
        )}

        {/* ── LOCALES ── */}
        {tab === 'locales' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: C.ink3, fontSize: 11 }}>Establecimientos del grupo</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleBuscarLocales}
                  disabled={buscandoLocales}
                  style={{ fontSize: 11, color: C.paper, background: buscandoLocales ? C.ink4 : '#3B8BE8', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: buscandoLocales ? 'default' : 'pointer', opacity: buscandoLocales ? 0.7 : 1 }}>
                  {buscandoLocales ? '🔍 Buscando…' : '🔍 Buscar con IA'}
                </button>
                <button onClick={() => setShowFormLocal(!showFormLocal)}
                  style={{ fontSize: 11, color: C.paper, background: C.red, border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                  + Añadir
                </button>
              </div>
            </div>

            {/* Resultado búsqueda IA */}
            {resultadoBusqueda && (
              <div style={{ background: resultadoBusqueda.insertados > 0 ? '#1A2E1A' : '#2E1A1A', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                {resultadoBusqueda.insertados > 0
                  ? <div style={{ color: C.green }}>✅ {resultadoBusqueda.insertados} locales añadidos automáticamente</div>
                  : <div style={{ color: C.amber }}>ℹ️ No se encontraron locales nuevos en internet</div>}
                {resultadoBusqueda.pendientes_manual.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: C.amber, marginBottom: 4 }}>⚠️ Estos no se pudieron verificar — añádelos manualmente:</div>
                    {resultadoBusqueda.pendientes_manual.map((p, i) => (
                      <div key={i} style={{ color: C.ink2, fontSize: 11, padding: '2px 0' }}>
                        · <b>{p.nombre}</b>{p.ciudad ? ` (${p.ciudad})` : ''} — {p.fuente || 'sin fuente'}
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setResultadoBusqueda(null)} style={{ background: 'transparent', border: 'none', color: C.ink4, cursor: 'pointer', fontSize: 11, marginTop: 6 }}>✕ cerrar</button>
              </div>
            )}

            {showFormLocal && (
              <div style={{ background: C.paper3, borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <input placeholder="Nombre del local *" value={nuevoLocal.nombre} onChange={e => setNuevoLocal(p => ({ ...p, nombre: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' as const }} />
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  <input placeholder="Ciudad" value={nuevoLocal.ciudad} onChange={e => setNuevoLocal(p => ({ ...p, ciudad: e.target.value }))} style={{ ...inp, flex: 1 }} />
                  <input placeholder="Aforo" type="number" value={nuevoLocal.aforo} onChange={e => setNuevoLocal(p => ({ ...p, aforo: e.target.value }))} style={{ ...inp, width: 70 }} />
                </div>
                <select value={nuevoLocal.tipo} onChange={e => setNuevoLocal(p => ({ ...p, tipo: e.target.value }))} style={{ ...sel }}>
                  <option value="restaurante">Restaurante</option>
                  <option value="hacienda">Hacienda</option>
                  <option value="bar">Bar</option>
                  <option value="cafeteria">Cafetería</option>
                  <option value="catering">Catering</option>
                  <option value="otro">Otro</option>
                </select>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  <button onClick={handleAddLocal} style={{ flex: 1, background: C.red, color: C.paper, border: 'none', borderRadius: 6, padding: '7px 0', cursor: 'pointer', fontSize: 13 }}>Guardar</button>
                  <button onClick={() => setShowFormLocal(false)} style={{ background: C.paper2, color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {locales.length === 0 && <div style={{ color: C.ink3, fontSize: 12, textAlign: 'center', padding: 20 }}>Sin locales añadidos</div>}
              {locales.filter(l => !l.notas?.startsWith('auto:sin_resultado')).map(l => (
                <div key={l.id} style={{ background: C.paper3, borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{l.nombre}</div>
                    <div style={{ color: C.ink3, fontSize: 11, marginTop: 2 }}>{[l.tipo, l.ciudad, l.aforo ? `${l.aforo} pax` : null].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button onClick={() => handleDeleteLocal(l.id)} style={{ background: 'transparent', border: 'none', color: C.ink4, cursor: 'pointer', fontSize: 14 }}>🗑</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CONTACTOS ── */}
        {tab === 'contactos' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: C.ink3, fontSize: 11 }}>Personas del grupo</span>
              <button onClick={() => setShowFormContacto(!showFormContacto)}
                style={{ fontSize: 11, color: C.paper, background: C.red, border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                + Añadir
              </button>
            </div>

            {showFormContacto && (
              <div style={{ background: C.paper3, borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  <input placeholder="Nombre *" value={nuevoContacto.nombre} onChange={e => setNuevoContacto(p => ({ ...p, nombre: e.target.value }))} style={{ ...inp, flex: 1 }} />
                  <input placeholder="Cargo" value={nuevoContacto.cargo} onChange={e => setNuevoContacto(p => ({ ...p, cargo: e.target.value }))} style={{ ...inp, flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  <input placeholder="Email" value={nuevoContacto.email} onChange={e => setNuevoContacto(p => ({ ...p, email: e.target.value }))} style={{ ...inp, flex: 1 }} />
                  <input placeholder="Teléfono" value={nuevoContacto.telefono} onChange={e => setNuevoContacto(p => ({ ...p, telefono: e.target.value }))} style={{ ...inp, flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  <select value={nuevoContacto.canal_preferido} onChange={e => setNuevoContacto(p => ({ ...p, canal_preferido: e.target.value }))} style={{ ...sel, flex: 1 }}>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="email">📧 Email</option>
                    <option value="llamada">📞 Llamada</option>
                  </select>
                  {locales.length > 0 && (
                    <select value={nuevoContacto.local_id} onChange={e => setNuevoContacto(p => ({ ...p, local_id: e.target.value }))} style={{ ...sel, flex: 1 }}>
                      <option value="">Sin local específico</option>
                      {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={nuevoContacto.es_decisor} onChange={e => setNuevoContacto(p => ({ ...p, es_decisor: e.target.checked }))} />
                  <span style={{ color: C.ink, fontSize: 13 }}>Es el decisor de compra</span>
                </label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  <button onClick={handleAddContacto} style={{ flex: 1, background: C.red, color: C.paper, border: 'none', borderRadius: 6, padding: '7px 0', cursor: 'pointer', fontSize: 13 }}>Guardar</button>
                  <button onClick={() => setShowFormContacto(false)} style={{ background: C.paper2, color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {contactos.length === 0 && <div style={{ color: C.ink3, fontSize: 12, textAlign: 'center', padding: 20 }}>Sin contactos añadidos</div>}
              {contactos.map(c => (
                <div key={c.id} style={{ background: C.paper3, borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: c.es_decisor ? C.red + '22' : C.paper2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.es_decisor ? C.red : C.ink3, fontSize: 14, fontWeight: 700 }}>
                    {c.nombre.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{c.nombre}</span>
                      {c.es_decisor && <span style={{ fontSize: 9, color: C.red, background: C.red + '22', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>DECISOR</span>}
                    </div>
                    <div style={{ color: C.ink3, fontSize: 11, marginTop: 1 }}>{[c.cargo, c.local?.nombre].filter(Boolean).join(' · ')}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                      <span style={{ fontSize: 9, color: C.ink3, background: C.paper2, borderRadius: 3, padding: '1px 4px' }}>{CANAL_ICONS[c.canal_preferido]} {c.canal_preferido}</span>
                      <span style={{ fontSize: 10, color: scoreColor(c.score), background: C.paper2, borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>score {c.score}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    {c.telefono && <a href={`https://wa.me/${c.telefono.replace(/\D/g, '')}`} target="_blank" style={{ fontSize: 16, textDecoration: 'none' }}>💬</a>}
                    {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 16, textDecoration: 'none' }}>📧</a>}
                    <button onClick={() => handleToggleDecisor(c)} style={{ fontSize: 9, color: c.es_decisor ? C.amber : C.ink4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {c.es_decisor ? '★' : '☆'}
                    </button>
                    <button onClick={() => handleDeleteContacto(c.id)} style={{ background: 'transparent', border: 'none', color: C.ink4, cursor: 'pointer', fontSize: 12, padding: 0 }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── HISTORIAL ── */}
        {tab === 'historial' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comunicaciones.length === 0 && <div style={{ color: C.ink3, fontSize: 12, textAlign: 'center', padding: 20 }}>Sin comunicaciones registradas</div>}
            {comunicaciones.map(com => (
              <div key={com.id} style={{ background: C.paper3, borderRadius: 8, padding: '9px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, color: C.ink3, background: C.paper2, borderRadius: 3, padding: '2px 5px' }}>{CANAL_ICONS[com.canal] ?? '💬'} {com.canal}</span>
                    {com.contacto && <span style={{ fontSize: 9, color: C.amberD, background: C.amber + '22', borderRadius: 3, padding: '2px 5px' }}>👤 {com.contacto.nombre}</span>}
                  </div>
                  <span style={{ fontSize: 10, color: C.ink3, flexShrink: 0 }}>{new Date(com.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div style={{ color: C.ink2, fontSize: 12, lineHeight: 1.5 }}>
                  {com.resumen_ia ?? com.texto_reunion?.slice(0, 200)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── AGENTE ── */}
        {tab === 'agente' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <select value={canalAgente} onChange={e => setCanalAgente(e.target.value)} style={{ ...sel, flex: 1 }}>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="email">📧 Email</option>
                <option value="llamada">📞 Llamada</option>
                <option value="reunion">🤝 Reunión</option>
                <option value="instagram">📸 Instagram</option>
                <option value="nota_interna">📝 Nota interna</option>
              </select>
              <select value={contactoAgente} onChange={e => setContactoAgente(e.target.value)} style={{ ...sel, flex: 1 }}>
                <option value="">Sin contacto específico</option>
                {contactos.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.es_decisor ? ' ★' : ''}{c.cargo ? ` (${c.cargo})` : ''}</option>
                ))}
              </select>
            </div>

            <textarea
              placeholder="Pega aquí la conversación de WhatsApp, resumen de llamada, notas de reunión..."
              value={textoAgente}
              onChange={e => setTextoAgente(e.target.value)}
              rows={6}
              style={{ background: C.bone, border: `1px solid ${C.ruleS}`, borderRadius: 8, padding: '10px 12px', color: C.ink, fontSize: 13, fontFamily: SN, resize: 'vertical', lineHeight: 1.5, outline: 'none' }}
            />

            {!previewAgente ? (
              <button onClick={handleAnalizarAgente} disabled={loadingAgente || !textoAgente.trim()}
                style={{ background: C.red, color: C.paper, border: 'none', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13, fontFamily: SN, fontWeight: 600, opacity: loadingAgente ? 0.6 : 1 }}>
                {loadingAgente ? '✨ Analizando...' : '✨ Analizar con IA'}
              </button>
            ) : (
              <div style={{ background: C.paper3, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, color: C.ink3, fontWeight: 600 }}>PREVIEW — ¿Guardar este análisis?</div>
                {Boolean((previewAgente.analysis as Record<string, unknown>)?.resumen) && (
                  <div>
                    <div style={{ fontSize: 10, color: C.ink3, marginBottom: 3 }}>Resumen</div>
                    <div style={{ color: C.ink2, fontSize: 12 }}>{String((previewAgente.analysis as Record<string, unknown>).resumen ?? '')}</div>
                  </div>
                )}
                {Boolean((previewAgente.analysis as Record<string, unknown>)?.siguiente_accion) && (
                  <div>
                    <div style={{ fontSize: 10, color: C.amber, marginBottom: 3 }}>Próxima acción</div>
                    <div style={{ color: C.ink2, fontSize: 12 }}>{String((previewAgente.analysis as Record<string, unknown>).siguiente_accion ?? '')}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  <button onClick={handleGuardarAgente}
                    style={{ flex: 1, background: C.green, color: C.paper, border: 'none', borderRadius: 6, padding: '8px 0', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    ✅ Guardar
                  </button>
                  <button onClick={() => setPreviewAgente(null)}
                    style={{ background: C.paper2, color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
