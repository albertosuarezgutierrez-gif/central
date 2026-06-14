'use client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

type SociedadOpt = { id: string; nombre: string }

// Formulario de subida de extracto Norma 43 (.n43) para una sociedad.
export function ImportarExtractoBtn({ sociedades }: { sociedades: SociedadOpt[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sociedadId, setSociedadId] = useState(sociedades[0]?.id ?? '')
  const [iban, setIban] = useState('')
  const [banco, setBanco] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setErr('Selecciona un fichero (.xls, .xlsx o .n43)'); return }
    if (!sociedadId) { setErr('Selecciona una sociedad'); return }
    setLoading(true); setErr(''); setMsg('')

    const fd = new FormData()
    fd.set('sociedadId', sociedadId)
    fd.set('file', file)
    if (iban) fd.set('iban', iban)
    if (banco) fd.set('banco', banco)
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
      <button onClick={() => { setOpen(true); setMsg(''); setErr('') }} style={btn}>⬆️ Importar extracto</button>
      {open && (
        <div style={overlay} onClick={() => setOpen(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Importar extracto bancario</h3>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>Excel del banco (.xls/.xlsx — Kutxa, BBVA…) o fichero Norma 43 (.n43).</p>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={lbl}>Sociedad
                <select value={sociedadId} onChange={e => setSociedadId(e.target.value)} style={input}>
                  {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
              <label style={lbl}>Fichero (.xls, .xlsx o .n43)
                <input ref={fileRef} type="file" accept=".n43,.xls,.xlsx,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" style={{ fontSize: '14px' }} />
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ ...lbl, flex: 1 }}>Banco (opcional)
                  <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Kutxa" style={input} />
                </label>
                <label style={{ ...lbl, flex: 1.4 }}>IBAN/alias (opcional)
                  <input value={iban} onChange={e => setIban(e.target.value)} placeholder="ES…" style={input} />
                </label>
              </div>
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

// Sube una FOTO/imagen de factura → OCR (IA) → intenta casarla con un movimiento.
export function SubirFacturaBtn() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true); setErr(''); setMsg('')
    const fd = new FormData(); fd.set('file', file)
    const res = await fetch('/api/banca/factura', { method: 'POST', body: fd })
    setLoading(false)
    const data = await res.json().catch(() => ({}))
    if (fileRef.current) fileRef.current.value = ''
    if (!res.ok) { setErr(data.error || 'Error'); return }
    const f = data.factura
    setMsg(`${f.emisor} · ${f.importe}€ · ${f.fecha}` + (data.conciliado ? ' → ✅ conciliada con un movimiento' : ' → sin movimiento que casar'))
    if (data.conciliado) router.refresh()
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={() => fileRef.current?.click()} disabled={loading} style={ghost}>{loading ? 'Leyendo…' : '📄 Subir factura (OCR)'}</button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
      {msg && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{msg}</span>}
      {err && <span style={{ fontSize: '12px', color: '#dc2626' }}>{err}</span>}
    </span>
  )
}

// Conexión automática del banco vía Open Banking (PSD2/Enable Banking): elige banco +
// sociedad, crea el consentimiento y redirige al banco para autorizar.
export function ConectarBancoBtn({ sociedades }: { sociedades: SociedadOpt[] }) {
  const [open, setOpen] = useState(false)
  const [insts, setInsts] = useState<Array<{ id: string; name: string }>>([])
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-config' | 'error'>('cargando')
  const [sociedadId, setSociedadId] = useState(sociedades[0]?.id ?? '')
  const [instId, setInstId] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function abrir() {
    setOpen(true); setEstado('cargando'); setErr('')
    const res = await fetch('/api/banca/psd2/instituciones?country=ES')
    const data = await res.json().catch(() => ({}))
    if (data.disponible === false) { setEstado('no-config'); return }
    if (!res.ok) { setEstado('error'); setErr(data.error || 'Error'); return }
    setInsts(data.instituciones || []); setInstId(data.instituciones?.[0]?.id ?? ''); setEstado('ok')
  }

  async function conectar(e: React.FormEvent) {
    e.preventDefault()
    if (!instId || !sociedadId) return
    setLoading(true); setErr('')
    const inst = insts.find(i => i.id === instId)
    const res = await fetch('/api/banca/psd2/conectar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sociedadId, institutionId: instId, institutionNombre: inst?.name }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok || !data.link) { setErr(data.error || 'No se pudo crear el consentimiento'); return }
    window.location.href = data.link   // redirige al banco para autorizar
  }

  if (sociedades.length === 0) return null
  return (
    <>
      <button onClick={abrir} style={ghost}>🏦 Conectar banco (auto)</button>
      {open && (
        <div style={overlay} onClick={() => setOpen(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Conectar banco automáticamente</h3>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>Open Banking (PSD2): autorizas en tu banco y los saldos/movimientos entran solos.</p>
            {estado === 'cargando' && <p style={{ fontSize: '14px', color: 'var(--muted)' }}>Cargando bancos…</p>}
            {estado === 'no-config' && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Falta configurar Enable Banking (envs <code>ENABLEBANKING_APP_ID</code> y <code>ENABLEBANKING_PRIVATE_KEY</code> en Vercel). Mientras tanto, importa el Excel/Norma 43.</p>}
            {estado === 'error' && <p style={{ fontSize: '13px', color: '#dc2626' }}>{err}</p>}
            {estado === 'ok' && (
              <form onSubmit={conectar} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={lbl}>Sociedad
                  <select value={sociedadId} onChange={e => setSociedadId(e.target.value)} style={input}>
                    {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </label>
                <label style={lbl}>Banco
                  <select value={instId} onChange={e => setInstId(e.target.value)} style={input}>
                    {insts.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </label>
                {err && <p style={{ color: '#dc2626', fontSize: '13px' }}>{err}</p>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setOpen(false)} style={cancel}>Cerrar</button>
                  <button type="submit" disabled={loading} style={submitBtn}>{loading ? 'Conectando…' : 'Ir a mi banco →'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
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
