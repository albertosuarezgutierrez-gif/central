'use client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

type SociedadOpt = { id: string; nombre: string }

// Formulario de subida de extracto Norma 43 (.n43) para una sociedad.
export function ImportarExtractoBtn({ sociedades }: { sociedades: SociedadOpt[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sociedadId, setSociedadId] = useState(sociedades[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setErr('Selecciona un fichero .n43'); return }
    if (!sociedadId) { setErr('Selecciona una sociedad'); return }
    setLoading(true); setErr(''); setMsg('')

    const fd = new FormData()
    fd.set('sociedadId', sociedadId)
    fd.set('file', file)
    const res = await fetch('/api/banca/importar', { method: 'POST', body: fd })
    setLoading(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(data.error || 'Error al importar'); return }
    setMsg(`Importado: ${data.insertados} nuevos, ${data.duplicados} ya existentes (${data.cuentas} cuenta/s).`)
    router.refresh()
  }

  if (sociedades.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Crea una sociedad antes de importar extractos.</p>
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setMsg(''); setErr('') }} style={btn}>⬆️ Importar extracto (.n43)</button>
      {open && (
        <div style={overlay} onClick={() => setOpen(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Importar extracto Norma 43</h3>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={lbl}>Sociedad
                <select value={sociedadId} onChange={e => setSociedadId(e.target.value)} style={input}>
                  {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
              <label style={lbl}>Fichero .n43
                <input ref={fileRef} type="file" accept=".n43,.txt,text/plain" style={{ fontSize: '14px' }} />
              </label>
              {err && <p style={{ color: '#dc2626', fontSize: '13px' }}>{err}</p>}
              {msg && <p style={{ color: '#16a34a', fontSize: '13px' }}>{msg}</p>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setOpen(false)} style={cancel}>Cerrar</button>
                <button type="submit" disabled={loading} style={submitBtn}>{loading ? 'Importando…' : 'Importar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// Botón para (re)lanzar la categorización IA de los movimientos pendientes.
export function ReanalizarBtn() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function run() {
    setLoading(true); setMsg('')
    const res = await fetch('/api/banca/analizar', { method: 'POST' })
    setLoading(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg('Error'); return }
    setMsg(data.categorizados > 0 ? `${data.categorizados} categorizados` : 'Nada pendiente / IA no disponible')
    router.refresh()
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={run} disabled={loading} style={ghost}>{loading ? 'Analizando…' : '🤖 Re-analizar IA'}</button>
      {msg && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{msg}</span>}
    </span>
  )
}

// Botón para cruzar banco ↔ facturas/ingresos registrados (sivra + ialimp).
export function ConciliarBtn() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function run() {
    setLoading(true); setMsg('')
    const res = await fetch('/api/banca/conciliar', { method: 'POST' })
    setLoading(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg('Error'); return }
    setMsg(data.conciliados > 0 ? `${data.conciliados} conciliados` : 'Sin coincidencias nuevas')
    router.refresh()
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={run} disabled={loading} style={ghost}>{loading ? 'Conciliando…' : '🔗 Conciliar facturas'}</button>
      {msg && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{msg}</span>}
    </span>
  )
}

const ghost: React.CSSProperties = { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
const btn: React.CSSProperties = { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }
const modal: React.CSSProperties = { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: 'var(--shadow)' }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }
const input: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)' }
const cancel: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', fontSize: '14px', cursor: 'pointer', color: 'var(--text)' }
const submitBtn: React.CSSProperties = { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
