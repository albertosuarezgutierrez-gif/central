'use client'
// CobrosTab v2.0 — Portal de cobros funcional
import { useState, useEffect, useRef } from 'react'
import { C, SE, SN, SC } from '@/lib/colors'

interface Item { id: string; nombre: string; precio_eur: number; pdf_url: string | null; activo: boolean }
interface Pago { id: string; estado: string; importe_eur: number; nombre_pagador: string; email_pagador: string; pagado_at: string | null }
interface Portal { id: string; slug: string; titulo: string; descripcion: string | null; estado: string; created_at: string; cobros_grupo_items: Item[]; cobros_grupo_pagos: Pago[] }

interface Props { restauranteId: string; sh: () => Record<string, string> }

const BASE_URL = 'https://www.iarest.es'

export default function CobrosTab({ restauranteId, sh }: Props) {
  const [portales, setPortales] = useState<Portal[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista' | 'crear'>('lista')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)

  // Form
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [items, setItems] = useState([
    { nombre: '', precio_eur: '', pdf_url: '', pdf_nombre: '' },
    { nombre: '', precio_eur: '', pdf_url: '', pdf_nombre: '' },
  ])

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/owner/cobros', { headers: sh() })
    const d = await res.json()
    setPortales(d.portales ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addItem = () => setItems([...items, { nombre: '', precio_eur: '', pdf_url: '', pdf_nombre: '' }])
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i: number, key: string, val: string) => {
    const n = [...items]; (n[i] as any)[key] = val; setItems(n)
  }

  const uploadPdf = async (idx: number, file: File) => {
    // Subir a Supabase Storage
    const formData = new FormData()
    formData.append('file', file)
    formData.append('restaurante_id', restauranteId)
    try {
      const res = await fetch('/api/owner/cobros/upload-pdf', {
        method: 'POST', headers: sh(), body: formData
      })
      const d = await res.json()
      if (d.url) updateItem(idx, 'pdf_url', d.url)
      updateItem(idx, 'pdf_nombre', file.name)
    } catch {
      updateItem(idx, 'pdf_nombre', file.name + ' (sin subir)')
    }
  }

  const crear = async () => {
    if (!titulo.trim()) { setErr('El nombre del evento es obligatorio'); return }
    const validItems = items.filter(i => i.nombre.trim() && parseFloat(i.precio_eur) > 0)
    if (!validItems.length) { setErr('Añade al menos un menú con nombre y precio'); return }
    setGuardando(true); setErr('')
    const res = await fetch('/api/owner/cobros', {
      method: 'POST',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, descripcion, items: validItems })
    })
    const d = await res.json()
    if (d.ok) {
      setVista('lista')
      setTitulo(''); setDescripcion('')
      setItems([{ nombre: '', precio_eur: '', pdf_url: '', pdf_nombre: '' }, { nombre: '', precio_eur: '', pdf_url: '', pdf_nombre: '' }])
      await load()
    } else {
      setErr(d.error ?? 'Error al crear el portal')
    }
    setGuardando(false)
  }

  const copiarLink = (slug: string) => {
    navigator.clipboard.writeText(`${BASE_URL}/cobro/${slug}`)
    setCopiado(slug)
    setTimeout(() => setCopiado(null), 2000)
  }

  const cerrarPortal = async (id: string) => {
    if (!confirm('¿Cerrar este portal? Los invitados no podrán seguir pagando.')) return
    await fetch(`/api/owner/cobros/${id}`, {
      method: 'PATCH',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'cerrado' })
    })
    await load()
  }

  const s = {
    card: { background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '1.25rem', marginBottom: '1rem' } as React.CSSProperties,
    label: { fontFamily: SN, fontSize: 11, color: C.ink3, textTransform: 'uppercase' as const, letterSpacing: '.05em', fontWeight: 600, display: 'block', marginBottom: 6 },
    input: { width: '100%', padding: '10px 12px', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 10, color: C.paper, fontSize: 14, fontFamily: SN, outline: 'none', boxSizing: 'border-box' as const },
    btn: { background: C.red, color: C.paper, border: 'none', borderRadius: 10, padding: '11px 18px', fontFamily: SN, fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    btnSec: { background: 'transparent', color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '10px 16px', fontFamily: SN, fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
  }

  // ── VISTA CREAR ──────────────────────────────────────────────────────────
  if (vista === 'crear') return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
        <button onClick={() => setVista('lista')} style={s.btnSec}>← Atrás</button>
        <h2 style={{ fontFamily: SE, fontSize: '1.2rem', color: C.paper, margin: 0 }}>Nuevo portal de cobro</h2>
      </div>

      <div style={s.card}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={s.label}>Nombre del evento *</label>
          <input style={s.input} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Congreso Empresarial Junio 2026" />
        </div>
        <div>
          <label style={s.label}>Descripción (opcional)</label>
          <input style={s.input} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Información adicional para los invitados" />
        </div>
      </div>

      <div style={s.card}>
        <p style={{ fontFamily: SE, fontSize: '1rem', color: C.paper, margin: '0 0 1rem' }}>Opciones de menú</p>
        {items.map((item, i) => (
          <div key={i} style={{ background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '.875rem', marginBottom: '.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 32px', gap: 8, marginBottom: '.75rem', alignItems: 'center' }}>
              <input style={{ ...s.input, padding: '9px 12px' }} value={item.nombre} onChange={e => updateItem(i, 'nombre', e.target.value)} placeholder={`Menú ${i + 1}`} />
              <div style={{ position: 'relative' }}>
                <input style={{ ...s.input, padding: '9px 28px 9px 10px', textAlign: 'right' }} type="number" step="0.01" value={item.precio_eur} onChange={e => updateItem(i, 'precio_eur', e.target.value)} placeholder="0.00" />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.ink4, fontSize: 13, pointerEvents: 'none' }}>€</span>
              </div>
              <button onClick={() => removeItem(i)} style={{ width: 32, height: 36, background: 'none', border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink4, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            {/* PDF upload */}
            <label style={{ display: 'block', border: `1px dashed ${C.rule}`, borderRadius: 8, padding: '.625rem', textAlign: 'center', cursor: 'pointer', position: 'relative', background: C.bg2 }}>
              <input type="file" accept=".pdf" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                onChange={e => { if (e.target.files?.[0]) uploadPdf(i, e.target.files[0]) }} />
              <span style={{ fontFamily: SN, fontSize: 12, color: item.pdf_nombre ? C.green : C.ink4 }}>
                {item.pdf_nombre ? `✓ ${item.pdf_nombre}` : '📄 Adjuntar PDF del menú (opcional)'}
              </span>
            </label>
          </div>
        ))}
        <button onClick={addItem} style={{ ...s.btnSec, width: '100%', textAlign: 'center' }}>+ Añadir opción de menú</button>
      </div>

      {err && <p style={{ fontFamily: SN, fontSize: 13, color: C.amber, marginBottom: '1rem' }}>{err}</p>}

      <button onClick={crear} disabled={guardando} style={{ ...s.btn, width: '100%', padding: 14, fontSize: 15 }}>
        {guardando ? 'Creando portal...' : 'Crear portal y generar link →'}
      </button>
    </div>
  )

  // ── VISTA LISTA ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '1rem 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: SE, fontSize: '1.3rem', color: C.paper, margin: '0 0 3px' }}>Cobros</h2>
          <p style={{ fontFamily: SN, fontSize: 12, color: C.ink3, margin: 0 }}>Portales de pago para eventos y congresos</p>
        </div>
        <button onClick={() => setVista('crear')} style={s.btn}>+ Nuevo portal</button>
      </div>

      {loading && <p style={{ fontFamily: SN, color: C.ink3, fontSize: 13 }}>Cargando...</p>}

      {!loading && portales.length === 0 && (
        <div style={{ ...s.card, textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: 32, marginBottom: '.75rem' }}>🔗</div>
          <p style={{ fontFamily: SE, fontSize: '1.1rem', color: C.paper, margin: '0 0 .5rem' }}>Sin portales todavía</p>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: '0 0 1.25rem' }}>Crea tu primer portal de cobro para un evento</p>
          <button onClick={() => setVista('crear')} style={s.btn}>Crear primer portal →</button>
        </div>
      )}

      {portales.map(portal => {
        const pagados = portal.cobros_grupo_pagos.filter(p => p.estado === 'pagado')
        const pendientes = portal.cobros_grupo_pagos.filter(p => p.estado === 'pendiente')
        const totalCobrado = pagados.reduce((acc, p) => acc + Number(p.importe_eur), 0)
        const link = `${BASE_URL}/cobro/${portal.slug}`
        const cerrado = portal.estado === 'cerrado'

        return (
          <div key={portal.id} style={{ ...s.card, opacity: cerrado ? 0.65 : 1 }}>
            {/* Header portal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.875rem', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ fontFamily: SE, fontSize: '1rem', color: C.paper, margin: 0 }}>{portal.titulo}</h3>
                  <span style={{ fontFamily: SN, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: cerrado ? C.bg3 : 'rgba(63,125,68,.15)',
                    color: cerrado ? C.ink4 : C.green,
                    textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {cerrado ? 'Cerrado' : 'Activo'}
                  </span>
                </div>
                <p style={{ fontFamily: SN, fontSize: 12, color: C.ink4, margin: '3px 0 0' }}>
                  {portal.cobros_grupo_items.length} menús · {pagados.length} pagados · {pendientes.length} pendientes
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: SE, fontSize: '1.4rem', color: C.green, margin: 0, fontWeight: 500 }}>{totalCobrado.toFixed(2)} €</p>
                <p style={{ fontFamily: SN, fontSize: 11, color: C.ink4, margin: 0 }}>cobrado</p>
              </div>
            </div>

            {/* Menús */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '.875rem' }}>
              {portal.cobros_grupo_items.map(item => (
                <span key={item.id} style={{ fontFamily: SN, fontSize: 12, padding: '3px 10px',
                  background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 20, color: C.ink2 }}>
                  {item.nombre} · {Number(item.precio_eur).toFixed(2)}€
                  {item.pdf_url && <span style={{ color: C.red }}> 📄</span>}
                </span>
              ))}
            </div>

            {/* Link */}
            <div style={{ background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '8px 12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: '.875rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{link}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => copiarLink(portal.slug)} style={{ ...s.btn, padding: '5px 12px', fontSize: 12 }}>
                  {copiado === portal.slug ? '✓ Copiado' : 'Copiar link'}
                </button>
                <a href={link} target="_blank" style={{ ...s.btnSec, padding: '5px 10px', fontSize: 12, textDecoration: 'none', display: 'inline-block' }}>↗</a>
              </div>
            </div>

            {/* Pagos recientes */}
            {pagados.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: '.75rem' }}>
                <p style={{ ...s.label, marginBottom: '.5rem' }}>Pagos recibidos</p>
                {pagados.slice(0, 5).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0',
                    borderBottom: `1px solid ${C.rule}`, fontSize: 13, fontFamily: SN }}>
                    <span style={{ color: C.ink2 }}>{p.nombre_pagador || 'Anónimo'}</span>
                    <span style={{ color: C.green }}>{Number(p.importe_eur).toFixed(2)} €</span>
                  </div>
                ))}
                {pagados.length > 5 && <p style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 6 }}>+{pagados.length - 5} más</p>}
              </div>
            )}

            {/* Acciones */}
            {!cerrado && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.75rem' }}>
                <button onClick={() => cerrarPortal(portal.id)} style={{ ...s.btnSec, fontSize: 12, padding: '6px 12px' }}>
                  Cerrar portal
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
