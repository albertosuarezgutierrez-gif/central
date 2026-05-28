'use client'
// CobrosTab v4.0 — imagen evento + color personalizado
import { useState, useEffect } from 'react'
import { C, SE, SN } from '@/lib/colors'

interface Item { id: string; nombre: string; precio_eur: number; pdf_url: string | null; activo: boolean }
interface Pago { id: string; estado: string; importe_eur: number; nombre_pagador: string; pagado_at: string | null }
interface Portal { id: string; slug: string; titulo: string; descripcion: string | null; estado: string; imagen_url: string | null; color_primario: string; created_at: string; cobros_grupo_items: Item[]; cobros_grupo_pagos: Pago[] }
interface Props { restauranteId: string; sh: () => Record<string, string> }

const BASE_URL = 'https://www.iarest.es'

const COLORES_PRESET = [
  { hex: '#D9442B', label: 'Rojo' },
  { hex: '#1A5276', label: 'Azul oscuro' },
  { hex: '#145A32', label: 'Verde' },
  { hex: '#6C3483', label: 'Morado' },
  { hex: '#784212', label: 'Marrón' },
  { hex: '#1A1714', label: 'Negro' },
  { hex: '#B7950B', label: 'Dorado' },
  { hex: '#1F618D', label: 'Azul' },
]

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
  const [color, setColor] = useState('#D9442B')
  const [imagenUrl, setImagenUrl] = useState('')
  const [imagenNombre, setImagenNombre] = useState('')
  const [subiendo, setSubiendo] = useState(false)
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

  const uploadImagen = async (file: File) => {
    setSubiendo(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/owner/cobros/upload-imagen', { method: 'POST', headers: sh(), body: formData })
      const d = await res.json()
      if (d.url) { setImagenUrl(d.url); setImagenNombre(file.name) }
      else setErr('Error al subir imagen')
    } catch { setErr('Error al subir imagen') }
    setSubiendo(false)
  }

  const uploadPdf = async (idx: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/owner/cobros/upload-pdf', { method: 'POST', headers: sh(), body: formData })
      const d = await res.json()
      if (d.url) updateItem(idx, 'pdf_url', d.url)
    } catch {}
    updateItem(idx, 'pdf_nombre', file.name)
  }

  const crear = async () => {
    if (!titulo.trim()) { setErr('El nombre del evento es obligatorio'); return }
    const valid = items.filter(i => i.nombre.trim() && parseFloat(i.precio_eur) > 0)
    if (!valid.length) { setErr('Añade al menos un menú con nombre y precio'); return }
    setGuardando(true); setErr('')
    const res = await fetch('/api/owner/cobros', {
      method: 'POST',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, descripcion, items: valid, imagen_url: imagenUrl || null, color_primario: color })
    })
    const d = await res.json()
    if (d.ok) {
      setVista('lista')
      setTitulo(''); setDescripcion(''); setColor('#D9442B')
      setImagenUrl(''); setImagenNombre('')
      setItems([{ nombre: '', precio_eur: '', pdf_url: '', pdf_nombre: '' }, { nombre: '', precio_eur: '', pdf_url: '', pdf_nombre: '' }])
      await load()
    } else { setErr(d.error ?? 'Error al crear') }
    setGuardando(false)
  }

  const copiarLink = (slug: string) => {
    navigator.clipboard.writeText(`${BASE_URL}/cobro/${slug}`)
    setCopiado(slug); setTimeout(() => setCopiado(null), 2000)
  }

  const cerrar = async (id: string) => {
    if (!confirm('¿Cerrar este portal?')) return
    await fetch(`/api/owner/cobros/${id}`, {
      method: 'PATCH', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'cerrado' })
    })
    await load()
  }

  const colorContraste = (hex: string) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
    return (r*299+g*587+b*114)/1000 > 128 ? '#1A1714' : '#F6F1E7'
  }

  // Estilos tema claro
  const card: React.CSSProperties = { background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '1.25rem', marginBottom: '1rem' }
  const lbl: React.CSSProperties = { fontFamily: SN, fontSize: 11, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, display: 'block', marginBottom: 6 }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, color: C.ink, fontSize: 14, fontFamily: SN, outline: 'none', boxSizing: 'border-box' }
  const btn: React.CSSProperties = { background: C.red, color: C.paper, border: 'none', borderRadius: 10, padding: '11px 18px', fontFamily: SN, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
  const btnSec: React.CSSProperties = { background: 'transparent', color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '10px 16px', fontFamily: SN, fontSize: 13, cursor: 'pointer' }

  // ── VISTA CREAR ──────────────────────────────────────────────────────────
  if (vista === 'crear') return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
        <button onClick={() => setVista('lista')} style={btnSec}>← Atrás</button>
        <h2 style={{ fontFamily: SE, fontSize: '1.2rem', color: C.ink, margin: 0 }}>Nuevo portal de cobro</h2>
      </div>

      {/* Datos del evento */}
      <div style={card}>
        <p style={{ fontFamily: SE, fontSize: '1rem', color: C.ink, margin: '0 0 1rem' }}>Datos del evento</p>
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Nombre del evento *</label>
          <input style={inp} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Congreso Empresarial Junio 2026" />
        </div>
        <div>
          <label style={lbl}>Descripción (opcional)</label>
          <input style={inp} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Información adicional para los invitados" />
        </div>
      </div>

      {/* Imagen y color */}
      <div style={card}>
        <p style={{ fontFamily: SE, fontSize: '1rem', color: C.ink, margin: '0 0 1rem' }}>Imagen y color del evento</p>

        {/* Upload imagen */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={lbl}>Imagen del evento (logo, cartel...)</label>
          <label style={{ display: 'block', border: `2px dashed ${C.rule}`, borderRadius: 12, padding: '1.25rem', textAlign: 'center', cursor: 'pointer', position: 'relative', background: C.paper, transition: 'border .2s' }}>
            <input type="file" accept="image/*" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
              onChange={e => { if (e.target.files?.[0]) uploadImagen(e.target.files[0]) }} />
            {imagenUrl ? (
              <div>
                <img src={imagenUrl} alt="preview" style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', margin: '0 auto .5rem', display: 'block', borderRadius: 8 }} />
                <span style={{ fontFamily: SN, fontSize: 12, color: C.green }}>✓ {imagenNombre}</span>
              </div>
            ) : subiendo ? (
              <span style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Subiendo...</span>
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                <span style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Pulsa para subir imagen</span>
                <p style={{ fontFamily: SN, fontSize: 11, color: C.ink4, margin: '4px 0 0' }}>JPG, PNG, SVG · Se mostrará en la página de pago</p>
              </div>
            )}
          </label>
        </div>

        {/* Color picker */}
        <div>
          <label style={lbl}>Color del evento</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {COLORES_PRESET.map(c => (
              <button key={c.hex} onClick={() => setColor(c.hex)} title={c.label}
                style={{ width: 36, height: 36, borderRadius: '50%', background: c.hex, border: color === c.hex ? `3px solid ${C.ink}` : `2px solid transparent`, cursor: 'pointer', transition: 'all .15s', flexShrink: 0 }} />
            ))}
            {/* Color personalizado */}
            <label title="Color personalizado" style={{ width: 36, height: 36, borderRadius: '50%', border: `2px dashed ${C.rule}`, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
              ✏️
            </label>
          </div>
          {/* Preview */}
          <div style={{ background: color, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            {imagenUrl && <img src={imagenUrl} alt="" style={{ height: 32, width: 32, objectFit: 'contain', borderRadius: 4 }} />}
            <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: colorContraste(color) }}>
              {titulo || 'Vista previa del evento'}
            </span>
            <span style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 12, fontWeight: 600,
              background: colorContraste(color) === '#F6F1E7' ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.1)',
              color: colorContraste(color), padding: '4px 12px', borderRadius: 20 }}>
              Pagar →
            </span>
          </div>
          <p style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 6 }}>Así se verá la cabecera de la página de pago que ven tus invitados</p>
        </div>
      </div>

      {/* Menús */}
      <div style={card}>
        <p style={{ fontFamily: SE, fontSize: '1rem', color: C.ink, margin: '0 0 1rem' }}>Opciones de menú</p>
        {items.map((item, i) => (
          <div key={i} style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '.875rem', marginBottom: '.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 32px', gap: 8, marginBottom: '.75rem', alignItems: 'center' }}>
              <input style={{ ...inp, padding: '9px 12px' }} value={item.nombre}
                onChange={e => updateItem(i, 'nombre', e.target.value)} placeholder={`Menú ${i + 1}`} />
              <div style={{ position: 'relative' }}>
                <input style={{ ...inp, padding: '9px 28px 9px 10px', textAlign: 'right' }} type="number" step="0.01"
                  value={item.precio_eur} onChange={e => updateItem(i, 'precio_eur', e.target.value)} placeholder="0.00" />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.ink4, fontSize: 13, pointerEvents: 'none' }}>€</span>
              </div>
              <button onClick={() => removeItem(i)} style={{ width: 32, height: 36, background: 'none', border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink3, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <label style={{ display: 'block', border: `1px dashed ${C.rule}`, borderRadius: 8, padding: '.625rem', textAlign: 'center', cursor: 'pointer', position: 'relative', background: C.bone }}>
              <input type="file" accept=".pdf" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                onChange={e => { if (e.target.files?.[0]) uploadPdf(i, e.target.files[0]) }} />
              <span style={{ fontFamily: SN, fontSize: 12, color: item.pdf_nombre ? C.green : C.ink4 }}>
                {item.pdf_nombre ? `✓ ${item.pdf_nombre}` : '📄 Adjuntar PDF del menú (opcional)'}
              </span>
            </label>
          </div>
        ))}
        <button onClick={addItem} style={{ ...btnSec, width: '100%', textAlign: 'center' }}>+ Añadir opción de menú</button>
      </div>

      {err && <p style={{ fontFamily: SN, fontSize: 13, color: C.red, marginBottom: '1rem' }}>{err}</p>}
      <button onClick={crear} disabled={guardando} style={{ ...btn, width: '100%', padding: 14, fontSize: 15 }}>
        {guardando ? 'Creando portal...' : 'Crear portal y generar link →'}
      </button>
    </div>
  )

  // ── VISTA LISTA ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '1rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: SE, fontSize: '1.3rem', color: C.ink, margin: '0 0 3px' }}>Cobros</h2>
          <p style={{ fontFamily: SN, fontSize: 12, color: C.ink3, margin: 0 }}>Portales de pago para eventos y congresos</p>
        </div>
        <button onClick={() => setVista('crear')} style={btn}>+ Nuevo portal</button>
      </div>

      {loading && <p style={{ fontFamily: SN, color: C.ink3, fontSize: 13 }}>Cargando...</p>}

      {!loading && portales.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: 32, marginBottom: '.75rem' }}>🔗</div>
          <p style={{ fontFamily: SE, fontSize: '1.1rem', color: C.ink, margin: '0 0 .5rem' }}>Sin portales todavía</p>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: '0 0 1.25rem' }}>Crea tu primer portal de cobro para un evento</p>
          <button onClick={() => setVista('crear')} style={btn}>Crear primer portal →</button>
        </div>
      )}

      {portales.map(portal => {
        const pagados = portal.cobros_grupo_pagos.filter(p => p.estado === 'pagado')
        const pendientes = portal.cobros_grupo_pagos.filter(p => p.estado === 'pendiente')
        const total = pagados.reduce((acc, p) => acc + Number(p.importe_eur), 0)
        const link = `${BASE_URL}/cobro/${portal.slug}`
        const cerrado = portal.estado === 'cerrado'
        const col = portal.color_primario || C.red
        const textCol = (() => {
          const r = parseInt(col.slice(1,3),16), g = parseInt(col.slice(3,5),16), b = parseInt(col.slice(5,7),16)
          return (r*299+g*587+b*114)/1000 > 128 ? '#1A1714' : '#F6F1E7'
        })()

        return (
          <div key={portal.id} style={{ ...card, opacity: cerrado ? 0.7 : 1, padding: 0, overflow: 'hidden' }}>
            {/* Header con color del evento */}
            <div style={{ background: col, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12 }}>
              {portal.imagen_url && (
                <img src={portal.imagen_url} alt={portal.titulo}
                  style={{ height: 44, width: 44, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,.15)', padding: 4, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ fontFamily: SE, fontSize: '1rem', color: textCol, margin: 0 }}>{portal.titulo}</h3>
                  <span style={{ fontFamily: SN, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: 'rgba(255,255,255,.2)', color: textCol, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {cerrado ? 'Cerrado' : 'Activo'}
                  </span>
                </div>
                <p style={{ fontFamily: SN, fontSize: 11, color: textCol, opacity: .75, margin: '2px 0 0' }}>
                  {portal.cobros_grupo_items.length} menús · {pagados.length} pagados · {pendientes.length} pendientes
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontFamily: SE, fontSize: '1.3rem', color: textCol, margin: 0, fontWeight: 500 }}>{total.toFixed(2)} €</p>
                <p style={{ fontFamily: SN, fontSize: 10, color: textCol, opacity: .7, margin: 0 }}>cobrado</p>
              </div>
            </div>

            <div style={{ padding: '1rem 1.25rem' }}>
              {/* Menús */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '.875rem' }}>
                {portal.cobros_grupo_items.map(item => (
                  <span key={item.id} style={{ fontFamily: SN, fontSize: 12, padding: '3px 10px',
                    background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 20, color: C.ink2 }}>
                    {item.nombre} · {Number(item.precio_eur).toFixed(2)}€
                    {item.pdf_url && <span style={{ color: C.red }}> 📄</span>}
                  </span>
                ))}
              </div>

              {/* Link */}
              <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '8px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: '.875rem', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{link}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => copiarLink(portal.slug)}
                    style={{ background: col, color: textCol, border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontFamily: SN, fontWeight: 600, cursor: 'pointer' }}>
                    {copiado === portal.slug ? '✓ Copiado' : 'Copiar link'}
                  </button>
                  <a href={link} target="_blank" style={{ ...btnSec, padding: '5px 10px', fontSize: 12, textDecoration: 'none' }}>↗</a>
                </div>
              </div>

              {/* Pagos */}
              {pagados.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: '.75rem' }}>
                  <span style={lbl}>Pagos recibidos</span>
                  {pagados.slice(0, 5).map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.rule}`, fontSize: 13, fontFamily: SN, color: C.ink2 }}>
                      <span>{p.nombre_pagador || 'Anónimo'}</span>
                      <span style={{ color: C.green, fontWeight: 600 }}>{Number(p.importe_eur).toFixed(2)} €</span>
                    </div>
                  ))}
                  {pagados.length > 5 && <p style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 6 }}>+{pagados.length - 5} más</p>}
                </div>
              )}

              {!cerrado && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.75rem' }}>
                  <button onClick={() => cerrar(portal.id)} style={{ ...btnSec, fontSize: 12, padding: '6px 12px' }}>Cerrar portal</button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
