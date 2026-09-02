'use client'
import { useEffect, useState, useCallback } from 'react'

type Inmueble = {
  id: string; titulo: string; tipo: string; zona: string
  precio: number | null; metros: number | null
  tiene_piscina: boolean | null; es_rustica: boolean | null
  cerca_playa: boolean | null; es_subasta: boolean
  puntuacion_chollo: number; razon_chollo: string
  link: string | null; links_all: string[] | null; telefono: string | null
  email_from: string | null; email_subject: string | null
  email_message_id: string | null; email_body: string | null
  es_bajada_precio: boolean; precio_anterior: number | null
  estado: string; notas: string | null; is_new: boolean; created_at: string
}

const SCORE_COLOR = (s: number) => s >= 8 ? 'var(--positive)' : s >= 6 ? '#ca8a04' : s >= 4 ? 'var(--warning)' : 'var(--negative)'
const ESTADOS = ['pendiente', 'interesa', 'visitado', 'descartado']
const ESTADO_COLOR: Record<string, string> = { pendiente: 'var(--muted)', interesa: 'var(--info)', visitado: 'var(--positive)', descartado: 'var(--negative)' }
const TIPO_ICON: Record<string, string> = { chalet: '🏡', parcela: '🌿', finca: '🌾', casa: '🏠', piso: '🏢', apartamento: '🏖️' }
const PAGE_SIZE = 60

function fmtPrice(p: number | null) {
  if (!p) return '—'
  if (p >= 1000000) return (p / 1000000).toFixed(1) + 'M€'
  if (p >= 1000) return Math.round(p / 1000) + 'k€'
  return p + '€'
}

const PORTAL_SENDERS = ['idealista','fotocasa','kyero','habitaclia','pisos.com','milanuncios','boe.es','subasta']
function isPortalSender(from: string | null) {
  if (!from) return false
  return PORTAL_SENDERS.some(p => from.toLowerCase().includes(p))
}

function gmailUrl(id: string | null) { return id ? `https://mail.google.com/mail/u/0/#all/${id}` : null }
function googleUrl(item: Inmueble) {
  const q = `${item.titulo} ${item.zona}${item.precio ? ' ' + fmtPrice(item.precio) : ''}`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
function waUrl(tel: string) { return `https://wa.me/${tel.replace(/\D/g, '')}` }
function shortDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url.slice(0, 30) }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function Toast({ msg, type, onClose }: { msg: string; type: 'ok' | 'err' | 'info'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t) }, [onClose])
  const cl = type === 'ok' ? 'var(--positive)' : type === 'err' ? 'var(--negative)' : 'var(--info)'
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 50,
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      borderRadius: 12, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
      background: `${cl}10`, border: `1px solid ${cl}30`, color: cl, maxWidth: 380,
    }}>
      <span style={{ fontWeight: 700 }}>{type === 'ok' ? '✓' : type === 'err' ? '⚠' : 'ℹ'}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ opacity: .5, background: 'none', border: 'none', cursor: 'pointer', color: cl }}>✕</button>
    </div>
  )
}

function ConfirmBar({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
      borderRadius: 12, fontSize: 12, marginBottom: 12,
      background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', color: 'var(--negative)',
    }}>
      <span style={{ flex: 1 }}>⚠ ¿Eliminar esta propiedad? No se puede deshacer.</span>
      <button onClick={onYes} style={{ padding: '4px 12px', borderRadius: 8, fontWeight: 600, background: 'var(--negative)', color: '#fff', border: 'none', cursor: 'pointer' }}>Eliminar</button>
      <button onClick={onNo} style={{ padding: '4px 12px', borderRadius: 8, background: 'var(--border)', color: 'var(--muted)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
    </div>
  )
}

