'use client'

import { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type Proveedor = {
  id: string; nombre: string; categoria: string; web?: string
  telefono?: string; email_general?: string; estado: string
  estado_integracion: string; notas?: string; util_blog_notas?: boolean
  proveedores_tech_contactos?: Contacto[]
}
type Contacto = {
  id: string; proveedor_id: string; nombre: string; cargo?: string
  email?: string; telefono?: string; notas?: string
}
type Comunicacion = {
  id: string; proveedor_id: string; tipo: string; fecha: string
  asunto?: string; resumen?: string; cuerpo?: string; origen: string
  gmail_thread_id?: string; util_blog?: boolean
  adjuntos?: { nombre: string; tipo: string }[]
}

const CAT_LABELS: Record<string, string> = {
  hardware: '🖨️ Hardware', ia: '🤖 IA', pagos: '💳 Pagos',
  delivery: '🛵 Delivery', infra: '☁️ Infra',
  telecomunicaciones: '📧 Teleco', otro: '📦 Otro',
}
const ESTADO_INT: Record<string, { label: string; color: string }> = {
  integrado:   { label: 'Integrado',   color: '#3F7D44' },
  en_progreso: { label: 'En progreso', color: '#E8A33B' },
  pendiente:   { label: 'Pendiente',   color: '#6B5F52' },
  bloqueado:   { label: 'Bloqueado',   color: '#D9442B' },
  descartado:  { label: 'Descartado',  color: '#6B5F52' },
}
const TIPO_ICON: Record<string, string> = {
  email: '📧', llamada: '📞', reunion: '🤝', nota: '📝',
}

export default function ProveedoresTechTab() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<{
    proveedor: Proveedor | null; contactos: Contacto[]; comms: Comunicacion[]
  }>({ proveedor: null, contactos: [], comms: [] })
  const [tab, setTab] = useState<'directorio' | 'comunicaciones'>('directorio')
  const [loading, setLoading] = useState(false)
  const [resumenIA, setResumenIA] = useState<string | null>(null)
  const [loadingIA, setLoadingIA] = useState(false)
  const [showNuevaCom, setShowNuevaCom] = useState(false)
  const [nuevaCom, setNuevaCom] = useState({
    tipo: 'nota', asunto: '', resumen: '', cuerpo: '',
    fecha: new Date().toISOString().slice(0, 16),
  })
  const [showNuevoContacto, setShowNuevoContacto] = useState(false)
  const [nuevoC, setNuevoC] = useState({ nombre: '', cargo: '', email: '', telefono: '', notas: '' })
  const [editandoNotas, setEditandoNotas] = useState(false)
  const [notasEdit, setNotasEdit] = useState('')

  const api = (body: object) => fetch('/api/super/proveedores-tech', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const cargarLista = useCallback(async () => {
    const res = await fetch('/api/super/proveedores-tech')
    setProveedores(await res.json())
  }, [])

  const cargarDetalle = useCallback(async (id: string) => {
    setLoading(true); setResumenIA(null)
    const res = await fetch(`/api/super/proveedores-tech?id=${id}`)
    const data = await res.json()
    setDetalle(data)
    setNotasEdit(data.proveedor?.notas ?? '')
    setLoading(false)
  }, [])

  useEffect(() => { cargarLista() }, [cargarLista])
  useEffect(() => { if (selected) cargarDetalle(selected) }, [selected, cargarDetalle])

  const porCategoria: Record<string, Proveedor[]> = {}
  for (const p of proveedores) {
    const cat = p.categoria ?? 'otro'
    if (!porCategoria[cat]) porCategoria[cat] = []
    porCategoria[cat].push(p)
  }

  const prov = detalle.proveedor
  const intBadge = prov ? ESTADO_INT[prov.estado_integracion] ?? ESTADO_INT.pendiente : null
  const blogCount = detalle.comms.filter(c => c.util_blog).length + (prov?.util_blog_notas ? 1 : 0)

  const guardarNota = async () => {
    if (!prov) return
    await api({ accion: 'upsert_proveedor', id: prov.id, notas: notasEdit })
    setEditandoNotas(false)
    cargarDetalle(prov.id); cargarLista()
  }

  const toggleBlogNotas = async () => {
    if (!prov) return
    await api({ accion: 'toggle_blog_notas', id: prov.id, util_blog_notas: !prov.util_blog_notas })
    cargarDetalle(prov.id)
  }

  const guardarContacto = async () => {
    if (!prov || !nuevoC.nombre.trim()) return
    await api({ accion: 'upsert_contacto', proveedor_id: prov.id, ...nuevoC })
    setNuevoC({ nombre: '', cargo: '', email: '', telefono: '', notas: '' })
    setShowNuevoContacto(false)
    cargarDetalle(prov.id)
  }

  const guardarCom = async () => {
    if (!prov) return
    await api({
      accion: 'add_comunicacion', proveedor_id: prov.id, ...nuevaCom,
      fecha: new Date(nuevaCom.fecha).toISOString(), origen: 'manual',
    })
    setNuevaCom({ tipo: 'nota', asunto: '', resumen: '', cuerpo: '', fecha: new Date().toISOString().slice(0, 16) })
    setShowNuevaCom(false)
    cargarDetalle(prov.id)
  }

  const toggleBlogCom = async (com: Comunicacion) => {
    await api({ accion: 'toggle_blog_com', id: com.id, util_blog: !com.util_blog })
    cargarDetalle(prov!.id)
  }

  const eliminarCom = async (id: string) => {
    if (!confirm('¿Eliminar esta comunicación?')) return
    await api({ accion: 'delete_comunicacion', id })
    if (selected) cargarDetalle(selected)
  }

  const generarResumenIA = async () => {
    if (!prov) return
    setLoadingIA(true)
    const res = await api({ accion: 'resumen_ia', proveedor_id: prov.id })
    const data = await res.json()
    setResumenIA(data.resumen)
    setLoadingIA(false)
  }

  // ─── Estilos inline ───────────────────────────────────────────────────────
  const s = {
    row: { display: 'flex', gap: 0, minHeight: 600 } as React.CSSProperties,
    sidebar: { width: 260, flexShrink: 0, borderRight: `1px solid ${C.rule}`, overflowY: 'auto' as const, maxHeight: '78vh' },
    catHeader: { padding: '5px 12px', fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', background: C.bg2, borderBottom: `1px solid ${C.rule}` },
    provRow: (sel: boolean): React.CSSProperties => ({ padding: '9px 13px', cursor: 'pointer', background: sel ? C.bg3 : 'transparent', borderBottom: `1px solid ${C.rule}`, borderLeft: sel ? `3px solid ${C.red}` : '3px solid transparent' }),
    badge: (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, color: '#fff', background: color }),
    blogPill: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#E8A33B22', color: '#E8A33B' } as React.CSSProperties,
    detail: { flex: 1, padding: '0 22px', overflowY: 'auto' as const, maxHeight: '78vh' },
    tabs: { display: 'flex', borderBottom: `1px solid ${C.rule}`, marginBottom: 18, marginTop: 8 },
    tab: (sel: boolean): React.CSSProperties => ({ padding: '8px 18px', fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? C.red : C.ink3, cursor: 'pointer', borderBottom: sel ? `2px solid ${C.red}` : '2px solid transparent', background: 'transparent', border: 'none', outline: 'none' }),
    section: { marginBottom: 22 } as React.CSSProperties,
    sectionTitle: { fontFamily: SE, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 9 } as React.CSSProperties,
    field: { display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start', fontSize: 13 } as React.CSSProperties,
    lbl: { color: C.ink3, width: 110, flexShrink: 0, fontWeight: 500 } as React.CSSProperties,
    card: { background: C.bg3, borderRadius: 8, padding: '10px 13px', marginBottom: 8, borderLeft: `3px solid ${C.bg3}` } as React.CSSProperties,
    cardRed: { background: C.bg3, borderRadius: 8, padding: '10px 13px', marginBottom: 8, borderLeft: `3px solid ${C.red}` } as React.CSSProperties,
    cardAmber: { background: C.bg3, borderRadius: 8, padding: '10px 13px', marginBottom: 8, borderLeft: '3px solid #E8A33B' } as React.CSSProperties,
    btn: (v: 'primary' | 'ghost' | 'blog'): React.CSSProperties => ({ padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: v === 'primary' ? C.red : v === 'blog' ? '#E8A33B22' : C.bg3, color: v === 'primary' ? '#fff' : v === 'blog' ? '#E8A33B' : C.ink2 }),
    input: { width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13, border: `1px solid ${C.rule}`, background: C.bg2, color: C.ink, marginBottom: 7, boxSizing: 'border-box' as const },
    textarea: { width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13, border: `1px solid ${C.rule}`, background: C.bg2, color: C.ink, marginBottom: 7, boxSizing: 'border-box' as const, minHeight: 72, resize: 'vertical' as const },
    origenBadge: (o: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: o === 'gmail' ? '#1a73e8' : C.bg2, color: o === 'gmail' ? '#fff' : C.ink3 }),
    iaBox: { background: C.bg3, borderRadius: 8, padding: 14, borderLeft: '3px solid #E8A33B', fontSize: 13, color: C.ink2, lineHeight: 1.6, marginBottom: 16 } as React.CSSProperties,
  }

  return (
    <div style={{ fontFamily: SN, color: C.ink }}>
      <div style={s.row}>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <div style={s.sidebar}>
          {Object.entries(porCategoria).map(([cat, items]) => (
            <div key={cat}>
              <div style={s.catHeader}>{CAT_LABELS[cat] ?? cat}</div>
              {items.map(p => {
                const b = ESTADO_INT[p.estado_integracion] ?? ESTADO_INT.pendiente
                return (
                  <div key={p.id} style={s.provRow(selected === p.id)}
                    onClick={() => { setSelected(p.id); setTab('directorio') }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{p.nombre}</div>
                    <span style={s.badge(b.color)}>{b.label}</span>
                    {(p.proveedores_tech_contactos?.length ?? 0) > 0 &&
                      <span style={{ fontSize: 10, color: C.ink3, marginLeft: 6 }}>
                        {p.proveedores_tech_contactos!.length}c
                      </span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Detalle ─────────────────────────────────────────────────── */}
        <div style={s.detail}>

          {!selected && (
            <div style={{ color: C.ink3, fontSize: 14, paddingTop: 40, textAlign: 'center' }}>
              ← Selecciona un proveedor
            </div>
          )}

          {selected && prov && !loading && (
            <>
              {/* Header proveedor */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 14, marginBottom: 2 }}>
                <div>
                  <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, color: C.ink }}>{prov.nombre}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 12, color: C.ink3 }}>{CAT_LABELS[prov.categoria]}</span>
                    {intBadge && <span style={s.badge(intBadge.color)}>{intBadge.label}</span>}
                    {blogCount > 0 && <span style={s.blogPill}>💡 {blogCount} para blog</span>}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={s.tabs}>
                <button style={s.tab(tab === 'directorio')} onClick={() => setTab('directorio')}>📋 Directorio</button>
                <button style={s.tab(tab === 'comunicaciones')} onClick={() => setTab('comunicaciones')}>
                  💬 Comunicaciones {detalle.comms.length > 0 && `(${detalle.comms.length})`}
                </button>
              </div>

              {/* ─── TAB DIRECTORIO ─────────────────────────────────────── */}
              {tab === 'directorio' && (
                <>
                  <div style={s.section}>
                    <div style={s.sectionTitle}>Datos</div>
                    <div style={s.card}>
                      {prov.web && <div style={s.field}><span style={s.lbl}>Web</span>
                        <a href={`https://${prov.web}`} target="_blank" rel="noreferrer" style={{ color: C.red, fontSize: 13 }}>{prov.web}</a></div>}
                      {prov.email_general && <div style={s.field}><span style={s.lbl}>Email</span><span style={{ fontSize: 13 }}>{prov.email_general}</span></div>}
                      {prov.telefono && <div style={s.field}><span style={s.lbl}>Teléfono</span><span style={{ fontSize: 13 }}>{prov.telefono}</span></div>}
                      <div style={s.field}><span style={s.lbl}>Estado</span><span style={{ fontSize: 13 }}>{prov.estado}</span></div>
                      <div style={s.field}><span style={s.lbl}>Integración</span><span style={{ fontSize: 13 }}>{intBadge?.label}</span></div>
                    </div>
                  </div>

                  <div style={s.section}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={s.sectionTitle}>Notas</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={s.btn(prov.util_blog_notas ? 'blog' : 'ghost')} onClick={toggleBlogNotas}>
                          💡 {prov.util_blog_notas ? 'En blog' : 'Para blog'}
                        </button>
                        <button style={s.btn('ghost')} onClick={() => setEditandoNotas(v => !v)}>
                          {editandoNotas ? 'Cancelar' : '✏️ Editar'}
                        </button>
                      </div>
                    </div>
                    {editandoNotas ? (
                      <>
                        <textarea style={s.textarea} value={notasEdit} rows={5} onChange={e => setNotasEdit(e.target.value)} />
                        <button style={s.btn('primary')} onClick={guardarNota}>Guardar</button>
                      </>
                    ) : (
                      <div style={{ ...(prov.util_blog_notas ? s.cardAmber : s.card), whiteSpace: 'pre-wrap', fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
                        {prov.notas || <span style={{ color: C.ink4 }}>Sin notas</span>}
                      </div>
                    )}
                  </div>

                  <div style={s.section}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={s.sectionTitle}>Contactos</div>
                      <button style={s.btn('ghost')} onClick={() => setShowNuevoContacto(v => !v)}>
                        {showNuevoContacto ? 'Cancelar' : '+ Añadir'}
                      </button>
                    </div>
                    {showNuevoContacto && (
                      <div style={{ ...s.card, marginBottom: 12 }}>
                        <input style={s.input} placeholder="Nombre *" value={nuevoC.nombre} onChange={e => setNuevoC(v => ({ ...v, nombre: e.target.value }))} />
                        <input style={s.input} placeholder="Cargo" value={nuevoC.cargo} onChange={e => setNuevoC(v => ({ ...v, cargo: e.target.value }))} />
                        <input style={s.input} placeholder="Email" value={nuevoC.email} onChange={e => setNuevoC(v => ({ ...v, email: e.target.value }))} />
                        <input style={s.input} placeholder="Teléfono" value={nuevoC.telefono} onChange={e => setNuevoC(v => ({ ...v, telefono: e.target.value }))} />
                        <textarea style={s.textarea} placeholder="Notas" rows={2} value={nuevoC.notas} onChange={e => setNuevoC(v => ({ ...v, notas: e.target.value }))} />
                        <button style={s.btn('primary')} onClick={guardarContacto}>Guardar contacto</button>
                      </div>
                    )}
                    {detalle.contactos.length === 0 && !showNuevoContacto &&
                      <div style={{ color: C.ink4, fontSize: 13 }}>Sin contactos registrados</div>}
                    {detalle.contactos.map(c => (
                      <div key={c.id} style={s.card}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nombre}</div>
                        {c.cargo && <div style={{ fontSize: 12, color: C.ink3 }}>{c.cargo}</div>}
                        <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' as const }}>
                          {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: C.red }}>📧 {c.email}</a>}
                          {c.telefono && <span style={{ fontSize: 12, color: C.ink2 }}>📞 {c.telefono}</span>}
                        </div>
                        {c.notas && <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>{c.notas}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ─── TAB COMUNICACIONES ─────────────────────────────────── */}
              {tab === 'comunicaciones' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const }}>
                    <button style={s.btn('primary')} onClick={() => setShowNuevaCom(v => !v)}>
                      {showNuevaCom ? 'Cancelar' : '+ Nueva'}
                    </button>
                    <button style={s.btn('ghost')} onClick={generarResumenIA} disabled={loadingIA}>
                      {loadingIA ? '⏳...' : '✨ Resumen IA'}
                    </button>
                    {blogCount > 0 &&
                      <span style={{ ...s.blogPill, padding: '5px 10px', fontSize: 11 }}>
                        💡 {blogCount} para blog
                      </span>}
                  </div>

                  {resumenIA && (
                    <div style={s.iaBox}>
                      <div style={{ fontWeight: 700, marginBottom: 6, color: '#E8A33B' }}>✨ Resumen IA</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{resumenIA}</div>
                    </div>
                  )}

                  {showNuevaCom && (
                    <div style={{ ...s.card, marginBottom: 14 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' as const }}>
                        {['email', 'llamada', 'reunion', 'nota'].map(t => (
                          <button key={t} style={{ ...s.btn(nuevaCom.tipo === t ? 'primary' : 'ghost'), fontSize: 11 }}
                            onClick={() => setNuevaCom(v => ({ ...v, tipo: t }))}>
                            {TIPO_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>
                      <input style={s.input} type="datetime-local" value={nuevaCom.fecha}
                        onChange={e => setNuevaCom(v => ({ ...v, fecha: e.target.value }))} />
                      <input style={s.input} placeholder="Asunto" value={nuevaCom.asunto}
                        onChange={e => setNuevaCom(v => ({ ...v, asunto: e.target.value }))} />
                      <textarea style={s.textarea} placeholder="Resumen (1-2 frases)" rows={2}
                        value={nuevaCom.resumen} onChange={e => setNuevaCom(v => ({ ...v, resumen: e.target.value }))} />
                      <textarea style={s.textarea} placeholder="Contenido completo (opcional)" rows={3}
                        value={nuevaCom.cuerpo} onChange={e => setNuevaCom(v => ({ ...v, cuerpo: e.target.value }))} />
                      <button style={s.btn('primary')} onClick={guardarCom}>Guardar</button>
                    </div>
                  )}

                  {detalle.comms.length === 0 &&
                    <div style={{ color: C.ink4, fontSize: 13 }}>Sin comunicaciones registradas</div>}

                  {detalle.comms.map(c => (
                    <div key={c.id} style={c.util_blog ? s.cardAmber : c.origen === 'gmail' ? s.cardRed : s.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: 14 }}>{TIPO_ICON[c.tipo] ?? '📄'}</span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{c.asunto || '(sin asunto)'}</span>
                          <span style={s.origenBadge(c.origen)}>{c.origen}</span>
                          {c.util_blog && <span style={s.blogPill}>💡 blog</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: C.ink4, whiteSpace: 'nowrap' as const }}>
                            {new Date(c.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </span>
                          <button title={c.util_blog ? 'Quitar del blog' : 'Marcar para blog'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: c.util_blog ? 1 : 0.35 }}
                            onClick={() => toggleBlogCom(c)}>💡</button>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.ink4 }}
                            onClick={() => eliminarCom(c.id)}>🗑️</button>
                        </div>
                      </div>
                      {c.resumen &&
                        <div style={{ fontSize: 13, color: C.ink2, marginTop: 5, lineHeight: 1.5 }}>{c.resumen}</div>}
                      {c.cuerpo && !c.resumen &&
                        <div style={{ fontSize: 12, color: C.ink3, marginTop: 5, lineHeight: 1.5, maxHeight: 72, overflow: 'hidden' }}>
                          {c.cuerpo.slice(0, 280)}{c.cuerpo.length > 280 ? '...' : ''}
                        </div>}
                      {c.adjuntos && c.adjuntos.length > 0 &&
                        <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
                          {c.adjuntos.map((a, i) => (
                            <span key={i} style={{ fontSize: 11, background: C.bg2, padding: '2px 6px', borderRadius: 4, color: C.ink3 }}>
                              📎 {a.nombre}
                            </span>
                          ))}
                        </div>}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {loading && <div style={{ color: C.ink3, padding: 40, textAlign: 'center' }}>Cargando...</div>}
        </div>
      </div>
    </div>
  )
}
