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

const SCORE_COLOR = (s: number) => s >= 8 ? '#00e5a0' : s >= 6 ? '#d0f100' : s >= 4 ? '#ff8c42' : '#ff4d6d'
const SCORE_LABEL = (s: number) => s >= 8 ? '🔥 CHOLLO' : s >= 6 ? '✨ Interesante' : s >= 4 ? '👀 Revisar' : '❌ No encaja'
const TIPO_ICON: Record<string, string> = { chalet: '🏡', parcela: '🌿', finca: '🌾', casa: '🏠', piso: '🏢', apartamento: '🏖️' }
const ESTADOS = ['pendiente', 'interesa', 'visitado', 'descartado']
const ESTADO_COLOR: Record<string, string> = { pendiente: '#4a6a85', interesa: '#d0f100', visitado: '#00e5a0', descartado: '#ff4d6d' }
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


// ─── Strip HTML ───────────────────────────────────────────────────────────────
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

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: 'ok' | 'err' | 'info'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t) }, [onClose])
  const cl = type === 'ok' ? '#00e5a0' : type === 'err' ? '#ff4d6d' : '#d0f100'
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-sm shadow-lg"
      style={{ background: `${cl}12`, border: `1px solid ${cl}30`, color: cl, maxWidth: 380 }}>
      <span className="font-bold">{type === 'ok' ? '✓' : type === 'err' ? '⚠' : 'ℹ'}</span>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-50 hover:opacity-100 ml-2">✕</button>
    </div>
  )
}

// ─── Confirm bar ──────────────────────────────────────────────────────────────
function ConfirmBar({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl text-xs mb-3"
      style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', color: '#ff4d6d' }}>
      <span className="flex-1">⚠ ¿Eliminar esta propiedad? No se puede deshacer.</span>
      <button onClick={onYes} className="px-3 py-1 rounded-lg font-semibold" style={{ background: '#ff4d6d', color: '#fff' }}>Eliminar</button>
      <button onClick={onNo} className="px-3 py-1 rounded-lg" style={{ background: 'var(--border)', color: 'var(--muted)' }}>Cancelar</button>
    </div>
  )
}

