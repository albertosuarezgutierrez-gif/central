'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function NuevaSociedadBtn() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [cif, setCif] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    const res = await fetch('/api/sociedades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, cif: cif || undefined }),
    })
    setLoading(false)
    if (!res.ok) { setErr('Error al crear'); return }
    setOpen(false); setNombre(''); setCif('')
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={btnStyle}>＋ Sociedad</button>
      {open && (
        <Modal title="Nueva sociedad" onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Field label="Nombre *">
              <input value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus style={inputStyle} />
            </Field>
            <Field label="CIF (opcional)">
              <input value={cif} onChange={e => setCif(e.target.value)} style={inputStyle} />
            </Field>
            {err && <p style={{ color: '#dc2626', fontSize: '13px' }}>{err}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)} style={cancelStyle}>Cancelar</button>
              <button type="submit" disabled={loading} style={submitStyle}>{loading ? 'Creando…' : 'Crear'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export function EditarSociedadBtn({ id, nombre: nombreActual, cif: cifActual }: { id: string; nombre: string; cif?: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState(nombreActual)
  const [cif, setCif] = useState(cifActual || '')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  function abrir() { setNombre(nombreActual); setCif(cifActual || ''); setOpen(true) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    const res = await fetch(`/api/sociedades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, cif: cif || null }),
    })
    setLoading(false)
    if (!res.ok) { setErr('Error al guardar'); return }
    setOpen(false); router.refresh()
  }

  return (
    <>
      <button onClick={abrir} title="Editar sociedad" style={editStyle}>✎</button>
      {open && (
        <Modal title="Editar sociedad" onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Field label="Nombre *">
              <input value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus style={inputStyle} />
            </Field>
            <Field label="CIF (opcional)">
              <input value={cif} onChange={e => setCif(e.target.value)} style={inputStyle} />
            </Field>
            {err && <p style={{ color: '#dc2626', fontSize: '13px' }}>{err}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)} style={cancelStyle}>Cancelar</button>
              <button type="submit" disabled={loading} style={submitStyle}>{loading ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export function EliminarSociedadBtn({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function eliminar() {
    if (!confirm(`¿Eliminar "${nombre}" y todos sus negocios?`)) return
    setLoading(true)
    await fetch(`/api/sociedades/${id}`, { method: 'DELETE' })
    setLoading(false)
    router.refresh()
  }

  return (
    <button onClick={eliminar} disabled={loading} title="Eliminar sociedad" style={deleteStyle}>
      {loading ? '…' : '✕'}
    </button>
  )
}

export function NuevoNegocioBtn({ sociedadId }: { sociedadId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [sector, setSector] = useState('hosteleria')
  const [app, setApp] = useState('')
  const [refExt, setRefExt] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    const res = await fetch('/api/negocios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sociedadId,
        nombre,
        sector,
        app: app || undefined,
        refExt: refExt || undefined,
      }),
    })
    setLoading(false)
    if (!res.ok) { setErr('Error al crear'); return }
    setOpen(false); setNombre(''); setSector('hosteleria'); setApp(''); setRefExt('')
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={btnSmallStyle}>＋ Negocio</button>
      {open && (
        <Modal title="Nuevo negocio" onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Field label="Nombre *">
              <input value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus style={inputStyle} />
            </Field>
            <Field label="Sector *">
              <select value={sector} onChange={e => setSector(e.target.value)} style={inputStyle}>
                <option value="hosteleria">🍽️ Hostelería</option>
                <option value="limpieza">🧹 Limpieza</option>
                <option value="inmobiliario">🏠 Inmobiliario</option>
              </select>
            </Field>
            <Field label="App vertical">
              <select value={app} onChange={e => setApp(e.target.value)} style={inputStyle}>
                <option value="">— sin app —</option>
                <option value="ia-rest">ia-rest</option>
                <option value="ialimp">ialimp</option>
                <option value="sivra">sivra</option>
              </select>
            </Field>
            {(app === 'ialimp' || app === 'ia-rest') && (
              <Field label={app === 'ia-rest' ? 'ID local (refExt)' : 'ID empresa (refExt)'}>
                <input
                  value={refExt}
                  onChange={e => setRefExt(e.target.value)}
                  placeholder={app === 'ia-rest' ? 'UUID del local en ia-rest' : 'UUID de empresa en ialimp'}
                  style={inputStyle}
                />
              </Field>
            )}
            {err && <p style={{ color: '#dc2626', fontSize: '13px' }}>{err}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)} style={cancelStyle}>Cancelar</button>
              <button type="submit" disabled={loading} style={submitStyle}>{loading ? 'Creando…' : 'Crear'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export function EditarNegocioBtn({ id, nombre: nombreActual, sector: sectorActual, app: appActual, refExt: refExtActual }: {
  id: string; nombre: string; sector: string; app?: string | null; refExt?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState(nombreActual)
  const [sector, setSector] = useState(sectorActual)
  const [app, setApp] = useState(appActual || '')
  const [refExt, setRefExt] = useState(refExtActual || '')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  function abrir() {
    setNombre(nombreActual); setSector(sectorActual)
    setApp(appActual || ''); setRefExt(refExtActual || ''); setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    const res = await fetch(`/api/negocios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, sector, app: app || null, refExt: refExt || null }),
    })
    setLoading(false)
    if (!res.ok) { setErr('Error al guardar'); return }
    setOpen(false); router.refresh()
  }

  return (
    <>
      <button onClick={abrir} title="Editar negocio" style={{ ...editStyle, position: 'absolute', top: '8px', right: '28px' }}>✎</button>
      {open && (
        <Modal title="Editar negocio" onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Field label="Nombre *">
              <input value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus style={inputStyle} />
            </Field>
            <Field label="Sector *">
              <select value={sector} onChange={e => setSector(e.target.value)} style={inputStyle}>
                <option value="hosteleria">🍽️ Hostelería</option>
                <option value="limpieza">🧹 Limpieza</option>
                <option value="inmobiliario">🏠 Inmobiliario</option>
              </select>
            </Field>
            <Field label="App vertical">
              <select value={app} onChange={e => setApp(e.target.value)} style={inputStyle}>
                <option value="">— sin app —</option>
                <option value="ia-rest">ia-rest</option>
                <option value="ialimp">ialimp</option>
                <option value="sivra">sivra</option>
              </select>
            </Field>
            {(app === 'ialimp' || app === 'ia-rest') && (
              <Field label={app === 'ia-rest' ? 'ID local (refExt)' : 'ID empresa (refExt)'}>
                <input value={refExt} onChange={e => setRefExt(e.target.value)} placeholder={app === 'ia-rest' ? 'UUID del local en ia-rest' : 'UUID de empresa en ialimp'} style={inputStyle} />
              </Field>
            )}
            {err && <p style={{ color: '#dc2626', fontSize: '13px' }}>{err}</p>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)} style={cancelStyle}>Cancelar</button>
              <button type="submit" disabled={loading} style={submitStyle}>{loading ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export function EliminarNegocioBtn({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function eliminar() {
    if (!confirm(`¿Eliminar el negocio "${nombre}"?`)) return
    setLoading(true)
    await fetch(`/api/negocios/${id}`, { method: 'DELETE' })
    setLoading(false)
    router.refresh()
  }

  return (
    <button onClick={eliminar} disabled={loading} title="Eliminar negocio" style={deleteStyle}>
      {loading ? '…' : '✕'}
    </button>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '24px',
        width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--muted)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px',
  padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const btnSmallStyle: React.CSSProperties = {
  ...btnStyle, padding: '4px 10px', fontSize: '12px', opacity: 0.85,
}
const cancelStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
  padding: '6px 14px', fontSize: '13px', cursor: 'pointer', color: 'var(--text)',
}
const submitStyle: React.CSSProperties = {
  ...btnStyle,
}
const deleteStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
  fontSize: '13px', padding: '2px 6px', borderRadius: '4px', lineHeight: 1,
}
const editStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
  fontSize: '14px', padding: '2px 6px', borderRadius: '4px', lineHeight: 1,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
  borderRadius: '6px', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)',
  boxSizing: 'border-box',
}