function PreviewModal({ item, onClose }: { item: Inmueble; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const gUrl  = gmailUrl(item.email_message_id)
  const links = item.links_all && item.links_all.length > 0 ? item.links_all : (item.link ? [item.link] : [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{
        marginLeft: 'auto', height: '100%', width: '100%', maxWidth: 500, overflowY: 'auto',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          position: 'sticky', top: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', zIndex: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span>{TIPO_ICON[item.tipo] || '🏗️'}</span>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titulo}</h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>📍 {item.zona} · {fmtPrice(item.precio)}{item.metros ? ` · ${item.metros}m²` : ''}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {item.tiene_piscina && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--info-bg)', color: 'var(--info)' }}>🏊</span>}
              {item.cerca_playa   && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#e0f2fe', color: '#0369a1' }}>🏖️</span>}
              {item.es_rustica    && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--positive-bg)', color: 'var(--positive)' }}>🌾</span>}
              {item.es_subasta    && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--warning-bg)', color: 'var(--warning)' }}>⚖️</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {item.telefono && (
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={`tel:${item.telefono}`} style={{
                flex: 1, fontSize: 12, padding: '8px 12px', borderRadius: 8, fontWeight: 500, textAlign: 'center',
                background: 'rgba(22,163,74,0.08)', color: 'var(--positive)', border: '1px solid rgba(22,163,74,0.2)', textDecoration: 'none',
              }}>📞 {item.telefono}</a>
              <a href={waUrl(item.telefono)} target="_blank" rel="noreferrer" style={{
                fontSize: 12, padding: '8px 12px', borderRadius: 8, fontWeight: 500,
                background: 'rgba(37,211,102,0.08)', color: '#25D166', border: '1px solid rgba(37,211,102,0.2)', textDecoration: 'none',
              }}>WhatsApp</a>
            </div>
          )}
          {item.email_from && !isPortalSender(item.email_from) && (
            <a href={`mailto:${item.email_from}`} style={{
              display: 'block', fontSize: 12, padding: '8px 12px', borderRadius: 8, textAlign: 'center',
              background: 'rgba(37,99,235,0.06)', color: 'var(--info)', border: '1px solid rgba(37,99,235,0.15)', textDecoration: 'none',
            }}>✉ {item.email_from.replace(/<.*?>|\(.*?\)/g, '').trim()}</a>
          )}
          <a href={googleUrl(item)} target="_blank" rel="noreferrer" style={{
            display: 'block', fontSize: 12, padding: '8px 12px', borderRadius: 8, textAlign: 'center',
            background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', textDecoration: 'none',
          }}>🔍 Buscar en Google</a>
          {gUrl && (
            <a href={gUrl} target="_blank" rel="noreferrer" style={{
              display: 'block', fontSize: 12, padding: '8px 12px', borderRadius: 8, textAlign: 'center',
              background: 'rgba(37,99,235,0.06)', color: 'var(--info)', border: '1px solid rgba(37,99,235,0.15)', textDecoration: 'none',
            }}>📧 Abrir en Gmail</a>
          )}
        </div>

        {links.length > 0 && (
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>🔗 Links encontrados</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {links.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '8px 12px', borderRadius: 8,
                  background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)', textDecoration: 'none',
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortDomain(url)}</span>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>→</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: '16px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>📄 Contenido del email</p>
          {item.email_subject && <p style={{ fontSize: 12, marginBottom: 4, fontWeight: 500, color: 'var(--muted)' }}>Asunto: {item.email_subject}</p>}
          {item.email_body ? (
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, color: 'var(--text)', fontFamily: 'inherit', marginTop: 8 }}>
              {stripHtml(item.email_body)}
            </pre>
          ) : (
            <p style={{ fontSize: 12, textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>
              Contenido no disponible.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Card({ item, onEstado, onDelete, onPreview, editingId, setEditingId, editNota, setEditNota, saveNota }: {
  item: Inmueble; onEstado: (id: string, e: string) => void; onDelete: (id: string) => void
  onPreview: (i: Inmueble) => void; editingId: string | null; setEditingId: (id: string | null) => void
  editNota: string; setEditNota: (s: string) => void; saveNota: (id: string) => void
}) {
  const gUrl     = gmailUrl(item.email_message_id)
  const bestLink = item.link || (item.links_all?.[0] ?? null)
  const hasLinks = (item.links_all?.length ?? 0) > 0 || !!item.link
  const sc       = SCORE_COLOR(item.puntuacion_chollo)

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', position: 'relative',
      background: 'var(--surface)', border: item.es_bajada_precio ? `1px solid rgba(22,163,74,.35)` : '1px solid var(--border)',
    }}>
      {item.is_new && (
        <div style={{
          position: 'absolute', top: 8, left: 8, fontSize: 11, padding: '2px 8px', borderRadius: 999,
          fontWeight: 700, background: 'var(--primary)', color: '#fff',
        }}>NUEVO</div>
      )}
      <div style={{
        position: 'absolute', top: 8, right: 8, fontSize: 11, padding: '2px 8px', borderRadius: 999,
        fontWeight: 700, background: `${sc}18`, color: sc,
      }}>{item.puntuacion_chollo}/10</div>

      <div style={{ padding: '32px 16px 0' }}>
        <div style={{ fontSize: 18, marginBottom: 2 }}>{TIPO_ICON[item.tipo] || '🏗️'}</div>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, letterSpacing: '-0.02em' }}>{item.titulo}</h3>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>📍 {item.zona}</div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {item.es_bajada_precio && item.precio_anterior && (
            <div style={{ fontSize: 13, textDecoration: 'line-through', color: 'rgba(220,38,38,.5)' }}>{fmtPrice(item.precio_anterior)}</div>
          )}
          {item.precio && <div style={{ fontSize: 20, fontWeight: 700, color: item.es_bajada_precio ? 'var(--positive)' : 'var(--primary)', letterSpacing: '-0.03em' }}>{fmtPrice(item.precio)}</div>}
          {item.es_bajada_precio && item.precio_anterior && item.precio && (
            <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(22,163,74,.1)', color: 'var(--positive)' }}>
              -{Math.round((1 - item.precio / item.precio_anterior) * 100)}%
            </div>
          )}
          {item.metros && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{item.metros} m²</div>}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {item.es_bajada_precio && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: 'rgba(22,163,74,.08)', color: 'var(--positive)', border: '1px solid rgba(22,163,74,.2)' }}>📉 BAJADA</span>}
          {item.tiene_piscina && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid #bfdbfe' }}>🏊 Piscina</span>}
          {item.cerca_playa   && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>🏖️ Playa</span>}
          {item.es_rustica    && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--positive-bg)', color: 'var(--positive)', border: '1px solid #bbf7d0' }}>🌾 Rústica</span>}
          {item.es_subasta    && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid #fde68a' }}>⚖️ Subasta</span>}
        </div>

        <p style={{ fontSize: 12, fontStyle: 'italic', marginBottom: 12, color: 'var(--muted)', lineHeight: 1.5 }}>"{item.razon_chollo}"</p>

        {editingId === item.id ? (
          <div style={{ marginBottom: 12 }}>
            <textarea value={editNota} onChange={e => setEditNota(e.target.value)} rows={2} style={{
              width: '100%', fontSize: 12, padding: 8, borderRadius: 8, resize: 'none',
              background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', boxSizing: 'border-box',
            }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => saveNota(item.id)} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => setEditingId(null)} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6, background: 'var(--border)', color: 'var(--muted)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        ) : item.notas ? (
          <div style={{ marginBottom: 12, fontSize: 12, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg)', color: 'var(--text)' }}
            onClick={() => { setEditingId(item.id); setEditNota(item.notas || '') }}>
            📝 {item.notas}
          </div>
        ) : (
          <button onClick={() => { setEditingId(item.id); setEditNota('') }}
            style={{ fontSize: 12, marginBottom: 12, display: 'block', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Añadir nota</button>
        )}
      </div>

      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <select value={item.estado} onChange={e => onEstado(item.id, e.target.value)} style={{
          fontSize: 12, padding: '6px 8px', borderRadius: 8, width: '100%',
          background: `${ESTADO_COLOR[item.estado]}10`, border: `1px solid ${ESTADO_COLOR[item.estado]}30`, color: ESTADO_COLOR[item.estado],
        }}>
          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {bestLink && (
            <a href={bestLink} target="_blank" rel="noreferrer" style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 8, flex: 1, textAlign: 'center', fontWeight: 500,
              background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--border)', textDecoration: 'none',
            }}>🔗 {hasLinks && (item.links_all?.length ?? 0) > 1 ? `Ver (${item.links_all!.length})` : 'Ver'}</a>
          )}
          {item.telefono && (
            <a href={waUrl(item.telefono)} target="_blank" rel="noreferrer" style={{
              fontSize: 12, padding: '4px 8px', borderRadius: 8, fontWeight: 500,
              background: 'rgba(37,211,102,.08)', color: '#25D166', border: '1px solid rgba(37,211,102,.2)', textDecoration: 'none',
            }}>📞</a>
          )}
          {gUrl && (
            <a href={gUrl} target="_blank" rel="noreferrer" style={{
              fontSize: 12, padding: '4px 8px', borderRadius: 8,
              background: 'rgba(37,99,235,.06)', color: 'var(--info)', border: '1px solid rgba(37,99,235,.15)', textDecoration: 'none',
            }}>📧</a>
          )}
          <a href={googleUrl(item)} target="_blank" rel="noreferrer" style={{
            fontSize: 12, padding: '4px 8px', borderRadius: 8,
            background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', textDecoration: 'none',
          }}>🔍</a>
          <button onClick={() => onPreview(item)} style={{
            fontSize: 12, padding: '4px 8px', borderRadius: 8,
            background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer',
          }}>👁</button>
          <button onClick={() => onDelete(item.id)} style={{
            fontSize: 12, padding: '4px 8px', borderRadius: 8,
            background: 'rgba(220,38,38,.06)', color: 'rgba(220,38,38,.7)', border: '1px solid rgba(220,38,38,.15)', cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>
    </div>
  )
}

export default function InversionPage() {
  const [inmuebles,   setInmuebles]   = useState<Inmueble[]>([])
  const [ultimaFecha, setUltimaFecha] = useState<string | null>(null)
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [analyzing,   setAnalyzing]   = useState(false)
  const [progress,    setProgress]    = useState('')
  const [toast,       setToast]       = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)
  const [confirmId,   setConfirmId]   = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<Inmueble | null>(null)
  const [view,        setView]        = useState<'cards' | 'list'>('cards')
  const [offset,      setOffset]      = useState(0)

  const [fEstado,    setFEstado]    = useState('all')
  const [fTipo,      setFTipo]      = useState('all')
  const [fPlaya,     setFPlaya]     = useState(false)
  const [fPiscina,   setFPiscina]   = useState(false)
  const [fRustica,   setFRustica]   = useState(false)
  const [fSubasta,   setFSubasta]   = useState(false)
  const [fBajada,    setFBajada]    = useState(false)
  const [fCasas,     setFCasas]     = useState(false)
  const [fMinScore,  setFMinScore]  = useState(0)
  const [fPrecioMax, setFPrecioMax] = useState(0)
  const [fPrecioMin, setFPrecioMin] = useState(0)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editNota,   setEditNota]   = useState('')

  const showToast = (msg: string, type: 'ok' | 'err' | 'info' = 'info') => setToast({ msg, type })

  const buildParams = useCallback((off = 0) => {
    const p = new URLSearchParams()
    if (fEstado !== 'all') p.set('estado', fEstado)
    if (fTipo !== 'all')   p.set('tipo', fTipo)
    if (fPlaya)   p.set('playa', 'true')
    if (fPiscina) p.set('piscina', 'true')
    if (fRustica) p.set('rustica', 'true')
    if (fSubasta) p.set('subasta', 'true')
    if (fBajada)  p.set('bajada',  'true')
    if (fCasas)   p.set('casas',   'true')
    if (fMinScore > 0)  p.set('min_score', String(fMinScore))
    if (fPrecioMax > 0) p.set('precio_max', String(fPrecioMax))
    if (fPrecioMin > 0) p.set('precio_min', String(fPrecioMin))
    p.set('limit', String(PAGE_SIZE)); p.set('offset', String(off)); return p
  }, [fEstado, fTipo, fPlaya, fPiscina, fRustica, fSubasta, fCasas, fMinScore, fPrecioMax, fPrecioMin])

  const fetchData = useCallback(async () => {
    setLoading(true); setOffset(0)
    try {
      const res = await fetch(`/api/sivra/inversion?${buildParams(0)}`); const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Error cargando datos', 'err'); return }
      setInmuebles(data.inmuebles || []); setUltimaFecha(data.ultima_fecha || null); setTotal(data.total ?? 0)
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setLoading(false) }
  }, [buildParams])

  useEffect(() => { fetchData() }, [fetchData])

  const loadMore = async () => {
    const off = offset + PAGE_SIZE; setLoadingMore(true)
    try {
      const res = await fetch(`/api/sivra/inversion?${buildParams(off)}`); const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Error', 'err'); return }
      setInmuebles(prev => [...prev, ...(data.inmuebles || [])]); setOffset(off)
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setLoadingMore(false) }
  }

  const updateEstado = async (id: string, estado: string) => {
    setInmuebles(prev => prev.map(i => i.id === id ? { ...i, estado } : i))
    const res = await fetch('/api/sivra/inversion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estado }) })
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error al guardar', 'err'); fetchData() }
  }

  const saveNota = async (id: string) => {
    setInmuebles(prev => prev.map(i => i.id === id ? { ...i, notas: editNota } : i)); setEditingId(null)
    const res = await fetch('/api/sivra/inversion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, notas: editNota }) })
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error al guardar nota', 'err'); fetchData() }
    else showToast('Nota guardada', 'ok')
  }

  const doDelete = async () => {
    const id = confirmId; setConfirmId(null); if (!id) return
    setInmuebles(prev => prev.filter(i => i.id !== id))
    const res = await fetch(`/api/sivra/inversion?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error al eliminar', 'err'); fetchData() }
    else showToast('Propiedad eliminada', 'ok')
  }

  const runGmailAnalysis = async () => {
    setAnalyzing(true)
    try {
      const since = ultimaFecha
        ? new Date(ultimaFecha).toISOString().split('T')[0].replace(/-/g, '/')
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, '/')
      setProgress(`Buscando correos desde ${since}...`)
      const res  = await fetch('/api/sivra/inversion/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since }) })
      const data = await res.json()
      if (data.error)   { showToast(data.error, 'err'); return }
      if (data.message) { showToast(data.message, 'info'); return }
      const props = data.propiedades || []
      if (props.length > 0) {
        setProgress(`Guardando ${props.length} propiedades...`)
        const r2  = await fetch('/api/sivra/inversion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_insert', propiedades: props, ultima_fecha: data.ultima_fecha }) })
        const r2d = await r2.json()
        await fetchData()
        showToast(`${r2d.inserted} nueva(s) añadida(s)${r2d.skipped ? `, ${r2d.skipped} duplicada(s) omitida(s)` : ''}`, 'ok')
      } else {
        showToast(`${data.emails_analyzed ?? 0} correos analizados. Sin propiedades relevantes.`, 'info')
      }
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setAnalyzing(false); setProgress('') }
  }

  const resetFilters = () => {
    setFEstado('all'); setFTipo('all'); setFPlaya(false); setFPiscina(false)
    setFRustica(false); setFSubasta(false); setFBajada(false); setFCasas(false); setFMinScore(0); setFPrecioMax(0); setFPrecioMin(0)
  }

  const stats = {
    total:    inmuebles.length,
    chollos:  inmuebles.filter(i => i.puntuacion_chollo >= 8).length,
    interesa: inmuebles.filter(i => i.estado === 'interesa').length,
    bajadas:  inmuebles.filter(i => i.es_bajada_precio).length,
    playa:    inmuebles.filter(i => i.cerca_playa).length,
    piscina:  inmuebles.filter(i => i.tiene_piscina).length,
    casas:    inmuebles.filter(i => ['chalet','finca','parcela','casa','adosado','villa'].includes(i.tipo)).length,
  }

  const filterBtn = (active: boolean) => ({
    padding: '4px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '1px solid',
    background: active ? 'var(--primary-light)' : 'var(--bg)',
    borderColor: active ? 'var(--primary)' : 'var(--border)',
    color: active ? 'var(--primary)' : 'var(--muted)',
  })

  return (
    <div style={{ padding: '24px', maxWidth: 1280 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}

      <div className="inv-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', margin: 0 }}>🏡 Inversión</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Costa Huelva · Aljarafe · {ultimaFecha ? `Último análisis: ${new Date(ultimaFecha).toLocaleDateString('es-ES')}` : 'Sin analizar aún'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView(view === 'cards' ? 'list' : 'cards')} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12,
            background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
          }}>{view === 'cards' ? '≡ Lista' : '⊞ Tarjetas'}</button>
          <button onClick={runGmailAnalysis} disabled={analyzing} style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: analyzing ? 'not-allowed' : 'pointer',
            background: analyzing ? 'var(--primary-light)' : 'var(--primary)', color: analyzing ? 'var(--primary)' : '#fff', border: 'none',
          }}>{analyzing ? '⏳ Analizando...' : '🔍 Buscar nuevos'}</button>
        </div>
      </div>

      {analyzing && progress && (
        <div style={{ marginBottom: 16, padding: '8px 16px', borderRadius: 8, fontSize: 12, background: 'rgba(22,163,74,.06)', border: '1px solid rgba(22,163,74,.15)', color: 'var(--positive)' }}>
          ⏳ {progress}
        </div>
      )}

      {confirmId && <ConfirmBar onYes={doDelete} onNo={() => setConfirmId(null)} />}

      <div className="inv-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 20 }}>
        {([['🏠', stats.total, `de ${total}`], ['🔥', stats.chollos, 'Chollos'], ['📉', stats.bajadas, 'Bajadas'], ['🏖️', stats.playa, 'Playa'], ['🏊', stats.piscina, 'Piscina'], ['🏡', stats.casas, 'Casas'], ['⭐', stats.interesa, 'Interesa']] as const).map(([ic, v, l]) => (
          <div key={String(l)} style={{ borderRadius: 10, padding: '10px 8px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 16 }}>{ic}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {[
          [fEstado, setFEstado, [['all','Todos los estados'], ...ESTADOS.map(e => [e, e.charAt(0).toUpperCase() + e.slice(1)])]],
          [fTipo,   setFTipo,   [['all','Todos los tipos'],   ...['chalet','finca','parcela','casa','piso','apartamento'].map(t => [t, t.charAt(0).toUpperCase() + t.slice(1)])]],
          [fMinScore, setFMinScore, [[0,'Cualquier punt.'], [8,'Solo chollos (≥8)'], [6,'Interesantes (≥6)']], true],
        ].map(([val, setter, opts, isNum]: any, i) => (
          <select key={i} value={val} onChange={(e: any) => setter(isNum ? Number(e.target.value) : e.target.value)} style={{
            padding: '4px 8px', borderRadius: 8, fontSize: 12,
            background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
          }}>
            {opts.map(([v, l]: any) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" placeholder="Min €" value={fPrecioMin || ''} onChange={e => setFPrecioMin(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 8, fontSize: 12, width: 80, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>–</span>
          <input type="number" placeholder="Max €" value={fPrecioMax || ''} onChange={e => setFPrecioMax(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 8, fontSize: 12, width: 80, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
        {([['🏖️ Playa', fPlaya, setFPlaya], ['🏊 Piscina', fPiscina, setFPiscina], ['🌾 Rústica', fRustica, setFRustica], ['⚖️ Subasta', fSubasta, setFSubasta], ['📉 Bajadas', fBajada, setFBajada], ['🏡 Casas', fCasas, setFCasas]] as const).map(([l, v, s]) => (
          <button key={String(l)} onClick={() => (s as any)(!v)} style={filterBtn(v as boolean)}>{String(l)}</button>
        ))}
        <button onClick={resetFilters} style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>Limpiar</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px 0', fontSize: 14, color: 'var(--muted)' }}>Cargando...</div>
      ) : inmuebles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌊</div>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Sin propiedades. Pulsa "Buscar nuevos" para analizar tus correos.</p>
        </div>
      ) : view === 'cards' ? (
        <>
          <div className="inv-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {inmuebles.map(item => (
              <Card key={item.id} item={item} onEstado={updateEstado} onDelete={setConfirmId} onPreview={setPreviewItem}
                editingId={editingId} setEditingId={setEditingId} editNota={editNota} setEditNota={setEditNota} saveNota={saveNota} />
            ))}
          </div>
          {inmuebles.length < total && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button onClick={loadMore} disabled={loadingMore} style={{
                padding: '8px 24px', borderRadius: 10, fontSize: 14, fontWeight: 500,
                background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
              }}>{loadingMore ? 'Cargando...' : `Ver más (${total - inmuebles.length} restantes)`}</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="inv-table-wrap" style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Punt.', 'Propiedad', 'Zona', 'Precio', 'Caract.', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inmuebles.map(item => {
                  const gUrl = gmailUrl(item.email_message_id)
                  const bestLink = item.link || (item.links_all?.[0] ?? null)
                  const sc = SCORE_COLOR(item.puntuacion_chollo)
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${sc}15`, color: sc }}>
                          {item.puntuacion_chollo}/10
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{TIPO_ICON[item.tipo] || '🏗️'} {item.titulo}</div>
                        <div style={{ fontSize: 11, marginTop: 2, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{item.razon_chollo}</div>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>{item.zona}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{fmtPrice(item.precio)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {item.tiene_piscina && <span style={{ fontSize: 13 }}>🏊</span>}
                          {item.cerca_playa   && <span style={{ fontSize: 13 }}>🏖️</span>}
                          {item.es_rustica    && <span style={{ fontSize: 13 }}>🌾</span>}
                          {item.es_subasta    && <span style={{ fontSize: 13 }}>⚖️</span>}
                          {item.telefono      && <span style={{ fontSize: 13 }}>📞</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <select value={item.estado} onChange={e => updateEstado(item.id, e.target.value)} style={{
                          fontSize: 12, padding: '2px 6px', borderRadius: 6,
                          background: `${ESTADO_COLOR[item.estado]}10`, border: `1px solid ${ESTADO_COLOR[item.estado]}30`, color: ESTADO_COLOR[item.estado],
                        }}>
                          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {bestLink && <a href={bestLink} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--primary)' }}>🔗</a>}
                          {item.telefono && <a href={waUrl(item.telefono)} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#25D166' }}>📞</a>}
                          {gUrl && <a href={gUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--info)' }}>📧</a>}
                          <a href={googleUrl(item)} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: 'var(--muted)' }}>🔍</a>
                          <button onClick={() => setPreviewItem(item)} style={{ fontSize: 14, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>👁</button>
                          <button onClick={() => setConfirmId(item.id)} style={{ fontSize: 14, color: 'rgba(220,38,38,.6)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {inmuebles.length < total && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={loadMore} disabled={loadingMore} style={{
                padding: '8px 24px', borderRadius: 10, fontSize: 14,
                background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
              }}>{loadingMore ? 'Cargando...' : `Ver más (${total - inmuebles.length} restantes)`}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
