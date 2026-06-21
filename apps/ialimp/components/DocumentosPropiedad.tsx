'use client'
import { useState } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

// Categorías de documentos del piso
const CATS: Record<string, { icon: string; label: string }> = {
  contrato:     { icon: '📝', label: 'Contrato alquiler/explotación' },
  licencia_vft: { icon: '🏛️', label: 'Licencia turística (VFT)' },
  seguro:       { icon: '🛡️', label: 'Seguro' },
  escritura:    { icon: '📜', label: 'Escritura / propiedad' },
  impuestos:    { icon: '📑', label: 'IBI / Impuestos' },
  cee:          { icon: '⚡', label: 'Certificado energético' },
  suministros:  { icon: '🔌', label: 'Suministros / contratos' },
  otros:        { icon: '📎', label: 'Otros' },
}
const CAT_ORDER = ['contrato', 'licencia_vft', 'seguro', 'escritura', 'impuestos', 'cee', 'suministros', 'otros']

export interface Documento {
  id: string; url: string; nombre: string; tipo: string; tamano: number; subido_at: string
  categoria: string; caducidad: string | null; compartido: boolean; notas?: string
}

interface Props {
  propiedadId: string
  propiedadNombre: string
  token?: string                 // requerido salvo en modo soloLectura
  documentosIniciales?: Documento[]
  soloLectura?: boolean          // vista de la empresa: solo los compartidos, sin editar
}

function fileIcon(tipo: string) {
  if (tipo?.startsWith('image/')) return '🖼️'
  if (tipo === 'application/pdf') return '📄'
  if (tipo?.startsWith('video/')) return '🎥'
  return '📎'
}
function formatBytes(b: number) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}
// Estado de caducidad: null | 'ok' | 'proximo' | 'vencido'
function estadoCaducidad(caducidad: string | null): 'ok' | 'proximo' | 'vencido' | null {
  if (!caducidad) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const cad = new Date(caducidad + 'T00:00:00')
  const dias = Math.round((cad.getTime() - hoy.getTime()) / 86400000)
  if (dias < 0) return 'vencido'
  if (dias <= 45) return 'proximo'
  return 'ok'
}
function badgeCaducidad(caducidad: string | null) {
  const e = estadoCaducidad(caducidad)
  if (!e) return null
  const f = new Date(caducidad + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  const cfg = {
    vencido: { bg: C.redBg,  color: C.red,  txt: `🔴 Caducó ${f}` },
    proximo: { bg: C.warnBg, color: C.warn, txt: `🟡 Caduca ${f}` },
    ok:      { bg: C.okBg,   color: C.ok,   txt: `✅ Válido hasta ${f}` },
  }[e]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>
      {cfg.txt}
    </span>
  )
}

