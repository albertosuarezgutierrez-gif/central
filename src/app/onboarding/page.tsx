'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

/* ── Design tokens ─────────────────────────────────────────── */
const C = {
  bg:     '#14110E',
  e1:     '#1F1A15',
  e2:     '#2A241D',
  e3:     '#352E25',
  fg:     '#F6F1E7',
  fg2:    '#D8CDB6',
  fg3:    '#9A8D7C',
  rule:   '#2F2820',
  rule2:  '#3D342A',
  red:    '#D9442B',
  redD:   '#A8311E',
  redS:   '#3D1B12',
  amber:  '#E8A33B',
  amberS: '#2D2010',
  green:  '#3F7D44',
  greenS: '#152418',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

/* ── Types ────────────────────────────────────────────────── */
type ProductoExtraido = {
  nombre:      string
  descripcion: string | null
  precio:      number | null
  categoria:   string
  alergenos:   string[]
  _idx:        number
}

type NuevoPersonal = {
  nombre: string
  rol:    string
  pin:    string
  _id:    number
}

type Zona = {
  nombre:  string
  prefijo: string
  tipo:    string
  count:   number
  _id:     number
}

/* ── Helpers ────────────────────────────────────────────────── */
const Icon = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>
  </svg>
)
const ICONS = {
  upload:  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  photo:   'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  x:       'M18 6 6 18M6 6l12 12',
  check:   'M20 6 9 17l-5-5',
  plus:    'M12 5v14M5 12h14',
  edit:    'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  trash:   'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  spark:   'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z',
  users:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  chef:    'M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6zM6 17h12',
  screen:  'M2 3h20a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 21h8M12 17v4',
  alert:   'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  map:     'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15',
  arrow:   'M5 12h14M12 5l7 7-7 7',
  book:    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  mic:     'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  bell:    'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  grid:    'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
}

const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 56 56">
    <rect width="56" height="56" rx="8" fill="#1F1A15"/>
    <g transform="translate(11,14)">
      <rect x="0"  y="11" width="3" height="6"  rx="1.5" fill="#F6F1E7"/>
      <rect x="6"  y="6"  width="3" height="16" rx="1.5" fill="#F6F1E7"/>
      <rect x="12" y="0"  width="3" height="28" rx="1.5" fill="#D9442B"/>
      <rect x="18" y="3"  width="3" height="22" rx="1.5" fill="#F6F1E7"/>
      <rect x="24" y="9"  width="3" height="10" rx="1.5" fill="#F6F1E7"/>
      <rect x="30" y="12" width="3" height="4"  rx="1.5" fill="#F6F1E7"/>
    </g>
  </svg>
)

/* ── ALÉRGENOS EU ─────────────────────────────────────────── */
const ALERGENOS_EU = [
  'Gluten','Crustáceos','Huevo','Pescado','Cacahuetes','Soja',
  'Lácteos','Frutos de cáscara','Apio','Mostaza','Sésamo',
  'Dióxido de azufre','Altramuces','Moluscos',
]