// ─── Preview modal ────────────────────────────────────────────────────────────
function PreviewModal({ item, onClose }: { item: Inmueble; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const gUrl  = gmailUrl(item.email_message_id)
  const links = item.links_all && item.links_all.length > 0 ? item.links_all : (item.link ? [item.link] : [])

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="ml-auto h-full w-full max-w-xl overflow-y-auto"
        style={{ background: 'var(--bg)', borderLeft: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Cabecera */}
        <div className="sticky top-0 flex items-start justify-between gap-3 p-5 border-b"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', zIndex: 10 }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-base">{TIPO_ICON[item.tipo] || '🏗️'}</span>
              <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--navy)' }}>{item.titulo}</h2>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>📍 {item.zona} · {fmtPrice(item.precio)}{item.metros ? ` · ${item.metros}m²` : ''}</p>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {item.tiene_piscina && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#0066ff15', color: '#5599ff' }}>🏊</span>}
              {item.cerca_playa   && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#00aacc15', color: '#44ccee' }}>🏖️</span>}
              {item.es_rustica    && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#44aa6615', color: '#66cc88' }}>🌾</span>}
              {item.es_subasta    && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#cc880015', color: '#ffaa44' }}>⚖️</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--muted)', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* Acciones principales */}
        <div className="p-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>

          {/* Teléfono */}
          {item.telefono && (
            <div className="flex gap-2">
              <a href={`tel:${item.telefono}`}
                className="flex-1 text-xs px-3 py-2 rounded-lg font-medium text-center"
                style={{ background: 'rgba(0,229,160,0.12)', color: '#00e5a0', border: '1px solid rgba(0,229,160,0.25)' }}>
                📞 Llamar {item.telefono}
              </a>
              <a href={waUrl(item.telefono)} target="_blank" rel="noreferrer"
                className="text-xs px-3 py-2 rounded-lg font-medium"
                style={{ background: 'rgba(37,211,102,0.12)', color: '#25D166', border: '1px solid rgba(37,211,102,0.25)' }}>
                WhatsApp
              </a>
            </div>
          )}

          {/* Email — solo si no es portal/no-reply */}
          {item.email_from && !isPortalSender(item.email_from) && (
            <a href={`mailto:${item.email_from}`}
              className="block text-xs px-3 py-2 rounded-lg text-center"
              style={{ background: 'rgba(66,133,244,0.08)', color: '#5a9cf5', border: '1px solid rgba(66,133,244,0.2)' }}>
              ✉ Responder a {item.email_from.replace(/<.*?>|\(.*?\)/g, '').trim()}
            </a>
          )}

          {/* Google */}
          <a href={googleUrl(item)} target="_blank" rel="noreferrer"
            className="block text-xs px-3 py-2 rounded-lg text-center"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            🔍 Buscar en Google
          </a>

          {/* Gmail thread */}
          {gUrl && (
            <a href={gUrl} target="_blank" rel="noreferrer"
              className="block text-xs px-3 py-2 rounded-lg text-center"
              style={{ background: 'rgba(66,133,244,0.08)', color: '#5a9cf5', border: '1px solid rgba(66,133,244,0.2)' }}>
              📧 Abrir email original en Gmail
            </a>
          )}
        </div>

        {/* Todos los links del email */}
        {links.length > 0 && (
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>🔗 Links encontrados en el email</p>
            <div className="space-y-1.5">
              {links.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: 'var(--sand)', color: '#d0f100', border: '1px solid var(--border)' }}>
                  <span className="flex-1 truncate">{shortDomain(url)}</span>
                  <span style={{ color: 'var(--dim)', flexShrink: 0 }}>→</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Cuerpo del email */}
        <div className="p-4">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>📄 Contenido del email</p>
          {item.email_subject && <p className="text-xs mb-1 font-medium" style={{ color: 'var(--dim)' }}>Asunto: {item.email_subject}</p>}
          {item.email_body ? (
            <pre className="text-xs whitespace-pre-wrap break-words leading-relaxed mt-2"
              style={{ color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
              {stripHtml(item.email_body)}
            </pre>
          ) : (
            <p className="text-xs text-center py-8" style={{ color: 'var(--dim)' }}>
              Contenido no disponible (propiedad importada antes de esta versión).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta ──────────────────────────────────────────────────────────────────
function Card({ item, onEstado, onDelete, onPreview, editingId, setEditingId, editNota, setEditNota, saveNota }: {
  item: Inmueble; onEstado: (id: string, e: string) => void; onDelete: (id: string) => void
  onPreview: (i: Inmueble) => void; editingId: string | null; setEditingId: (id: string | null) => void
  editNota: string; setEditNota: (s: string) => void; saveNota: (id: string) => void
}) {
  const gUrl      = gmailUrl(item.email_message_id)
  const bestLink  = item.link || (item.links_all?.[0] ?? null)
  const hasLinks  = (item.links_all?.length ?? 0) > 0 || !!item.link

  return (
    <div className="rounded-xl overflow-hidden relative"
      style={{
        background: item.is_new ? 'linear-gradient(135deg,rgba(126,200,32,0.06),rgba(0,0,0,0))' : 'var(--sand)',
        border: item.es_bajada_precio ? '1px solid rgba(0,229,160,0.35)' : item.puntuacion_chollo >= 8 ? '1px solid rgba(208,241,0,0.2)' : '1px solid var(--border)',
      }}>
      {item.is_new && (
        <div className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ background: '#d0f100', color: '#1b2540' }}>NUEVO</div>
      )}
      <div className="absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded-full font-bold"
        style={{ background: SCORE_COLOR(item.puntuacion_chollo) + '25', color: SCORE_COLOR(item.puntuacion_chollo) }}>
        {item.puntuacion_chollo}/10
      </div>

      <div className="p-4 pt-8">
        <div className="text-base mb-0.5">{TIPO_ICON[item.tipo] || '🏗️'}</div>
        <h3 className="text-sm font-medium mb-0.5" style={{ color: 'var(--navy)', letterSpacing: '-0.02em' }}>{item.titulo}</h3>
        <div className="text-xs mb-2" style={{ color: 'var(--muted)' }}>📍 {item.zona}</div>

        <div className="flex items-end gap-3 mb-3 flex-wrap">
          {item.es_bajada_precio && item.precio_anterior && (
            <div className="text-sm line-through" style={{ color: 'rgba(255,77,109,0.5)' }}>{fmtPrice(item.precio_anterior)}</div>
          )}
          {item.precio && <div className="text-xl font-bold" style={{ color: item.es_bajada_precio ? '#00e5a0' : '#d0f100', letterSpacing: '-0.03em' }}>{fmtPrice(item.precio)}</div>}
          {item.es_bajada_precio && item.precio_anterior && item.precio && (
            <div className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,229,160,0.15)', color: '#00e5a0' }}>
              -{Math.round((1 - item.precio / item.precio_anterior) * 100)}%
            </div>
          )}
          {item.metros && <div className="text-sm self-end mb-0.5" style={{ color: 'var(--muted)' }}>{item.metros} m²</div>}
        </div>

        <div className="flex gap-1.5 flex-wrap mb-3">
          {item.es_bajada_precio && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(0,229,160,0.15)', color: '#00e5a0', border: '1px solid rgba(0,229,160,0.3)' }}>📉 BAJADA</span>}
          {item.tiene_piscina && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#0066ff15', color: '#5599ff', border: '1px solid #0066ff25' }}>🏊 Piscina</span>}
          {item.cerca_playa   && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#00aacc15', color: '#44ccee', border: '1px solid #00aacc25' }}>🏖️ Playa</span>}
          {item.es_rustica    && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#44aa6615', color: '#66cc88', border: '1px solid #44aa6625' }}>🌾 Rústica</span>}
          {item.es_subasta    && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#cc880015', color: '#ffaa44', border: '1px solid #cc880025' }}>⚖️ Subasta</span>}
        </div>

        <p className="text-xs italic mb-3" style={{ color: 'var(--muted)', lineHeight: 1.5 }}>"{item.razon_chollo}"</p>

        {/* Notas */}
        {editingId === item.id ? (
          <div className="mb-3">
            <textarea value={editNota} onChange={e => setEditNota(e.target.value)} rows={2}
              className="w-full text-xs p-2 rounded-lg resize-none"
              style={{ background: 'var(--border)', border: '1px solid var(--border)', color: '#fff' }} />
            <div className="flex gap-2 mt-1">
              <button onClick={() => saveNota(item.id)} className="text-xs px-2 py-0.5 rounded" style={{ background: '#d0f100', color: '#1b2540' }}>Guardar</button>
              <button onClick={() => setEditingId(null)} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--muted)' }}>Cancelar</button>
            </div>
          </div>
        ) : item.notas ? (
          <div className="mb-3 text-xs p-2 rounded-lg cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)' }}
            onClick={() => { setEditingId(item.id); setEditNota(item.notas || '') }}>
            📝 {item.notas}
          </div>
        ) : (
          <button onClick={() => { setEditingId(item.id); setEditNota('') }}
            className="text-xs mb-3 block" style={{ color: 'var(--dim)' }}>+ Añadir nota</button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 space-y-2">
        <select value={item.estado} onChange={e => onEstado(item.id, e.target.value)}
          className="text-xs px-2 py-1 rounded-lg w-full"
          style={{ background: ESTADO_COLOR[item.estado] + '18', border: `1px solid ${ESTADO_COLOR[item.estado]}35`, color: ESTADO_COLOR[item.estado] }}>
          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>

        <div className="flex gap-1.5 flex-wrap">
          {/* Mejor link directo */}
          {bestLink && (
            <a href={bestLink} target="_blank" rel="noreferrer"
              className="text-xs px-2 py-1 rounded-lg flex-1 text-center font-medium"
              style={{ background: 'rgba(208,241,0,0.12)', color: '#d0f100', border: '1px solid rgba(208,241,0,0.2)' }}>
              🔗 {hasLinks && (item.links_all?.length ?? 0) > 1 ? `Ver (${item.links_all!.length})` : 'Ver'}
            </a>
          )}
          {/* Teléfono */}
          {item.telefono && (
            <a href={waUrl(item.telefono)} target="_blank" rel="noreferrer"
              className="text-xs px-2 py-1 rounded-lg font-medium"
              style={{ background: 'rgba(37,211,102,0.12)', color: '#25D166', border: '1px solid rgba(37,211,102,0.25)' }}>
              📞
            </a>
          )}
          {/* Gmail */}
          {gUrl && (
            <a href={gUrl} target="_blank" rel="noreferrer"
              className="text-xs px-2 py-1 rounded-lg"
              style={{ background: 'rgba(66,133,244,0.10)', color: '#5a9cf5', border: '1px solid rgba(66,133,244,0.22)' }}>
              📧
            </a>
          )}
          {/* Google */}
          <a href={googleUrl(item)} target="_blank" rel="noreferrer"
            className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--dim)', border: '1px solid var(--border)' }}>
            🔍
          </a>
          {/* Preview */}
          <button onClick={() => onPreview(item)}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            👁
          </button>
          {/* Borrar */}
          <button onClick={() => onDelete(item.id)}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,77,109,0.08)', color: 'rgba(255,77,109,0.7)', border: '1px solid rgba(255,77,109,0.2)' }}>
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function InversionPage() {
  const [inmuebles,    setInmuebles]    = useState<Inmueble[]>([])
  const [ultimaFecha,  setUltimaFecha]  = useState<string | null>(null)
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [analyzing,    setAnalyzing]    = useState(false)
  const [progress,     setProgress]     = useState('')
  const [toast,        setToast]        = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)
  const [confirmId,    setConfirmId]    = useState<string | null>(null)
  const [previewItem,  setPreviewItem]  = useState<Inmueble | null>(null)
  const [view,         setView]         = useState<'cards' | 'list'>('cards')
  const [offset,       setOffset]       = useState(0)

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
      const res = await fetch(`/api/inversion?${buildParams(0)}`); const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Error cargando datos', 'err'); return }
      setInmuebles(data.inmuebles || []); setUltimaFecha(data.ultima_fecha || null); setTotal(data.total ?? 0)
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setLoading(false) }
  }, [buildParams])

  useEffect(() => { fetchData() }, [fetchData])

  const loadMore = async () => {
    const off = offset + PAGE_SIZE; setLoadingMore(true)
    try {
      const res = await fetch(`/api/inversion?${buildParams(off)}`); const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Error', 'err'); return }
      setInmuebles(prev => [...prev, ...(data.inmuebles || [])]); setOffset(off)
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setLoadingMore(false) }
  }

  const updateEstado = async (id: string, estado: string) => {
    setInmuebles(prev => prev.map(i => i.id === id ? { ...i, estado } : i))
    const res = await fetch('/api/inversion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estado }) })
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error al guardar', 'err'); fetchData() }
  }

  const saveNota = async (id: string) => {
    setInmuebles(prev => prev.map(i => i.id === id ? { ...i, notas: editNota } : i)); setEditingId(null)
    const res = await fetch('/api/inversion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, notas: editNota }) })
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error al guardar nota', 'err'); fetchData() }
    else showToast('Nota guardada', 'ok')
  }

  const doDelete = async () => {
    const id = confirmId; setConfirmId(null); if (!id) return
    setInmuebles(prev => prev.filter(i => i.id !== id))
    const res = await fetch(`/api/inversion?id=${id}`, { method: 'DELETE' })
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
      const res  = await fetch('/api/inversion/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since }) })
      const data = await res.json()
      if (data.error)   { showToast(data.error, 'err'); return }
      if (data.message) { showToast(data.message, 'info'); return }
      const props = data.propiedades || []
      if (props.length > 0) {
        setProgress(`Guardando ${props.length} propiedades...`)
        const r2  = await fetch('/api/inversion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_insert', propiedades: props, ultima_fecha: data.ultima_fecha }) })
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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ letterSpacing: '-0.03em', color: 'var(--navy)' }}>🏡 Inversión</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Costa Huelva · Aljarafe · {ultimaFecha ? `Último análisis: ${new Date(ultimaFecha).toLocaleDateString('es-ES')}` : 'Sin analizar aún'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView(view === 'cards' ? 'list' : 'cards')}
            className="px-3 py-1.5 rounded-lg text-xs border"
            style={{ background: 'var(--sand)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
            {view === 'cards' ? '≡ Lista' : '⊞ Tarjetas'}
          </button>
          <button onClick={runGmailAnalysis} disabled={analyzing}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: analyzing ? 'rgba(208,241,0,0.1)' : '#d0f100', color: analyzing ? '#d0f100' : '#1b2540' }}>
            {analyzing ? '⏳ Analizando...' : '🔍 Buscar nuevos'}
          </button>
        </div>
      </div>

      {analyzing && progress && (
        <div className="mb-4 px-4 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0' }}>
          ⏳ {progress}
        </div>
      )}

      {confirmId && <ConfirmBar onYes={doDelete} onNo={() => setConfirmId(null)} />}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 mb-5">
        {([['🏠', stats.total, `de ${total}`], ['🔥', stats.chollos, 'Chollos'], ['📉', stats.bajadas, 'Bajadas'], ['🏖️', stats.playa, 'Playa'], ['🏊', stats.piscina, 'Piscina'], ['🏡', stats.casas, 'Casas']] as const).map(([ic, v, l]) => (
          <div key={String(l)} className="rounded-xl p-3 text-center" style={{ background: 'var(--sand)', border: '1px solid var(--border)' }}>
            <div className="text-base">{ic}</div>
            <div className="text-lg font-bold" style={{ color: 'var(--navy)' }}>{v}</div>
            <div className="text-xs" style={{ color: 'var(--dim)' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5 p-3 rounded-xl" style={{ background: 'var(--sand)', border: '1px solid var(--border)' }}>
        {[
          [fEstado, setFEstado, [['all','Todos los estados'],...ESTADOS.map(e=>[e,e.charAt(0).toUpperCase()+e.slice(1)])]],
          [fTipo,   setFTipo,   [['all','Todos los tipos'],...['chalet','finca','parcela','casa','piso','apartamento'].map(t=>[t,t.charAt(0).toUpperCase()+t.slice(1)])]],
          [fMinScore,setFMinScore,[[0,'Cualquier punt.'],[8,'Solo chollos (≥8)'],[6,'Interesantes (≥6)']],true],
        ].map(([val,setter,opts,isNum]:any,i) => (
          <select key={i} value={val} onChange={(e:any)=>setter(isNum?Number(e.target.value):e.target.value)}
            className="px-2 py-1 rounded-lg text-xs"
            style={{background:'white',border:'1px solid var(--border)',color:'var(--text-secondary)'}}>
            {opts.map(([v,l]:any)=><option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        <div className="flex items-center gap-1">
          <input type="number" placeholder="Min €" value={fPrecioMin||''} onChange={e=>setFPrecioMin(Number(e.target.value))}
            className="px-2 py-1 rounded-lg text-xs w-24" style={{background:'white',border:'1px solid var(--border)',color:'var(--text-secondary)'}} />
          <span className="text-xs" style={{color:'var(--dim)'}}>–</span>
          <input type="number" placeholder="Max €" value={fPrecioMax||''} onChange={e=>setFPrecioMax(Number(e.target.value))}
            className="px-2 py-1 rounded-lg text-xs w-24" style={{background:'white',border:'1px solid var(--border)',color:'var(--text-secondary)'}} />
        </div>
        {([['🏖️ Playa',fPlaya,setFPlaya],['🏊 Piscina',fPiscina,setFPiscina],['🌾 Rústica',fRustica,setFRustica],['⚖️ Subasta',fSubasta,setFSubasta],['📉 Bajadas',fBajada,setFBajada],['🏡 Casas',fCasas,setFCasas]] as const).map(([l,v,s])=>(
          <button key={String(l)} onClick={()=>(s as any)(!v)} className="px-3 py-1 rounded-lg text-xs"
            style={{background:v?'rgba(126,200,32,0.12)':'var(--sand)',border:v?'1px solid rgba(126,200,32,0.4)':'1px solid var(--border)',color:v?'var(--lime-d)':'var(--muted)'}}>
            {String(l)}
          </button>
        ))}
        <button onClick={resetFilters} className="px-3 py-1 rounded-lg text-xs"
          style={{background:'transparent',border:'1px solid var(--border)',color:'var(--dim)'}}>Limpiar</button>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="text-center py-16 text-sm" style={{color:'var(--dim)'}}>Cargando...</div>
      ) : inmuebles.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🌊</div>
          <p className="text-sm" style={{color:'var(--dim)'}}>Sin propiedades. Pulsa "Buscar nuevos" para analizar tus correos.</p>
        </div>
      ) : view === 'cards' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {inmuebles.map(item => (
              <Card key={item.id} item={item} onEstado={updateEstado} onDelete={setConfirmId} onPreview={setPreviewItem}
                editingId={editingId} setEditingId={setEditingId} editNota={editNota} setEditNota={setEditNota} saveNota={saveNota} />
            ))}
          </div>
          {inmuebles.length < total && (
            <div className="text-center mt-6">
              <button onClick={loadMore} disabled={loadingMore} className="px-6 py-2 rounded-xl text-sm font-medium"
                style={{background:'var(--sand)',border:'1px solid var(--border)',color:'var(--muted)'}}>
                {loadingMore ? 'Cargando...' : `Ver más (${total - inmuebles.length} restantes)`}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden" style={{border:'1px solid var(--border)'}}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:'var(--sand)',borderBottom:'1px solid var(--border)'}}>
                  {['Punt.','Propiedad','Zona','Precio','Caract.','Estado','Acciones'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium" style={{color:'var(--muted)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inmuebles.map(item => {
                  const gUrl = gmailUrl(item.email_message_id)
                  const bestLink = item.link || (item.links_all?.[0] ?? null)
                  return (
                    <tr key={item.id} style={{borderBottom:'1px solid var(--border)'}}>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{background:SCORE_COLOR(item.puntuacion_chollo)+'20',color:SCORE_COLOR(item.puntuacion_chollo)}}>
                          {item.puntuacion_chollo}/10
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-xs" style={{color:'var(--navy)'}}>{TIPO_ICON[item.tipo]||'🏗️'} {item.titulo}</div>
                        <div className="text-xs mt-0.5 truncate max-w-xs" style={{color:'var(--muted)'}}>{item.razon_chollo}</div>
                      </td>
                      <td className="px-3 py-2 text-xs" style={{color:'var(--text-secondary)'}}>{item.zona}</td>
                      <td className="px-3 py-2 text-xs font-semibold" style={{color:'#d0f100'}}>{fmtPrice(item.precio)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {item.tiene_piscina && <span className="text-xs">🏊</span>}
                          {item.cerca_playa   && <span className="text-xs">🏖️</span>}
                          {item.es_rustica    && <span className="text-xs">🌾</span>}
                          {item.es_subasta    && <span className="text-xs">⚖️</span>}
                          {item.telefono      && <span className="text-xs">📞</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.estado} onChange={e=>updateEstado(item.id,e.target.value)}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{background:ESTADO_COLOR[item.estado]+'20',border:`1px solid ${ESTADO_COLOR[item.estado]}40`,color:ESTADO_COLOR[item.estado]}}>
                          {ESTADOS.map(e=><option key={e} value={e}>{e.charAt(0).toUpperCase()+e.slice(1)}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5 items-center">
                          {bestLink && <a href={bestLink} target="_blank" rel="noreferrer" className="text-xs" style={{color:'#d0f100'}}>🔗</a>}
                          {item.telefono && <a href={waUrl(item.telefono)} target="_blank" rel="noreferrer" className="text-xs" style={{color:'#25D166'}}>📞</a>}
                          {gUrl && <a href={gUrl} target="_blank" rel="noreferrer" className="text-xs" style={{color:'#5a9cf5'}}>📧</a>}
                          <a href={googleUrl(item)} target="_blank" rel="noreferrer" className="text-xs" style={{color:'var(--dim)'}}>🔍</a>
                          <button onClick={()=>setPreviewItem(item)} className="text-xs" style={{color:'var(--muted)'}}>👁</button>
                          <button onClick={()=>setConfirmId(item.id)} className="text-xs" style={{color:'rgba(255,77,109,0.6)'}}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {inmuebles.length < total && (
            <div className="text-center mt-4">
              <button onClick={loadMore} disabled={loadingMore} className="px-6 py-2 rounded-xl text-sm font-medium"
                style={{background:'var(--sand)',border:'1px solid var(--border)',color:'var(--muted)'}}>
                {loadingMore ? 'Cargando...' : `Ver más (${total - inmuebles.length} restantes)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

