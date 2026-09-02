'use client'
import { useEffect, useState, useCallback } from 'react'
import { Building2 } from 'lucide-react'
import { Pagina, PageHeader } from '@/components/ui'

type Metrica = { label: string; valor: string }
type Cliente = { vertical: 'ialimp' | 'sivra' | 'iarest' | 'rrhh'; id: string; nombre: string; email?: string | null; activo: boolean; puedeBloquear: boolean; metricas: Metrica[] }
type Ficha = Cliente & { detalle: Metrica[]; modulos?: string[] }

const VERT: Record<string, { label: string; icon: string }> = {
  ialimp: { label: 'Limpieza · ialimp', icon: '🧹' },
  sivra:  { label: 'Inmobiliario · sivra', icon: '🏠' },
  iarest: { label: 'Hostelería · ia-rest', icon: '🍽️' },
  rrhh:   { label: 'RR.HH. · iarrhh', icon: '👥' },
}

export default function ClientesClient({ operador }: { operador: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [modulos, setModulos] = useState<{ key: string; label: string; activo: boolean }[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [showNuevo, setShowNuevo] = useState(false)
  const [nuevo, setNuevo] = useState({ vertical: 'ialimp', nombre: '', email: '', password: '', ciudad: '', responsableNombre: '', color: '', logo: '' })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [nuevoErr, setNuevoErr] = useState('')
  const [nuevoOk, setNuevoOk] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/clientes')
      if (!r.ok) { setError('Error cargando clientes.'); setLoading(false); return }
      const d = await r.json()
      setClientes(d.clientes || [])
    } catch { setError('No se pudo cargar.') }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function toggle(c: Cliente) {
    if (!c.puedeBloquear) return
    setBusy(c.vertical + c.id)
    const r = await fetch(`/api/admin/clientes/${c.vertical}/${encodeURIComponent(c.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !c.activo }),
    })
    if (r.ok) setClientes(cs => cs.map(x => x === c ? { ...x, activo: !x.activo } : x))
    setBusy(null)
  }

  async function ver360(c: Cliente) {
    setFicha(null); setModulos([]); setBusy('f' + c.vertical + c.id)
    const r = await fetch(`/api/admin/clientes/${c.vertical}/${encodeURIComponent(c.id)}`)
    if (r.ok) {
      const d = await r.json(); setFicha(d.ficha)
      const m = await fetch(`/api/admin/clientes/${c.vertical}/${encodeURIComponent(c.id)}/modulos`).then(x => x.ok ? x.json() : { modulos: [] }).catch(() => ({ modulos: [] }))
      setModulos(m.modulos || [])
    }
    setBusy(null)
  }

  async function toggleModulo(m: { key: string; activo: boolean }) {
    if (!ficha) return
    const r = await fetch(`/api/admin/clientes/${ficha.vertical}/${encodeURIComponent(ficha.id)}/modulos`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulo: m.key, activo: !m.activo }),
    })
    if (r.ok) setModulos(ms => ms.map(x => x.key === m.key ? { ...x, activo: !x.activo } : x))
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setNuevoErr(''); setNuevoOk('')
    let logoUrl = nuevo.logo
    if (logoFile && nuevo.vertical === 'rrhh') {
      const up = await fetch('/api/admin/clientes/logo', {
        method: 'POST',
        headers: { 'Content-Type': logoFile.type || 'image/png', 'x-nombre': nuevo.nombre },
        body: logoFile,
      }).catch(() => null)
      if (!up?.ok) { setNuevoErr('Error subiendo el logo'); return }
      const { url } = await up.json()
      logoUrl = url
    }
    const r = await fetch('/api/admin/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...nuevo, logo: logoUrl }) })
    const d = await r.json()
    if (d.ok) {
      if (nuevo.vertical === 'rrhh') setNuevoOk(`Empresa creada. Entrega al cliente — Email: ${nuevo.email} · Contraseña: ${nuevo.password}`)
      setNuevo({ vertical: nuevo.vertical, nombre: '', email: '', password: '', ciudad: '', responsableNombre: '', color: '', logo: '' })
      setLogoFile(null)
      cargar()
      if (nuevo.vertical !== 'rrhh') setShowNuevo(false)
    }
    else setNuevoErr(d.error || 'Error')
  }

  const verticales = ['ialimp', 'sivra', 'iarest', 'rrhh'] as const
  const activos = clientes.filter(c => c.activo && c.id !== 'iarest-info').length

  return (
    <Pagina ancho="lectura">
      <PageHeader
        titulo="Clientes"
        sub={operador}
        icono={<Building2 size={20} strokeWidth={1.75} />}
        acciones={
          <button
            onClick={() => { setNuevoErr(''); setNuevoOk(''); setShowNuevo(true) }}
            style={{ background: 'var(--primary)', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
          >
            ➕ Nuevo cliente
          </button>
        }
      />

      {/* KPIs */}
      <div className="clientes-kpis" style={{ display: 'flex', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {[
          { label: 'Clientes activos', valor: String(activos) },
          { label: 'Total clientes', valor: String(clientes.filter(c => c.id !== 'iarest-info').length) },
          { label: 'Verticales', valor: '4' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 20px', minWidth: '130px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: 'var(--negative-bg)', color: 'var(--negative)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
      {loading && <div style={{ color: 'var(--muted)', fontSize: '14px' }}>Cargando clientes…</div>}

      {verticales.map(v => {
        const cs = clientes.filter(c => c.vertical === v)
        return (
          <div key={v} style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--text)' }}>
              {VERT[v].icon} {VERT[v].label} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {cs.filter(c => c.id !== 'iarest-info').length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {cs.length === 0 && !loading && <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Sin clientes.</div>}
              {cs.map(c => (
                <div key={c.vertical + c.id} className="clientes-card" style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '12px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
                  boxShadow: 'var(--shadow)',
                }}>
                  <div style={{ minWidth: '200px', flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.nombre}</div>
                    <div style={{ display: 'flex', gap: '14px', marginTop: '4px', flexWrap: 'wrap' }}>
                      {c.metricas.map((m, i) => (
                        <span key={i} style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {m.label}: <strong style={{ color: 'var(--text)' }}>{m.valor}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="clientes-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {c.id !== 'iarest-info' && (
                      <span style={{
                        fontSize: '11px', fontWeight: 700, borderRadius: '6px', padding: '3px 10px',
                        background: c.activo ? 'var(--positive-bg)' : 'var(--negative-bg)',
                        color: c.activo ? 'var(--positive)' : 'var(--negative)',
                      }}>
                        {c.activo ? '● Activo' : '● Bloqueado'}
                      </span>
                    )}
                    {c.id !== 'iarest-info' && (
                      <button
                        onClick={() => ver360(c)}
                        disabled={busy === 'f' + c.vertical + c.id}
                        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                      >360</button>
                    )}
                    {c.puedeBloquear && (
                      <button
                        onClick={() => toggle(c)}
                        disabled={busy === c.vertical + c.id}
                        style={{
                          background: c.activo ? 'var(--negative-bg)' : 'var(--positive-bg)',
                          color: c.activo ? 'var(--negative)' : 'var(--positive)',
                          border: 'none', borderRadius: '8px', padding: '6px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                        }}
                      >
                        {c.activo ? 'Bloquear' : 'Liberar'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Modal 360 */}
      {ficha && (
        <div onClick={() => setFicha(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} className="clientes-modal" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800 }}>{ficha.nombre}</div>
              <button onClick={() => setFicha(null)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>{VERT[ficha.vertical]?.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '10px' }}>
              {ficha.detalle.map((d, i) => (
                <div key={i} style={{ background: 'var(--bg)', borderRadius: '10px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>{d.label}</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>{d.valor}</div>
                </div>
              ))}
            </div>
            {modulos.length > 0 && (
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Módulos contratados</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {modulos.map(m => (
                    <label key={m.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'var(--bg)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '13px' }}>{m.label}</span>
                      <input type="checkbox" checked={m.activo} onChange={() => toggleModulo(m)} style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }} />
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>Los cambios aplican en el próximo inicio de sesión del cliente.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal nuevo cliente */}
      {showNuevo && (
        <div onClick={() => setShowNuevo(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={crear} className="clientes-modal" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px' }}>➕ Nuevo cliente</div>
            {nuevoErr && <div style={{ background: 'var(--negative-bg)', color: 'var(--negative)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '13px' }}>{nuevoErr}</div>}
            {nuevoOk && <div style={{ background: 'var(--positive-bg)', color: 'var(--positive)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '13px' }}>{nuevoOk}</div>}
            <Field label="Vertical">
              <select value={nuevo.vertical} onChange={e => setNuevo(n => ({ ...n, vertical: e.target.value }))} style={inp}>
                <option value="ialimp">Limpieza · ialimp</option>
                <option value="iarest">Hostelería · ia-rest</option>
                <option value="rrhh">RR.HH. · iarrhh</option>
              </select>
            </Field>
            <Field label={nuevo.vertical === 'rrhh' ? 'Nombre de la empresa' : 'Nombre'}><input value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} required style={inp} /></Field>
            {nuevo.vertical === 'ialimp' && <>
              <Field label="Email del dueño"><input type="email" value={nuevo.email} onChange={e => setNuevo(n => ({ ...n, email: e.target.value }))} required style={inp} /></Field>
              <Field label="Contraseña inicial"><input type="text" value={nuevo.password} onChange={e => setNuevo(n => ({ ...n, password: e.target.value }))} required minLength={8} style={inp} /></Field>
            </>}
            {nuevo.vertical === 'iarest' && <Field label="Ciudad"><input value={nuevo.ciudad} onChange={e => setNuevo(n => ({ ...n, ciudad: e.target.value }))} style={inp} /></Field>}
            {nuevo.vertical === 'rrhh' && <>
              <Field label="Responsable (nombre)"><input value={nuevo.responsableNombre} onChange={e => setNuevo(n => ({ ...n, responsableNombre: e.target.value }))} required style={inp} /></Field>
              <Field label="Email del responsable"><input type="email" value={nuevo.email} onChange={e => setNuevo(n => ({ ...n, email: e.target.value }))} required style={inp} /></Field>
              <Field label="Contraseña inicial"><input type="text" value={nuevo.password} onChange={e => setNuevo(n => ({ ...n, password: e.target.value }))} required minLength={8} style={inp} /></Field>
              <Field label="Color de marca (opcional)">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="color" value={nuevo.color || '#2B6A6E'} onChange={e => setNuevo(n => ({ ...n, color: e.target.value }))} style={{ height: '38px', width: '48px', cursor: 'pointer', borderRadius: '6px', border: '1px solid var(--border)', padding: '2px', background: 'var(--bg)', flexShrink: 0 }} />
                  <input type="text" placeholder="#2B6A6E" value={nuevo.color} onChange={e => setNuevo(n => ({ ...n, color: e.target.value }))} style={{ ...inp, width: '120px' }} />
                </div>
              </Field>
              <Field label="Logo (opcional)">
                <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files?.[0] ?? null)} style={{ fontSize: '13px', color: 'var(--text)' }} />
              </Field>
            </>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button type="submit" style={{ flex: 1, padding: '11px', background: 'var(--primary)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Crear</button>
              <button type="button" onClick={() => setShowNuevo(false)} style={{ padding: '11px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </Pagina>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '5px', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}