/* ══════════════════════════════════════════════════════════
   STEP 1 — CARTA
══════════════════════════════════════════════════════════ */
function StepCarta({ session, onNext }: { session: any; onNext: () => void }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [phase, setPhase] = useState<'upload' | 'loading' | 'review' | 'saving' | 'done'>('upload')
  const [productos, setProductos] = useState<ProductoExtraido[]>([])
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const loadingMsgs = ['Leyendo la carta…', 'Identificando platos…', 'Extrayendo precios…', 'Detectando alérgenos…', 'Organizando categorías…']
  const [loadingIdx, setLoadingIdx] = useState(0)
  const loadingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (phase === 'loading') {
      loadingRef.current = setInterval(() => setLoadingIdx(i => (i + 1) % loadingMsgs.length), 1800)
    } else {
      if (loadingRef.current) clearInterval(loadingRef.current)
    }
    return () => { if (loadingRef.current) clearInterval(loadingRef.current) }
  }, [phase])

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return
    const arr = Array.from(newFiles).filter(f => f.type.startsWith('image/'))
    const combined = [...files, ...arr].slice(0, 15)
    setFiles(combined)
    const readers = combined.map(f => new Promise<string>(res => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.readAsDataURL(f)
    }))
    Promise.all(readers).then(setPreviews)
    setError('')
  }

  const removeFile = (i: number) => {
    const nf = files.filter((_, j) => j !== i)
    const np = previews.filter((_, j) => j !== i)
    setFiles(nf)
    setPreviews(np)
  }

  const analizar = async () => {
    if (!files.length) { setError('Sube al menos una foto'); return }
    setPhase('loading')
    setError('')
    try {
      const images = await Promise.all(previews.map(async (p) => ({
        data: p.split(',')[1],
        mediaType: p.split(';')[0].replace('data:', ''),
      })))
      const r = await fetch('/api/onboarding/extract-carta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ images }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al analizar')
      setProductos((d.productos || []).map((p: any, i: number) => ({ ...p, _idx: i })))
      setPhase('review')
    } catch (e: any) {
      setError(e.message)
      setPhase('upload')
    }
  }

  const updateProducto = (idx: number, field: string, value: any) => {
    setProductos(ps => ps.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  const removeProducto = (idx: number) => {
    setProductos(ps => ps.filter((_, i) => i !== idx))
  }

  const addProducto = () => {
    setProductos(ps => [...ps, { nombre: '', descripcion: null, precio: null, categoria: 'Sin categoría', alergenos: [], _idx: Date.now() }])
  }

  const guardar = async () => {
    if (!productos.length) { onNext(); return }
    setPhase('saving')
    setError('')
    try {
      const r = await fetch('/api/owner/carta?action=bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ productos }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al guardar')
      setSaved(d.productos?.length ?? productos.length)
      setPhase('done')
      setTimeout(onNext, 1200)
    } catch (e: any) {
      setError(e.message)
      setPhase('review')
    }
  }

  if (phase === 'done') return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenS, border: '2px solid ' + C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: C.green }}>
        <Icon d={ICONS.check} size={28}/>
      </div>
      <p style={{ fontFamily: SE, fontSize: 24, fontStyle: 'italic', color: C.fg, margin: '0 0 8px' }}>
        {saved} productos guardados
      </p>
      <p style={{ fontFamily: SC, fontSize: 18, color: C.fg3 }}>Pasando al siguiente paso…</p>
    </div>
  )

  if (phase === 'loading') return (
    <div style={{ textAlign: 'center', padding: '64px 0' }}>
      <div style={{ display: 'inline-flex', gap: 6, marginBottom: 32 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: C.red, opacity: 0.3,
            animation: 'loadDot 1.2s ease-in-out ' + (i * 0.2) + 's infinite',
          }}/>
        ))}
      </div>
      <p style={{ fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: C.fg, margin: '0 0 12px' }}>
        {loadingMsgs[loadingIdx]}
      </p>
      <p style={{ fontFamily: SC, fontSize: 17, color: C.fg3, margin: 0 }}>
        Leyendo {files.length} {files.length === 1 ? 'página' : 'páginas'} a la vez
      </p>
    </div>
  )

  if (phase === 'review') return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontFamily: SM, fontSize: 12, color: C.red, background: C.redS, padding: '3px 10px', borderRadius: 20 }}>
            {productos.length} productos detectados
          </span>
        </div>
        <button onClick={addProducto} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid ' + C.rule2, color: C.fg2, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: SN, fontSize: 13 }}>
          <Icon d={ICONS.plus} size={14}/> Añadir manual
        </button>
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto', borderRadius: 10, border: '1px solid ' + C.rule }}>
        {productos.map((p, idx) => (
          <div key={p._idx} style={{ padding: '12px 16px', borderBottom: idx < productos.length - 1 ? '1px solid ' + C.rule : 'none', background: editIdx === idx ? C.e2 : 'transparent' }}>
            {editIdx === idx ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={p.nombre} onChange={e => updateProducto(idx, 'nombre', e.target.value)}
                    placeholder="Nombre del producto"
                    style={{ background: C.e3, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 6, padding: '7px 10px', fontFamily: SN, fontSize: 14, outline: 'none' }}/>
                  <input value={p.precio ?? ''} onChange={e => updateProducto(idx, 'precio', e.target.value ? parseFloat(e.target.value) : null)}
                    type="number" step="0.01" placeholder="Precio (€)"
                    style={{ background: C.e3, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 6, padding: '7px 10px', fontFamily: SN, fontSize: 14, outline: 'none' }}/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={p.categoria} onChange={e => updateProducto(idx, 'categoria', e.target.value)}
                    placeholder="Categoría"
                    style={{ background: C.e3, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 6, padding: '7px 10px', fontFamily: SN, fontSize: 14, outline: 'none' }}/>
                  <input value={p.descripcion ?? ''} onChange={e => updateProducto(idx, 'descripcion', e.target.value || null)}
                    placeholder="Descripción (opcional)"
                    style={{ background: C.e3, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 6, padding: '7px 10px', fontFamily: SN, fontSize: 14, outline: 'none' }}/>
                </div>
                <div>
                  <p style={{ fontFamily: SN, fontSize: 12, color: C.fg3, margin: '0 0 6px' }}>Alérgenos:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {ALERGENOS_EU.map(a => {
                      const active = p.alergenos.includes(a)
                      return (
                        <button key={a} onClick={() => updateProducto(idx, 'alergenos', active ? p.alergenos.filter((x: string) => x !== a) : [...p.alergenos, a])}
                          style={{ padding: '3px 8px', borderRadius: 20, border: '1px solid ' + (active ? C.amber : C.rule2), background: active ? C.amberS : 'transparent', color: active ? C.amber : C.fg3, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                          {a}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => setEditIdx(null)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid ' + C.rule2, background: 'none', color: C.fg2, fontFamily: SN, fontSize: 13, cursor: 'pointer' }}>Listo</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: SN, fontSize: 15, fontWeight: 600, color: C.fg }}>{p.nombre || <em style={{ color: C.fg3 }}>sin nombre</em>}</span>
                    <span style={{ fontFamily: SM, fontSize: 12, color: C.red }}>{p.precio != null ? `${p.precio.toFixed(2)} €` : '—'}</span>
                    <span style={{ fontFamily: SN, fontSize: 11, color: C.fg3, background: C.e2, padding: '2px 7px', borderRadius: 20 }}>{p.categoria}</span>
                  </div>
                  {p.alergenos.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {p.alergenos.map((a: string) => (
                        <span key={a} style={{ fontFamily: SN, fontSize: 10, color: C.amber, background: C.amberS, padding: '1px 6px', borderRadius: 20 }}>⚠ {a}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setEditIdx(idx)} style={{ background: C.e2, border: 'none', color: C.fg3, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>
                    <Icon d={ICONS.edit} size={14}/>
                  </button>
                  <button onClick={() => removeProducto(idx)} style={{ background: C.e2, border: 'none', color: C.fg3, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>
                    <Icon d={ICONS.trash} size={14}/>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p style={{ fontFamily: SN, fontSize: 13, color: '#F07060', marginTop: 12 }}>⚠ {error}</p>}

      <div className="ob-btns" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 12 }}>
        <button onClick={() => { setPhase('upload'); setFiles([]); setPreviews([]) }}
          style={{ background: 'none', border: '1px solid ' + C.rule2, color: C.fg2, borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontFamily: SN, fontSize: 14 }}>
          ← Nueva foto
        </button>
        <button onClick={guardar} disabled={(phase as string) === 'saving'}
          style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontFamily: SN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          {(phase as string) === 'saving' ? 'Guardando…' : `Guardar ${productos.length} productos →`}
        </button>
      </div>
    </div>
  )

  /* Upload phase */
  return (
    <div>
      <div
        className="ob-upload"
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: '2px dashed ' + (dragging ? C.red : C.rule2),
          borderRadius: 14,
          padding: '36px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? C.redS : C.e1,
          transition: 'all .2s',
          marginBottom: 16,
        }}>
        <div style={{ color: C.fg3, marginBottom: 12 }}><Icon d={ICONS.photo} size={36}/></div>
        <p style={{ fontFamily: SE, fontSize: 20, fontStyle: 'italic', color: C.fg, margin: '0 0 6px' }}>
          Arrastra las fotos aquí
        </p>
        <p style={{ fontFamily: SC, fontSize: 16, color: C.fg3, margin: 0 }}>
          o pulsa para seleccionar — todas las páginas a la vez
        </p>
        <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}/>
      </div>

      {previews.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {previews.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid ' + C.rule2 }}/>
              <button onClick={e => { e.stopPropagation(); removeFile(i) }}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: C.e3, border: '1px solid ' + C.rule2, color: C.fg3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                <Icon d={ICONS.x} size={10}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ fontFamily: SN, fontSize: 13, color: '#F07060', marginBottom: 12 }}>⚠ {error}</p>}

      <div className="ob-btns" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <button onClick={onNext}
          style={{ background: 'none', border: 'none', color: C.fg3, fontFamily: SN, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
          Añadiré la carta después
        </button>
        <button onClick={analizar} disabled={!files.length}
          style={{ background: files.length ? C.red : C.e2, border: 'none', color: files.length ? '#fff' : C.fg3, borderRadius: 8, padding: '11px 24px', cursor: files.length ? 'pointer' : 'default', fontFamily: SN, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'all .2s' }}>
          <Icon d={ICONS.spark} size={16}/> Analizar con IA
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   STEP 2 — PERSONAL
══════════════════════════════════════════════════════════ */
const ROL_INFO = [
  { rol: 'camarero',  label: 'Camarero',     icon: ICONS.mic,     desc: 'Toma comandas por voz desde el móvil. Su pantalla: /edge.' },
  { rol: 'cocina',    label: 'Cocina',        icon: ICONS.chef,    desc: 'Ve los tickets en la pantalla de cocina (KDS). Su pantalla: /kds.' },
  { rol: 'jefe_sala', label: 'Jefe de Sala',  icon: ICONS.screen,  desc: 'Supervisión de sala: ve todas las mesas, no puede editar carta.' },
  { rol: 'running',   label: 'Running',       icon: ICONS.arrow,   desc: 'Lleva bandejas entre cocina y sala. Ve órdenes de marchar.' },
]

function StepPersonal({ session, onNext }: { session: any; onNext: () => void }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [personal, setPersonal] = useState<NuevoPersonal[]>([])
  const [form, setForm] = useState({ nombre: '', rol: 'camarero', pin: '' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<number[]>([])

  const pinRef = useRef<HTMLInputElement>(null)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.nombre.trim()) e.nombre = 'Escribe el nombre'
    if (!/^\d{4}$/.test(form.pin)) e.pin = 'PIN de 4 dígitos'
    if (personal.some(p => p.pin === form.pin && !saved.includes(p._id))) e.pin = 'PIN ya usado'
    return e
  }

  const addPersonal = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setPersonal(ps => [...ps, { ...form, _id: Date.now() }])
    setForm({ nombre: '', rol: 'camarero', pin: '' })
    setErrors({})
  }

  const removePersonal = (id: number) => setPersonal(ps => ps.filter(p => p._id !== id))

  const guardarTodo = async () => {
    if (!personal.length) { onNext(); return }
    setSaving(true)
    const results = await Promise.allSettled(personal.filter(p => !saved.includes(p._id)).map(p =>
      fetch('/api/owner/camareros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ nombre: p.nombre, pin: p.pin, rol: p.rol }),
      }).then(r => r.json()).then(d => ({ p, d }))
    ))
    const newSaved = results.filter(r => r.status === 'fulfilled' && !(r.value as any).d.error).map(r => (r as any).value.p._id)
    setSaved(s => [...s, ...newSaved])
    setSaving(false)
    setTimeout(onNext, 600)
  }

  return (
    <div>
      {/* Role cards */}
      <div className="ob-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
        {ROL_INFO.map(r => (
          <div key={r.rol} style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ color: C.red }}><Icon d={r.icon} size={16}/></div>
              <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.fg }}>{r.label}</span>
            </div>
            <p style={{ fontFamily: SN, fontSize: 12, color: C.fg3, margin: 0, lineHeight: 1.5 }}>{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
        <p style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.fg2, margin: '0 0 12px' }}>Añadir persona</p>
        <div className="ob-grid-imp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 10, marginBottom: 10 }}>
          <div>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && pinRef.current?.focus()}
              placeholder="Nombre (Marta, Iván…)"
              style={{ width: '100%', background: C.e2, border: '1px solid ' + (errors.nombre ? '#F07060' : C.rule2), color: C.fg, borderRadius: 7, padding: '9px 12px', fontFamily: SN, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}/>
            {errors.nombre && <p style={{ fontFamily: SN, fontSize: 11, color: '#F07060', margin: '4px 0 0' }}>{errors.nombre}</p>}
          </div>
          <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
            style={{ width: '100%', background: C.e2, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 7, padding: '9px 12px', fontFamily: SN, fontSize: 14, outline: 'none', cursor: 'pointer' }}>
            {ROL_INFO.map(r => <option key={r.rol} value={r.rol}>{r.label}</option>)}
          </select>
          <div>
            <input ref={pinRef} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              onKeyDown={e => e.key === 'Enter' && addPersonal()}
              placeholder="PIN" maxLength={4} inputMode="numeric"
              style={{ width: '100%', background: C.e2, border: '1px solid ' + (errors.pin ? '#F07060' : C.rule2), color: C.fg, borderRadius: 7, padding: '9px 12px', fontFamily: SM, fontSize: 16, outline: 'none', letterSpacing: 4, boxSizing: 'border-box' }}/>
            {errors.pin && <p style={{ fontFamily: SN, fontSize: 11, color: '#F07060', margin: '4px 0 0' }}>{errors.pin}</p>}
          </div>
        </div>
        <button onClick={addPersonal}
          style={{ background: C.e2, border: '1px solid ' + C.rule2, color: C.fg2, borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontFamily: SN, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon d={ICONS.plus} size={14}/> Añadir a la lista
        </button>
      </div>

      {/* List */}
      {personal.length > 0 && (
        <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {personal.map((p, i) => {
            const info = ROL_INFO.find(r => r.rol === p.rol)
            const isSaved = saved.includes(p._id)
            return (
              <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < personal.length - 1 ? '1px solid ' + C.rule : 'none', background: isSaved ? C.greenS : 'transparent' }}>
                <div style={{ color: isSaved ? C.green : C.fg3 }}><Icon d={info?.icon || ICONS.users} size={16}/></div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.fg }}>{p.nombre}</span>
                  <span style={{ fontFamily: SN, fontSize: 12, color: C.fg3, marginLeft: 8 }}>{info?.label}</span>
                </div>
                <span style={{ fontFamily: SM, fontSize: 16, color: C.fg2, letterSpacing: 3 }}>{p.pin}</span>
                {!isSaved && (
                  <button onClick={() => removePersonal(p._id)}
                    style={{ background: 'none', border: 'none', color: C.fg3, cursor: 'pointer', padding: 4 }}>
                    <Icon d={ICONS.trash} size={14}/>
                  </button>
                )}
                {isSaved && <div style={{ color: C.green }}><Icon d={ICONS.check} size={16}/></div>}
              </div>
            )
          })}
        </div>
      )}

      <div className="ob-btns" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onNext}
          style={{ background: 'none', border: 'none', color: C.fg3, fontFamily: SN, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
          Añadiré el personal después
        </button>
        <button onClick={guardarTodo} disabled={saving}
          style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 8, padding: '11px 24px', cursor: 'pointer', fontFamily: SN, fontSize: 14, fontWeight: 600 }}>
          {saving ? 'Guardando…' : personal.length > 0 ? `Guardar ${personal.length} personas →` : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   STEP 3 — COCINA Y FLUJOS
══════════════════════════════════════════════════════════ */
function StepCocina({ onNext }: { onNext: () => void }) {
  const cards = [
    {
      icon:  ICONS.screen,
      color: C.red,
      title: 'KDS — Pantalla de cocina',
      body:  'Cuando un camarero confirma una comanda, el ticket aparece al instante en la pantalla de cocina. Sin papel. Sin gritos. Cada partida (calientes, fría, barra) tiene su propio filtro.',
      tip:   'El cocinero pulsa cada ítem al prepararlo. Cuando está todo listo, pulsa "Marchar" y el camarero recibe una notificación en el móvil.',
    },
    {
      icon:  ICONS.alert,
      color: C.amber,
      title: 'Sistema 86 — Agotado',
      body:  'Si se acaba un plato, di "86 la paella" o márcalo desde la pantalla. A partir de ese momento, si alguien intenta pedirlo, el sistema avisa antes de confirmar.',
      tip:   'El 86 se resetea automáticamente al abrir el siguiente turno.',
    },
    {
      icon:  ICONS.users,
      color: '#5B8FD4',
      title: 'Alérgenos EU 1169/2011',
      body:  'Antes de tomar una comanda, el camarero puede pulsar ALERG y marcar las alergias del cliente. Si hay conflicto con un plato, el sistema avisa en voz alta antes de confirmar.',
      tip:   'Todo queda registrado con timestamp en base de datos para trazabilidad legal.',
    },
    {
      icon:  ICONS.bell,
      color: C.green,
      title: 'Notificaciones push',
      body:  'Cuando cocina marca una mesa como lista, el camarero asignado recibe una notificación en su móvil aunque tenga la pantalla apagada.',
      tip:   'Requiere que el camarero acepte los permisos de notificaciones la primera vez que entra a /edge.',
    },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${c.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color, flexShrink: 0 }}>
                <Icon d={c.icon} size={17}/>
              </div>
              <span style={{ fontFamily: SN, fontSize: 15, fontWeight: 600, color: C.fg }}>{c.title}</span>
            </div>
            <p style={{ fontFamily: SN, fontSize: 14, color: C.fg2, margin: '0 0 8px', lineHeight: 1.6 }}>{c.body}</p>
            <p style={{ fontFamily: SC, fontSize: 15, color: C.fg3, margin: 0 }}>💡 {c.tip}</p>
          </div>
        ))}
      </div>

      {/* Flow diagram */}
      <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
        <p style={{ fontFamily: SN, fontSize: 12, color: C.fg3, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>El viaje de un pedido</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Camarero habla', color: '#2B6A6E' },
            { label: 'EAR transcribe', color: '#2B6A6E' },
            { label: 'BRAIN interpreta', color: C.amber },
            { label: 'COURIER enruta', color: C.red },
            { label: 'Ticket en cocina', color: C.green },
            { label: 'VOX confirma', color: C.green },
          ].map((s, i, arr) => (
            <React.Fragment key={i}>
              <div style={{ background: `${s.color}20`, border: '1px solid ' + s.color + '40', borderRadius: 8, padding: '6px 12px', fontFamily: SN, fontSize: 12, color: s.color, whiteSpace: 'nowrap' }}>
                {s.label}
              </div>
              {i < arr.length - 1 && <span style={{ color: C.fg3, fontSize: 10 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <p style={{ fontFamily: SC, fontSize: 15, color: C.fg3, margin: '10px 0 0' }}>Objetivo: menos de 0.5 segundos desde que sueltas el botón</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onNext}
          style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 8, padding: '11px 24px', cursor: 'pointer', fontFamily: SN, fontSize: 14, fontWeight: 600 }}>
          Entendido →
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   STEP 4 — SECCIONES DE COCINA
══════════════════════════════════════════════════════════ */
const SECCIONES_PRESET = [
  { nombre: 'Cocina caliente', color: '#D9442B', icono: '🔥' },
  { nombre: 'Cocina fría',     color: '#2B6A6E', icono: '❄️' },
  { nombre: 'Barra',           color: '#E8A33B', icono: '🍺' },
  { nombre: 'Postres',         color: '#9B6CC9', icono: '🍮' },
]

function StepSecciones({ onNext }: { onNext: () => void }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [secciones, setSecciones] = useState<{ nombre: string; color: string; icono: string; _id: number }[]>([])
  const [form, setForm] = useState({ nombre: '', color: C.red })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const añadir = () => {
    if (!form.nombre.trim()) return
    if (secciones.some(s => s.nombre.toLowerCase() === form.nombre.trim().toLowerCase())) {
      setError('Ya existe una sección con ese nombre'); return
    }
    setSecciones(ss => [...ss, { nombre: form.nombre.trim(), color: form.color, icono: '', _id: Date.now() }])
    setForm({ nombre: '', color: C.red })
    setError('')
  }

  const añadirPreset = (p: typeof SECCIONES_PRESET[0]) => {
    if (secciones.some(s => s.nombre === p.nombre)) return
    setSecciones(ss => [...ss, { ...p, _id: Date.now() }])
  }

  const guardar = async () => {
    setSaving(true); setError('')
    try {
      for (const s of secciones) {
        const r = await fetch('/api/owner/secciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...sh() },
          body: JSON.stringify({ nombre: s.nombre, color_kds: s.color }),
        })
        if (!r.ok) throw new Error((await r.json()).error || 'Error')
      }
      setDone(true)
      setTimeout(onNext, 1000)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenS, border: '2px solid ' + C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: C.green }}>
        <Icon d={ICONS.check} size={28}/>
      </div>
      <p style={{ fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: C.fg, margin: '0 0 6px' }}>{secciones.length} secciones creadas</p>
      <p style={{ fontFamily: SC, fontSize: 17, color: C.fg3 }}>El KDS ya sabe a quién va cada ticket</p>
    </div>
  )

  return (
    <div>
      {/* Explicación */}
      <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
        <p style={{ fontFamily: SN, fontSize: 14, color: C.fg2, margin: '0 0 6px', lineHeight: 1.6 }}>
          Las secciones son las <strong style={{ color: C.fg }}>partidas de tu cocina</strong>. Cada sección tiene su propia pantalla KDS.
          Cuando el camarero manda una comanda, el sistema enruta cada plato a la sección correcta automáticamente.
        </p>
        <p style={{ fontFamily: SC, fontSize: 15, color: C.fg3, margin: 0 }}>
          💡 Un restaurante pequeño puede funcionar con una sola sección "Cocina"
        </p>
      </div>

      {/* Presets rápidos */}
      <p style={{ fontFamily: SN, fontSize: 12, color: C.fg3, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Plantillas habituales</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {SECCIONES_PRESET.map(p => {
          const ya = secciones.some(s => s.nombre === p.nombre)
          return (
            <button key={p.nombre} onClick={() => añadirPreset(p)} disabled={ya}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: '1px solid ' + (ya ? C.rule : p.color), background: ya ? C.e1 : `${p.color}18`, color: ya ? C.fg3 : p.color, fontFamily: SN, fontSize: 13, cursor: ya ? 'default' : 'pointer', transition: 'all .15s' }}>
              {p.icono} {p.nombre} {ya && '✓'}
            </button>
          )
        })}
      </div>

      {/* Formulario manual */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={form.nombre} onChange={e => { setForm(f => ({ ...f, nombre: e.target.value })); setError('') }}
          onKeyDown={e => e.key === 'Enter' && añadir()}
          placeholder="Nombre de sección personalizada"
          style={{ flex: 1, background: C.e2, border: '1px solid ' + (error ? '#F07060' : C.rule2), color: C.fg, borderRadius: 8, padding: '9px 12px', fontFamily: SN, fontSize: 14, outline: 'none' }}/>
        <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
          style={{ width: 42, height: 40, border: '1px solid ' + C.rule2, borderRadius: 8, background: C.e2, cursor: 'pointer', padding: 4 }}/>
        <button onClick={añadir}
          style={{ background: C.e2, border: '1px solid ' + C.rule2, color: C.fg2, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontFamily: SN, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon d={ICONS.plus} size={14}/> Añadir
        </button>
      </div>
      {error && <p style={{ fontFamily: SN, fontSize: 12, color: '#F07060', margin: '-4px 0 12px' }}>⚠ {error}</p>}

      {/* Lista */}
      {secciones.length > 0 && (
        <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          {secciones.map((s, i) => (
            <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < secciones.length - 1 ? '1px solid ' + C.rule : 'none' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
              <span style={{ fontFamily: SN, fontSize: 14, color: C.fg, flex: 1 }}>{s.nombre}</span>
              <button onClick={() => setSecciones(ss => ss.filter(x => x._id !== s._id))}
                style={{ background: 'none', border: 'none', color: C.fg3, cursor: 'pointer', padding: 4 }}>
                <Icon d={ICONS.x} size={14}/>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ob-btns" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onNext}
          style={{ background: 'none', border: 'none', color: C.fg3, fontFamily: SN, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
          Configuraré las secciones después
        </button>
        <button onClick={secciones.length ? guardar : onNext} disabled={saving}
          style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 8, padding: '11px 24px', cursor: 'pointer', fontFamily: SN, fontSize: 14, fontWeight: 600 }}>
          {saving ? 'Guardando…' : secciones.length > 0 ? `Crear ${secciones.length} sección${secciones.length > 1 ? 'es' : ''} →` : 'Siguiente →'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   STEP 5 — IMPRESORAS
══════════════════════════════════════════════════════════ */
function StepImpresoras({ onNext }: { onNext: () => void }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [secciones, setSecciones] = useState<{ id: string; nombre: string }[]>([])
  const [tipo, setTipo] = useState<'cloud' | 'tcp'>('cloud')
  const [form, setForm] = useState({ nombre: 'Impresora cocina', seccion_id: '', cloud_device_id: '', ip_address: '', port: '9100' })
  const [impresoras, setImpresoras] = useState<{ nombre: string; seccion_id: string; tipo: 'cloud' | 'tcp'; cloud_device_id: string; ip_address: string; port: string; _id: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/owner/secciones', { headers: sh() }).then(r => r.json())
      .then(d => {
        setSecciones(d.secciones || [])
        if (d.secciones?.length) setForm(f => ({ ...f, seccion_id: d.secciones[0].id }))
      })
  }, [])

  const añadir = () => {
    if (!form.nombre.trim() || !form.seccion_id) { setError('Nombre y sección son obligatorios'); return }
    if (tipo === 'cloud' && !form.cloud_device_id.trim()) { setError('Introduce el Device ID CloudPRNT'); return }
    if (tipo === 'tcp' && !form.ip_address.trim()) { setError('Introduce la IP de la impresora'); return }
    setImpresoras(ps => [...ps, { ...form, tipo, cloud_device_id: form.cloud_device_id.trim().toUpperCase(), _id: Date.now() }])
    setForm(f => ({ ...f, nombre: '', cloud_device_id: '', ip_address: '' }))
    setError('')
  }

  const guardar = async () => {
    setSaving(true)
    try {
      for (const p of impresoras) {
        const body: Record<string, unknown> = { nombre: p.nombre, seccion_id: p.seccion_id, connection_type: p.tipo === 'tcp' ? 'tcp' : 'epson_epos' }
        if (p.tipo === 'tcp') { body.ip_address = p.ip_address; body.port = Number(p.port) || 9100 }
        else body.cloud_device_id = p.cloud_device_id
        const r = await fetch('/api/owner/impresoras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...sh() },
          body: JSON.stringify(body),
        })
        if (!r.ok) throw new Error((await r.json()).error || 'Error')
      }
      setDone(true)
      setTimeout(onNext, 1000)
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenS, border: '2px solid ' + C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: C.green }}>
        <Icon d={ICONS.check} size={28}/>
      </div>
      <p style={{ fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: C.fg, margin: '0 0 6px' }}>{impresoras.length} impresora{impresoras.length > 1 ? 's' : ''} registrada{impresoras.length > 1 ? 's' : ''}</p>
      <p style={{ fontFamily: SC, fontSize: 17, color: C.fg3 }}>Los tickets ya tienen destino</p>
    </div>
  )

  return (
    <div>
      {/* Explicación */}
      <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
        <p style={{ fontFamily: SN, fontSize: 14, color: C.fg2, margin: '0 0 8px', lineHeight: 1.6 }}>
          ia.rest soporta dos tipos de impresoras térmicas. Elige la que corresponda a tu modelo:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
          {[
            { v: 'cloud' as const, label: 'Star CloudPRNT', sub: 'Star TSP143IIILAN · TSP143IIIW', desc: 'Se conecta directo a internet. Necesita un Device ID (MAC).' },
            { v: 'tcp'   as const, label: 'ESC/POS TCP/IP',  sub: 'Epson TM-T20 · genéricas LAN',  desc: 'Impresora en red local. Necesita el bridge ia.rest corriendo.' },
          ].map(opt => (
            <button key={opt.v} onClick={() => setTipo(opt.v)}
              style={{ background: tipo === opt.v ? C.red + '18' : C.e2, border: '1.5px solid ' + (tipo === opt.v ? C.red : C.rule2), borderRadius: 10, padding: '10px 12px', cursor: 'pointer', textAlign: 'left' as const, transition: 'all .15s' }}>
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: tipo === opt.v ? C.red : C.fg, marginBottom: 2 }}>{opt.label}</div>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.fg3, marginBottom: 4 }}>{opt.sub}</div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.fg3, lineHeight: 1.4 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        <p style={{ fontFamily: SC, fontSize: 14, color: C.fg3, margin: 0 }}>
          {tipo === 'cloud'
            ? '💡 Device ID: menú red de la impresora → CloudPRNT → Device ID (formato 00:11:62:XX:XX:XX)'
            : '💡 ESC/POS: el bridge ia-rest-bridge.js debe estar corriendo en la misma red del restaurante'}
        </p>
      </div>

      {/* Aviso saltar */}
      <div style={{ background: C.amberS, border: '1px solid ' + C.amber + '33', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <p style={{ fontFamily: SN, fontSize: 13, color: C.amber, margin: 0 }}>
          ⚠ Si aún no tienes la impresora a mano, puedes saltarte este paso. El KDS (pantalla de cocina) funciona sin impresora física.
          Puedes añadir impresoras desde <strong>/owner → Impresoras</strong> cuando quieras.
        </p>
      </div>

      {/* Formulario */}
      {secciones.length > 0 && (
        <>
          <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontFamily: SN, fontSize: 12, color: C.fg3, display: 'block', marginBottom: 5 }}>Nombre</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Impresora cocina"
                  style={{ width: '100%', background: C.e2, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 8, padding: '9px 12px', fontFamily: SN, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}/>
              </div>
              <div>
                <label style={{ fontFamily: SN, fontSize: 12, color: C.fg3, display: 'block', marginBottom: 5 }}>Sección</label>
                <select value={form.seccion_id} onChange={e => setForm(f => ({ ...f, seccion_id: e.target.value }))}
                  style={{ width: '100%', background: C.e2, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 8, padding: '9px 12px', fontFamily: SN, fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                  {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            </div>

            {tipo === 'cloud' ? (
              <div>
                <label style={{ fontFamily: SN, fontSize: 12, color: C.fg3, display: 'block', marginBottom: 5 }}>Device ID CloudPRNT</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={form.cloud_device_id} onChange={e => setForm(f => ({ ...f, cloud_device_id: e.target.value.toUpperCase() }))}
                    placeholder="00:11:62:XX:XX:XX"
                    style={{ flex: 1, background: C.e2, border: '1px solid ' + (error ? '#F07060' : C.rule2), color: C.fg, borderRadius: 8, padding: '9px 12px', fontFamily: SM, fontSize: 14, outline: 'none', letterSpacing: 1 }}/>
                  <button onClick={añadir}
                    style={{ background: C.e2, border: '1px solid ' + C.rule2, color: C.fg2, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontFamily: SN, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon d={ICONS.plus} size={14}/> Añadir
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={{ fontFamily: SN, fontSize: 12, color: C.fg3, display: 'block', marginBottom: 5 }}>IP de la impresora</label>
                  <input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))}
                    placeholder="192.168.1.100"
                    style={{ width: '100%', background: C.e2, border: '1px solid ' + (error ? '#F07060' : C.rule2), color: C.fg, borderRadius: 8, padding: '9px 12px', fontFamily: SM, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}/>
                </div>
                <div>
                  <label style={{ fontFamily: SN, fontSize: 12, color: C.fg3, display: 'block', marginBottom: 5 }}>Puerto</label>
                  <input value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                    placeholder="9100"
                    style={{ width: '100%', background: C.e2, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 8, padding: '9px 12px', fontFamily: SM, fontSize: 14, outline: 'none', textAlign: 'center' as const, boxSizing: 'border-box' as const }}/>
                </div>
                <button onClick={añadir}
                  style={{ background: C.e2, border: '1px solid ' + C.rule2, color: C.fg2, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontFamily: SN, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, height: 40 }}>
                  <Icon d={ICONS.plus} size={14}/> Añadir
                </button>
              </div>
            )}
          </div>
          {error && <p style={{ fontFamily: SN, fontSize: 12, color: '#F07060', margin: '0 0 12px' }}>⚠ {error}</p>}
        </>
      )}

      {secciones.length === 0 && (
        <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 10, padding: '14px 16px', marginBottom: 16, textAlign: 'center' as const }}>
          <p style={{ fontFamily: SN, fontSize: 14, color: C.fg3, margin: 0 }}>
            No hay secciones creadas. Crea secciones en el paso anterior para poder asignar impresoras.
          </p>
        </div>
      )}

      {/* Lista impresoras añadidas */}
      {impresoras.length > 0 && (
        <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          {impresoras.map((p, i) => (
            <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < impresoras.length - 1 ? '1px solid ' + C.rule : 'none' }}>
              <div style={{ color: C.fg3 }}><Icon d={ICONS.printer} size={16}/></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: SN, fontSize: 14, color: C.fg, fontWeight: 600 }}>{p.nombre}</span>
                <span style={{ fontFamily: SM, fontSize: 11, color: p.tipo === 'tcp' ? C.amber : C.fg3, marginLeft: 10 }}>
                  {p.tipo === 'tcp' ? `${p.ip_address}:${p.port}` : p.cloud_device_id}
                </span>
                <span style={{ fontFamily: SN, fontSize: 10, color: C.fg3, background: C.e2, padding: '1px 6px', borderRadius: 10, marginLeft: 6 }}>
                  {p.tipo === 'tcp' ? 'ESC/POS' : 'CloudPRNT'}
                </span>
              </div>
              <span style={{ fontFamily: SN, fontSize: 12, color: C.fg3 }}>
                {secciones.find(s => s.id === p.seccion_id)?.nombre ?? p.seccion_id}
              </span>
              <button onClick={() => setImpresoras(ps => ps.filter(x => x._id !== p._id))}
                style={{ background: 'none', border: 'none', color: C.fg3, cursor: 'pointer', padding: 4 }}>
                <Icon d={ICONS.x} size={14}/>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ob-btns" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onNext}
          style={{ background: 'none', border: 'none', color: C.fg3, fontFamily: SN, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
          Saltarme las impresoras
        </button>
        <button onClick={impresoras.length ? guardar : onNext} disabled={saving}
          style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 8, padding: '11px 24px', cursor: 'pointer', fontFamily: SN, fontSize: 14, fontWeight: 600 }}>
          {saving ? 'Guardando…' : impresoras.length > 0 ? `Registrar ${impresoras.length} impresora${impresoras.length > 1 ? 's' : ''} →` : 'Siguiente →'}
        </button>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════
   STEP 4 — MESAS
══════════════════════════════════════════════════════════ */
function StepMesas({ session, onComplete }: { session: any; onComplete: () => void }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [zonas, setZonas] = useState<Zona[]>([])
  const [form, setForm] = useState({ nombre: '', prefijo: '', tipo: 'salon', count: 6 })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [saveError, setSaveError] = useState('')

  const tipoOpts = [
    { v: 'salon',   l: 'Salón interior' },
    { v: 'terraza', l: 'Terraza' },
    { v: 'barra',   l: 'Barra' },
    { v: 'privado', l: 'Privado / VIP' },
    { v: 'otro',    l: 'Otro' },
  ]

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.nombre.trim()) e.nombre = 'Escribe el nombre de la zona'
    if (!form.prefijo.trim()) e.prefijo = 'Escribe un prefijo (1-3 letras)'
    if (!/^[A-Za-z]{1,3}$/.test(form.prefijo)) e.prefijo = '1-3 letras sin números'
    if (zonas.some(z => z.prefijo.toUpperCase() === form.prefijo.toUpperCase())) e.prefijo = 'Prefijo ya usado'
    if (form.count < 1 || form.count > 50) e.count = '1-50 mesas'
    return e
  }

  const addZona = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setZonas(zs => [...zs, { ...form, prefijo: form.prefijo.toUpperCase(), _id: Date.now() }])
    setForm({ nombre: '', prefijo: '', tipo: 'salon', count: 6 })
    setErrors({})
  }

  const removeZona = (id: number) => setZonas(zs => zs.filter(z => z._id !== id))

  const getMesaPreview = (z: Zona) =>
    Array.from({ length: Math.min(z.count, 8) }, (_, i) => `${z.prefijo}${i + 1}`)

  const totalMesas = zonas.reduce((s, z) => s + z.count, 0)

  const guardar = async () => {
    if (!zonas.length) { onComplete(); return }
    setSaving(true)
    setSaveError('')
    try {
      for (const zona of zonas) {
        // Create zone
        const zr = await fetch('/api/owner/zonas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...sh() },
          body: JSON.stringify({ nombre: zona.nombre, tipo: zona.tipo, prefijo: zona.prefijo }),
        }).then(r => r.json())

        // Create mesas for this zone
        const mesaPromises = Array.from({ length: zona.count }, (_, i) =>
          fetch('/api/owner/mesas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...sh() },
            body: JSON.stringify({ codigo: `${zona.prefijo}${i + 1}`, zona: zona.prefijo, capacidad: 4, forma: zona.tipo === 'barra' ? 'bar' : 'round' }),
          })
        )
        await Promise.allSettled(mesaPromises)
      }
      setDone(true)
      setTimeout(onComplete, 1200)
    } catch (e: any) {
      setSaveError(e.message || 'Error al guardar')
      setSaving(false)
    }
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenS, border: '2px solid ' + C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: C.green }}>
        <Icon d={ICONS.check} size={28}/>
      </div>
      <p style={{ fontFamily: SE, fontSize: 24, fontStyle: 'italic', color: C.fg, margin: '0 0 8px' }}>
        {totalMesas} mesas creadas
      </p>
      <p style={{ fontFamily: SC, fontSize: 18, color: C.fg3 }}>¡Tu local está listo!</p>
    </div>
  )

  return (
    <div>
      {/* Add zone form */}
      <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
        <p style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.fg2, margin: '0 0 12px' }}>Añadir zona</p>
        <div className="ob-grid-imp" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 70px', gap: 10, marginBottom: 10 }}>
          <div>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Salón interior, Terraza…"
              style={{ width: '100%', background: C.e2, border: '1px solid ' + (errors.nombre ? '#F07060' : C.rule2), color: C.fg, borderRadius: 7, padding: '9px 12px', fontFamily: SN, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}/>
            {errors.nombre && <p style={{ fontFamily: SN, fontSize: 11, color: '#F07060', margin: '4px 0 0' }}>{errors.nombre}</p>}
          </div>
          <div>
            <input value={form.prefijo} onChange={e => setForm(f => ({ ...f, prefijo: e.target.value.toUpperCase().slice(0, 3) }))}
              placeholder="S"
              style={{ width: '100%', background: C.e2, border: '1px solid ' + (errors.prefijo ? '#F07060' : C.rule2), color: C.red, borderRadius: 7, padding: '9px 12px', fontFamily: SM, fontSize: 16, fontWeight: 700, outline: 'none', letterSpacing: 2, textAlign: 'center', boxSizing: 'border-box' }}/>
            {errors.prefijo && <p style={{ fontFamily: SN, fontSize: 11, color: '#F07060', margin: '4px 0 0' }}>{errors.prefijo}</p>}
          </div>
          <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
            style={{ background: C.e2, border: '1px solid ' + C.rule2, color: C.fg, borderRadius: 7, padding: '9px 12px', fontFamily: SN, fontSize: 14, outline: 'none', cursor: 'pointer' }}>
            {tipoOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <div>
            <input value={form.count} onChange={e => setForm(f => ({ ...f, count: parseInt(e.target.value) || 1 }))}
              type="number" min={1} max={50} placeholder="6"
              style={{ width: '100%', background: C.e2, border: '1px solid ' + (errors.count ? '#F07060' : C.rule2), color: C.fg, borderRadius: 7, padding: '9px 12px', fontFamily: SM, fontSize: 16, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}/>
            {errors.count && <p style={{ fontFamily: SN, fontSize: 11, color: '#F07060', margin: '4px 0 0' }}>{errors.count}</p>}
          </div>
        </div>
        <p style={{ fontFamily: SC, fontSize: 14, color: C.fg3, margin: '0 0 10px' }}>
          El prefijo identifica las mesas por voz: "mesa S1", "mesa T3", "barra B2"
        </p>
        <button onClick={addZona}
          style={{ background: C.e2, border: '1px solid ' + C.rule2, color: C.fg2, borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontFamily: SN, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon d={ICONS.plus} size={14}/> Añadir zona
        </button>
      </div>

      {/* Zones list */}
      {zonas.length > 0 && (
        <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {zonas.map((z, i) => (
            <div key={z._id} style={{ padding: '14px 16px', borderBottom: i < zonas.length - 1 ? '1px solid ' + C.rule : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ color: C.fg3 }}><Icon d={ICONS.map} size={16}/></div>
                  <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.fg }}>{z.nombre}</span>
                  <span style={{ fontFamily: SM, fontSize: 13, color: C.red, fontWeight: 700 }}>{z.prefijo}</span>
                  <span style={{ fontFamily: SN, fontSize: 12, color: C.fg3 }}>{z.count} mesas</span>
                </div>
                <button onClick={() => removeZona(z._id)}
                  style={{ background: 'none', border: 'none', color: C.fg3, cursor: 'pointer', padding: 4 }}>
                  <Icon d={ICONS.trash} size={14}/>
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {getMesaPreview(z).map(code => (
                  <span key={code} style={{ fontFamily: SM, fontSize: 12, color: C.fg2, background: C.e2, padding: '3px 8px', borderRadius: 6, border: '1px solid ' + C.rule2 }}>{code}</span>
                ))}
                {z.count > 8 && <span style={{ fontFamily: SM, fontSize: 12, color: C.fg3 }}>+{z.count - 8} más</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {saveError && <p style={{ fontFamily: SN, fontSize: 13, color: '#F07060', marginBottom: 12 }}>⚠ {saveError}</p>}

      <div className="ob-btns" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onComplete}
          style={{ background: 'none', border: 'none', color: C.fg3, fontFamily: SN, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
          Configuraré las mesas después
        </button>
        <button onClick={guardar} disabled={saving}
          style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 8, padding: '11px 24px', cursor: 'pointer', fontFamily: SN, fontSize: 14, fontWeight: 600 }}>
          {saving ? 'Creando…' : zonas.length > 0 ? `Crear ${totalMesas} mesas →` : 'Terminar →'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   STEP 7 — PRIMER TURNO
══════════════════════════════════════════════════════════ */
function StepPrimerTurno({ session, onComplete }: { session: any; onComplete: () => void }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })
  const [abriendo, setAbriendo] = useState(false)
  const [turnoAbierto, setTurnoAbierto] = useState(false)
  const [error, setError] = useState('')

  const abrirTurno = async () => {
    setAbriendo(true); setError('')
    try {
      const r = await fetch('/api/owner/turno', { method: 'POST', headers: sh() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error al abrir turno')
      setTurnoAbierto(true)
    } catch (e: any) { setError(e.message); setAbriendo(false) }
  }

  if (turnoAbierto) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenS, border: '2px solid ' + C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: C.green }}>
        <Icon d={ICONS.check} size={28}/>
      </div>
      <p style={{ fontFamily: SE, fontSize: 24, fontStyle: 'italic', color: C.fg, margin: '0 0 8px' }}>
        Turno abierto. Ya estáis en marcha.
      </p>
      <p style={{ fontFamily: SC, fontSize: 18, color: C.fg3, margin: '0 0 28px' }}>
        Ahora el camarero ya puede entrar a /edge y lanzar la primera comanda
      </p>
      <button onClick={onComplete}
        style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 10, padding: '13px 32px', cursor: 'pointer', fontFamily: SN, fontSize: 15, fontWeight: 700, letterSpacing: '.3px' }}>
        Ir al panel de control →
      </button>
    </div>
  )

  return (
    <div>
      {/* Resumen de lo configurado */}
      <div style={{ background: C.greenS, border: '1px solid ' + C.green + '44', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ color: C.green }}><Icon d={ICONS.check} size={16}/></div>
          <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.green }}>Configuración completada</span>
        </div>
        <p style={{ fontFamily: SN, fontSize: 13, color: '#7AC47F', margin: 0, lineHeight: 1.6 }}>
          Carta · Personal · Cocina y flujos · Secciones · Impresoras · Mesas.
          Solo queda abrir el primer turno y ya podéis empezar a tomar comandas.
        </p>
      </div>

      {/* Qué es un turno */}
      <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
        <p style={{ fontFamily: SN, fontSize: 14, color: C.fg2, margin: '0 0 10px', lineHeight: 1.6 }}>
          El <strong style={{ color: C.fg }}>turno</strong> es el contenedor de todas las operaciones del servicio: comandas, facturas, cobros y métricas quedan agrupados dentro del turno activo.
          Al cerrarlo al final del servicio, el sistema calcula el resumen del día.
        </p>
        <div className="ob-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { icon: ICONS.mic,   label: 'Comandas por voz',    desc: 'El camarero habla. El ticket va a cocina.' },
            { icon: ICONS.chef,  label: 'KDS en tiempo real',  desc: 'La cocina ve y gestiona cada ticket.' },
            { icon: ICONS.book,  label: 'Facturas legales',    desc: 'VeriFactu con hash SHA-256 y QR AEAT.' },
          ].map((item, i) => (
            <div key={i} style={{ background: C.e2, borderRadius: 10, padding: '12px', textAlign: 'center' }}>
              <div style={{ color: C.red, marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                <Icon d={item.icon} size={20}/>
              </div>
              <p style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.fg, margin: '0 0 4px' }}>{item.label}</p>
              <p style={{ fontFamily: SN, fontSize: 11, color: C.fg3, margin: 0, lineHeight: 1.4 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Accesos rápidos tras completar */}
      <div style={{ background: C.e1, border: '1px solid ' + C.rule, borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
        <p style={{ fontFamily: SN, fontSize: 12, color: C.fg3, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Tras abrir el turno, comparte estas URLs</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { url: '/edge',    label: 'Camarero — sala',    color: C.red,   pin: 'PIN del camarero' },
            { url: '/kds',     label: 'Cocina — KDS',       color: C.amber, pin: 'PIN de cocina' },
            { url: '/owner',   label: 'Owner — control',    color: '#5B8FD4', pin: 'PIN 2026' },
          ].map(item => (
            <div key={item.url} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: C.e2, borderRadius: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }}/>
              <span style={{ fontFamily: SM, fontSize: 13, color: item.color, flexShrink: 0 }}>www.iarest.es{item.url}</span>
              <span style={{ fontFamily: SN, fontSize: 12, color: C.fg3, marginLeft: 'auto' }}>{item.pin}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p style={{ fontFamily: SN, fontSize: 13, color: '#F07060', marginBottom: 16 }}>⚠ {error}</p>}

      <div className="ob-btns" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onComplete}
          style={{ background: 'none', border: 'none', color: C.fg3, fontFamily: SN, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
          Abriré el turno después desde /owner
        </button>
        <button onClick={abrirTurno} disabled={abriendo}
          style={{ background: abriendo ? C.e2 : C.red, border: 'none', color: abriendo ? C.fg3 : '#fff', borderRadius: 8, padding: '12px 28px', cursor: abriendo ? 'default' : 'pointer', fontFamily: SN, fontSize: 15, fontWeight: 700, transition: 'all .2s' }}>
          {abriendo ? 'Abriendo turno…' : '🚀 Abrir primer turno'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MAIN WIZARD
══════════════════════════════════════════════════════════ */
const STEPS = [
  {
    n:        '01',
    label:    'Carta',
    title:    'La carta, en segundos.',
    subtitle: 'Sube las fotos de tu carta en papel. ia.rest la lee entera y extrae todos los platos con precios y alérgenos.',
    caveat:   'Sin límite de páginas · Edita lo que quieras antes de guardar',
  },
  {
    n:        '02',
    label:    'Personal',
    title:    'Tu equipo, listos para entrar.',
    subtitle: 'Cada persona tiene su PIN y su pantalla. El camarero en /edge, cocina en /kds.',
    caveat:   'Puedes añadir más personas en cualquier momento desde /owner',
  },
  {
    n:        '03',
    label:    'Cómo funciona',
    title:    'El viaje de un pedido.',
    subtitle: 'Del "dos cañas y una ensalada" al ticket en cocina en menos de medio segundo.',
    caveat:   'Lee esto una vez · Después lo entiendes en el primer turno',
  },
  {
    n:        '04',
    label:    'Secciones',
    title:    'Las partidas de tu cocina.',
    subtitle: 'Cada sección tiene su propia pantalla KDS. Los platos van a donde tienen que ir, sin confusiones.',
    caveat:   'Un bar pequeño puede funcionar con una sola sección',
  },
  {
    n:        '05',
    label:    'Impresoras',
    title:    'Tickets físicos en cocina.',
    subtitle: 'Si tienes impresoras térmicas Star, conéctalas en 30 segundos con su Device ID CloudPRNT.',
    caveat:   'El KDS funciona sin impresora · Añade las impresoras cuando quieras',
  },
  {
    n:        '06',
    label:    'Mesas',
    title:    'El plano de tu local.',
    subtitle: 'Define las zonas y cuántas mesas tiene cada una. ia.rest genera los códigos automáticamente.',
    caveat:   'Puedes reorganizar el plano en /owner → Mesas después',
  },
  {
    n:        '07',
    label:    'Primer turno',
    title:    '¡Listos para servir!',
    subtitle: 'Abre el primer turno y empieza. El camarero puede mandar la primera comanda por voz ahora mismo.',
    caveat:   'Todo listo · Que empiece el servicio',
  },
]

export default function OnboardingPage() {
  const { session, checking } = useAuth('owner')
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)

  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })

  // Check if onboarding already done
  useEffect(() => {
    if (!session) return
    fetch('/api/owner/restaurante', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.restaurante?.onboarding_completado) {
          window.location.href = '/owner'
        }
      })
      .catch(() => {})
  }, [session])

  const complete = useCallback(async () => {
    setCompleting(true)
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
      })
    } catch {}
    window.location.href = '/owner?onboarding=done'
  }, [])

  const skipAll = () => complete()

  if (checking || !session) return (
    <div style={{ minHeight: '100dvh', background: C.bg }}/>
  )

  const s = STEPS[step]

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: SN }}>
      <style>{`
        * { box-sizing: border-box; }
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,500;1,6..72,400;1,6..72,500&family=JetBrains+Mono:wght@400;500;600;700&family=Caveat:wght@400;600&display=swap');
        @keyframes loadDot {
          0%, 100% { opacity: .3; transform: scale(1); }
          50%       { opacity: 1;  transform: scale(1.4); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        button { font-family: '${SN}'; }
        input:focus, select:focus { border-color: ${C.red} !important; outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.e1}; }
        ::-webkit-scrollbar-thumb { background: ${C.rule2}; border-radius: 4px; }
        select option { background: ${C.e2}; color: ${C.fg}; }
        @media (max-width: 600px) {
          .ob-grid-2  { grid-template-columns: 1fr !important; }
          .ob-grid-3  { grid-template-columns: 1fr !important; }
          .ob-grid-imp { grid-template-columns: 1fr !important; }
          .ob-header  { padding: 12px 16px !important; }
          .ob-dots    { display: none !important; }
          .ob-content { padding: 24px 16px 80px !important; }
          .ob-btns    { flex-direction: column !important; }
          .ob-btns button { width: 100% !important; justify-content: center !important; }
          .ob-h1      { font-size: 26px !important; }
          .ob-upload  { padding: 24px 16px !important; }
        }
      `}</style>

      {/* Top bar */}
      <div className="ob-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid ' + C.rule, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo/>
          <span style={{ fontFamily: SE, fontSize: 17, fontStyle: 'italic', color: C.fg }}>ia.rest</span>
        </div>

        {/* Progress dots */}
        <div className="ob-dots" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {STEPS.map((st, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: i === step ? 28 : 8,
                  height: 8, borderRadius: 20,
                  background: i < step ? C.green : i === step ? C.red : C.rule2,
                  transition: 'all .3s ease',
                }}/>
                {i === step && (
                  <span style={{ fontFamily: SN, fontSize: 11, color: C.fg3, whiteSpace: 'nowrap' }}>
                    {st.label}
                  </span>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>

        <button onClick={skipAll}
          style={{ background: 'none', border: 'none', color: C.fg3, fontFamily: SN, fontSize: 13, cursor: 'pointer' }}>
          Saltar guía
        </button>
      </div>

      {/* Content */}
      <div className="ob-content" style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Step header */}
        <div key={step} style={{ animation: 'fadeIn .35s ease', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: 2, textTransform: 'uppercase' }}>
              {s.n} · {s.label}
            </span>
          </div>
          <h1 className="ob-h1" style={{ fontFamily: SE, fontSize: 34, fontStyle: 'italic', color: C.fg, margin: '0 0 10px', lineHeight: 1.2 }}>
            {s.title}
          </h1>
          <p style={{ fontFamily: SN, fontSize: 16, color: C.fg2, margin: '0 0 8px', lineHeight: 1.6 }}>
            {s.subtitle}
          </p>
          <p style={{ fontFamily: SC, fontSize: 16, color: C.fg3, margin: 0 }}>{s.caveat}</p>
        </div>

        {/* Step content */}
        <div key={'content-' + step} style={{ animation: 'fadeIn .35s ease .1s both' }}>
          {step === 0 && <StepCarta session={session} onNext={() => setStep(1)}/>}
          {step === 1 && <StepPersonal session={session} onNext={() => setStep(2)}/>}
          {step === 2 && <StepCocina onNext={() => setStep(3)}/>}
          {step === 3 && <StepSecciones onNext={() => setStep(4)}/>}
          {step === 4 && <StepImpresoras onNext={() => setStep(5)}/>}
          {step === 5 && <StepMesas session={session} onComplete={() => setStep(6)}/>}
          {step === 6 && <StepPrimerTurno session={session} onComplete={complete}/>}
        </div>

        {/* Step counter */}
        <p style={{ fontFamily: SM, fontSize: 11, color: C.fg3, textAlign: 'center', marginTop: 32 }}>
          {step + 1} / {STEPS.length}
        </p>
      </div>

      {completing && (
        <div style={{ position: 'fixed', inset: 0, background: C.bg + 'ee', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: SE, fontSize: 28, fontStyle: 'italic', color: C.fg, marginBottom: 8 }}>
              ¡Todo listo 🎉
            </div>
            <p style={{ fontFamily: SC, fontSize: 20, color: C.fg3 }}>Yendo al panel de control…</p>
          </div>
        </div>
      )}
    </div>
  )
}