export default function DocumentosPropiedad({
  propiedadId, propiedadNombre, token, documentosIniciales = [], soloLectura = false,
}: Props) {
  const [docs, setDocs]       = useState<Documento[]>(documentosIniciales)
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError]     = useState('')
  // formulario de subida
  const [categoria, setCategoria]   = useState('contrato')
  const [caducidad, setCaducidad]   = useState('')
  const [compartido, setCompartido] = useState(false)
  const [notas, setNotas]           = useState('')
  const [file, setFile]             = useState<File | null>(null)

  const visibles = soloLectura ? docs.filter(d => d.compartido) : docs

  async function subir() {
    if (!file) { setError('Elige un archivo'); return }
    setSubiendo(true); setError('')
    try {
      const fd = new FormData()
      fd.append('accion', 'add')
      fd.append('propiedad_id', propiedadId)
      fd.append('file', file)
      fd.append('categoria', categoria)
      fd.append('caducidad', caducidad)
      fd.append('compartido', String(compartido))
      fd.append('notas', notas)
      const r = await fetch(`/api/propietario/${token}/documentos-piso`, { method: 'POST', body: fd })
      const d = await r.json()
      if (d.ok) {
        setDocs(d.documentos || [])
        setFile(null); setCaducidad(''); setCompartido(false); setNotas(''); setAbierto(false)
      } else setError(d.error || 'Error al subir')
    } catch { setError('Error al subir el archivo') }
    setSubiendo(false)
  }

  async function eliminar(doc: Documento) {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return
    const fd = new FormData()
    fd.append('accion', 'remove'); fd.append('propiedad_id', propiedadId); fd.append('id', doc.id)
    const r = await fetch(`/api/propietario/${token}/documentos-piso`, { method: 'POST', body: fd })
    const d = await r.json()
    if (d.ok) setDocs(d.documentos || [])
  }

  async function toggleCompartido(doc: Documento) {
    const nuevo = !doc.compartido
    setDocs(docs.map(d => d.id === doc.id ? { ...d, compartido: nuevo } : d)) // optimista
    await fetch(`/api/propietario/${token}/documentos-piso`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propiedad_id: propiedadId, id: doc.id, compartido: nuevo }),
    })
  }

  async function editarCaducidad(doc: Documento) {
    const v = prompt('Fecha de caducidad (AAAA-MM-DD). Vacío = sin caducidad.', doc.caducidad || '')
    if (v === null) return
    const val = v.trim()
    if (val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) { alert('Formato no válido. Usa AAAA-MM-DD.'); return }
    setDocs(docs.map(d => d.id === doc.id ? { ...d, caducidad: val || null } : d))
    await fetch(`/api/propietario/${token}/documentos-piso`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propiedad_id: propiedadId, id: doc.id, caducidad: val || null }),
    })
  }

  // Agrupar por categoría en el orden definido
  const porCat = CAT_ORDER
    .map(cat => ({ cat, items: visibles.filter(d => (d.categoria || 'otros') === cat) }))
    .filter(g => g.items.length > 0)

  // ── Vista empresa (solo lectura) ──
  if (soloLectura) {
    if (visibles.length === 0) return null
    return (
      <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: C.text, marginBottom: 8 }}>
          📄 Documentos compartidos · {propiedadNombre}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibles.map(doc => (
            <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', textDecoration: 'none' }}>
              <span style={{ fontSize: 20 }}>{CATS[doc.categoria]?.icon || '📎'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nombre}</div>
                <div style={{ fontSize: 11, color: C.muted, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  <span>{CATS[doc.categoria]?.label || 'Otros'}</span>{badgeCaducidad(doc.caducidad)}
                </div>
              </div>
              <span style={{ fontSize: 14, color: C.primary }}>↗</span>
            </a>
          ))}
        </div>
      </div>
    )
  }

  // ── Vista propietario (editable) ──
  return (
    <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ background: visibles.length ? C.light : C.bg, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{propiedadNombre}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            📄 {visibles.length ? `${visibles.length} documento(s)` : 'Sin documentos todavía'}
          </div>
        </div>
        <button onClick={() => setAbierto(v => !v)}
          style={{ background: C.primary, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {abierto ? 'Cerrar' : '+ Añadir'}
        </button>
      </div>

      {/* Formulario de subida */}
      {abierto && (
        <div style={{ padding: '16px', borderTop: `1px solid ${C.border}` }}>
          {error && <div style={{ background: C.redBg, border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: C.red }}>{error}</div>}

          <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Tipo de documento</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {CAT_ORDER.map(cat => (
              <button key={cat} onClick={() => setCategoria(cat)}
                style={{ padding: '6px 10px', borderRadius: 20, border: `2px solid ${categoria === cat ? C.primary : C.border}`,
                  background: categoria === cat ? C.light : 'white', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 11, fontWeight: categoria === cat ? 700 : 500, color: categoria === cat ? C.primary : C.muted }}>
                {CATS[cat].icon} {CATS[cat].label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Caducidad (opcional)</label>
              <input type="date" value={caducidad} onChange={e => setCaducidad(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Notas (opcional)</label>
              <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Nº póliza, referencia…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Compartir con la empresa */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: compartido ? C.light : C.bg, border: `2px solid ${compartido ? C.primary : C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={compartido} onChange={e => setCompartido(e.target.checked)} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: compartido ? C.primary : C.text }}>Compartir con la empresa de limpieza</div>
              <div style={{ fontSize: 11, color: C.muted }}>Si lo dejas sin marcar, el documento es privado (solo tú lo ves).</div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', border: `2px dashed ${file ? C.primary : C.border}`, borderRadius: 10, cursor: 'pointer', background: C.bg, color: file ? C.primary : C.muted, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            <input type="file" accept="image/*,.pdf,video/*,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            {file ? `📎 ${file.name}` : '📎 Elegir archivo (foto, PDF, Word… máx 20MB)'}
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setAbierto(false); setError('') }}
              style={{ flex: 1, padding: '12px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Cancelar</button>
            <button onClick={subir} disabled={subiendo}
              style={{ flex: 2, padding: '12px', background: C.primary, border: 'none', borderRadius: 10, fontSize: 14, color: 'white', cursor: subiendo ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 700, opacity: subiendo ? .6 : 1 }}>
              {subiendo ? 'Subiendo…' : '💾 Guardar documento'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de documentos agrupada por categoría */}
      {visibles.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
          {porCat.map(({ cat, items }) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                {CATS[cat].icon} {CATS[cat].label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
                    <span style={{ fontSize: 22 }}>{fileIcon(doc.tipo)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nombre}</div>
                      <div style={{ fontSize: 11, color: C.muted, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                        {formatBytes(doc.tamano)}
                        {badgeCaducidad(doc.caducidad)}
                        <button onClick={() => editarCaducidad(doc)} style={{ background: 'none', border: 'none', color: C.primary, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 700 }}>
                          {doc.caducidad ? 'editar fecha' : '+ caducidad'}
                        </button>
                      </div>
                      {doc.notas && <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 2 }}>{doc.notas}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <button onClick={() => toggleCompartido(doc)} title={doc.compartido ? 'Compartido con la empresa' : 'Privado'}
                        style={{ background: doc.compartido ? C.light : 'white', border: `1px solid ${doc.compartido ? C.primary : C.border}`, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: doc.compartido ? C.primary : C.muted, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {doc.compartido ? '👁 Compartido' : '🔒 Privado'}
                      </button>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: 'none' }}>Ver</a>
                        <button onClick={() => eliminar(doc)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 15, cursor: 'pointer', padding: 0 }}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
