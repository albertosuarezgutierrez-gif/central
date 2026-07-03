'use client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

type SociedadOpt = { id: string; nombre: string }

export function OcultarCuentaBtn({ id, oculta }: { id: string; oculta: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    await fetch(`/api/banca/cuenta/${id}/ocultar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oculta: !oculta }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={oculta ? 'Mostrar cuenta' : 'Ocultar cuenta del resumen'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
        fontSize: '14px', color: 'var(--muted)', opacity: loading ? 0.5 : 1,
        lineHeight: 1,
      }}
    >
      {oculta ? '👁️' : '🙈'}
    </button>
  )
}

// Formulario de subida de extracto Norma 43 (.n43) para una sociedad.
export function ImportarExtractoBtn({ sociedades }: { sociedades: SociedadOpt[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sociedadId, setSociedadId] = useState(sociedades[0]?.id ?? '')
  const [iban, setIban] = useState('')
  const [banco, setBanco] = useState('')
  const [titular, setTitular] = useState<'titular' | 'conyuge'>('titular')
  const [tipo, setTipo] = useState<'corriente' | 'tarjeta'>('corriente')
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
    fd.set('titular', titular)
    fd.set('tipo', tipo)
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
              <label style={lbl}>Tipo de cuenta
                <select value={tipo} onChange={e => setTipo(e.target.value as 'corriente' | 'tarjeta')} style={input}>
                  <option value="corriente">Cuenta corriente</option>
                  <option value="tarjeta">Tarjeta de crédito</option>
                </select>
              </label>
              {tipo === 'tarjeta' && (
                <p style={{ fontSize: '12px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '8px', padding: '8px 12px', margin: 0 }}>
                  Sube el extracto mensual de tu tarjeta Kutxabank (Excel .xlsx). Al importar recibirás un resumen por Telegram con los gastos del mes.
                </p>
              )}
              <label style={lbl}>Sociedad
                <select value={sociedadId} onChange={e => setSociedadId(e.target.value)} style={input}>
                  {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
              <label style={lbl}>Fichero (.xls, .xlsx o .n43)
                <input ref={fileRef} type="file" accept=".n43,.xls,.xlsx,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" style={{ fontSize: '14px' }} />
              </label>
              <label style={lbl}>Titular de la cuenta
                <select value={titular} onChange={e => setTitular(e.target.value as 'titular' | 'conyuge')} style={input}>
                  <option value="titular">Yo (Alberto)</option>
                  <option value="conyuge">Cónyuge (Pilar)</option>
                </select>
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

// Bandeja "Por revisar": la IA dudó de la categoría; el dueño la asigna con un desplegable.
export function RevisarBandeja({ movimientos, categorias }: {
  movimientos: Array<{ id: string; fecha: string | null; concepto: string; importe: number }>
  categorias: Array<{ value: string; label: string }>
}) {
  const router = useRouter()
  const [pendientes, setPendientes] = useState(movimientos)
  const [guardando, setGuardando] = useState<string | null>(null)

  async function asignar(id: string, categoria: string) {
    if (!categoria) return
    setGuardando(id)
    const res = await fetch('/api/banca/revisar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movimientoId: id, categoria }),
    })
    setGuardando(null)
    if (res.ok) {
      setPendientes(p => p.filter(m => m.id !== id))
      router.refresh()
    }
  }

  if (pendientes.length === 0) return null
  return (
    <section style={{ marginBottom: '32px' }}>
      <style>{`
        @media (max-width: 768px) {
          /* Card apilada en móvil (sin scroll horizontal): concepto a ancho completo arriba,
             fecha + importe en una línea, desplegable de categoría a ancho completo abajo. */
          .banca-revisar-row { flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
          .banca-revisar-concepto { order: -1; flex: 1 1 100% !important; white-space: normal !important; overflow: visible !important; }
          .banca-revisar-fecha { width: auto !important; }
          .banca-revisar-importe { width: auto !important; margin-left: auto; }
          .banca-revisar-select { flex: 0 0 100% !important; width: 100% !important; }
          .banca-movs-row { min-width: 480px; }
          .banca-movs-outer { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>🔎 Por revisar ({pendientes.length})</h2>
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>La IA no tuvo clara la categoría de estos movimientos. Asígnasela tú con un clic.</p>
      <div style={{ background: 'var(--surface)', border: '1px solid #f59e0b66', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {pendientes.map((m, i) => (
          <div key={m.id} className="banca-revisar-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <div className="banca-revisar-fecha" style={{ fontSize: '12px', color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</div>
            <div className="banca-revisar-concepto" style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}</div>
            <div className="banca-revisar-importe" style={{ fontSize: '14px', fontWeight: 700, color: m.importe >= 0 ? '#16a34a' : '#dc2626', flexShrink: 0, width: '92px', textAlign: 'right' }}>{eur(m.importe)}</div>
            <select className="banca-revisar-select" defaultValue="" disabled={guardando === m.id} onChange={e => asignar(m.id, e.target.value)} style={{ ...input, flexShrink: 0, width: '152px' }}>
              <option value="" disabled>{guardando === m.id ? 'Guardando…' : 'Categoría…'}</option>
              {categorias.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </section>
  )
}

function eur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
}

// Descarga el CSV de todos los movimientos para enviárselo al gestor.
export function ExportarBtn() {
  return <a href="/api/banca/export" style={{ ...ghost, textDecoration: 'none', display: 'inline-block' }}>📥 Exportar (CSV)</a>
}

type DupMov = { id: string; fecha: string | null; concepto: string; importe: number; conciliado: boolean; origen?: string }
type DupGrupoUI = { clave: string; confianza: 'alta' | 'baja'; importe: number; superaUmbral: boolean; movimientos: DupMov[] }
type DupResueltoUI = { id: string; fecha: string | null; concepto: string; importe: number; estado: 'ignorado' | 'confirmado' }

// Bandeja "Posibles cargos duplicados": pares sospechosos de cobro doble. El dueño los resuelve
// con un clic ("Es normal" / "Es un cobro doble"); la decisión persiste. Plegable de "ya
// resueltos" para reactivar lo que se ignoró por error.
export function DuplicadosBandeja({ grupos, resueltos }: { grupos: DupGrupoUI[]; resueltos: DupResueltoUI[] }) {
  const router = useRouter()
  const [pend, setPend] = useState(grupos)
  const [res, setRes] = useState(resueltos)
  const [busy, setBusy] = useState<string | null>(null)
  const [verResueltos, setVerResueltos] = useState(false)
  const [recl, setRecl] = useState<{ asunto: string; cuerpo: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function redactar(g: DupGrupoUI) {
    setBusy(g.clave)
    const r = await fetch('/api/banca/duplicados/reclamacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comercio: g.movimientos[0]?.concepto || 'Comercio', importe: g.importe, fechas: g.movimientos.map(m => m.fecha).filter((f): f is string => !!f) }),
    })
    setBusy(null)
    const d = await r.json().catch(() => null)
    if (r.ok && d) { setRecl({ asunto: d.asunto, cuerpo: d.cuerpo }); setCopiado(false) }
  }

  async function resolver(g: DupGrupoUI, estado: 'ignorado' | 'confirmado') {
    setBusy(g.clave)
    const ids = g.movimientos.map(m => m.id)
    const r = await fetch('/api/banca/duplicados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, estado }),
    })
    setBusy(null)
    if (r.ok) {
      setPend(p => p.filter(x => x.clave !== g.clave))
      setRes(prev => [...g.movimientos.map(m => ({ id: m.id, fecha: m.fecha, concepto: m.concepto, importe: m.importe, estado })), ...prev])
      router.refresh()
    }
  }

  async function reactivar(id: string) {
    setBusy(id)
    const r = await fetch('/api/banca/duplicados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], estado: null }),
    })
    setBusy(null)
    if (r.ok) { setRes(prev => prev.filter(x => x.id !== id)); router.refresh() }
  }

  if (pend.length === 0 && res.length === 0) return null
  return (
    <section id="duplicados" style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>⚠️ Posibles cargos duplicados ({pend.length})</h2>
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>Mismo importe y comercio en pocos días. Revisa cada par y resuélvelo: no vuelve a salir.</p>

      {pend.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pend.map(g => (
            <div key={g.clave} style={{ background: 'var(--surface)', border: '1px solid #f59e0b66', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: g.confianza === 'alta' ? '#fee2e2' : '#fef3c7', color: g.confianza === 'alta' ? '#b91c1c' : '#92400e' }}>
                  {g.confianza === 'alta' ? 'Sospecha alta' : 'Sospecha baja'}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>{eur(g.importe)}</span>
              </div>
              {g.movimientos.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', padding: '3px 0' }}>
                  <span style={{ color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}{m.conciliado ? ' 🔗' : ''}</span>
                  {m.origen && <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--border)', borderRadius: '4px', padding: '1px 5px', flexShrink: 0, fontWeight: 500 }}>{m.origen}</span>}
                  <span style={{ fontWeight: 700, color: '#dc2626', width: '92px', textAlign: 'right', flexShrink: 0 }}>{eur(m.importe)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
                <button disabled={busy === g.clave} onClick={() => redactar(g)} style={dupGhost}>📝 Reclamar</button>
                <div style={{ flex: 1 }} />
                <button disabled={busy === g.clave} onClick={() => resolver(g, 'ignorado')} style={dupGhost}>Es normal</button>
                <button disabled={busy === g.clave} onClick={() => resolver(g, 'confirmado')} style={dupDanger}>Es un cobro doble</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {res.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <button onClick={() => setVerResueltos(v => !v)} style={{ ...dupGhost, fontSize: '12px' }}>
            {verResueltos ? '▾' : '▸'} Ya resueltos ({res.length})
          </button>
          {verResueltos && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginTop: '8px' }}>
              {res.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: '13px' }}>
                  <span style={{ color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>{m.estado === 'confirmado' ? 'cobro doble' : 'normal'}</span>
                  <span style={{ fontWeight: 700, color: '#dc2626', width: '80px', textAlign: 'right', flexShrink: 0 }}>{eur(m.importe)}</span>
                  <button disabled={busy === m.id} onClick={() => reactivar(m.id)} style={{ ...dupGhost, fontSize: '12px', flexShrink: 0 }}>Reactivar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {recl && (
        <div style={overlay} onClick={() => setRecl(null)}>
          <div style={{ ...modal, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Reclamación</h3>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>{recl.asunto}</p>
            <textarea readOnly value={recl.cuerpo} style={{ ...input, width: '100%', minHeight: '200px', resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button onClick={() => setRecl(null)} style={cancel}>Cerrar</button>
              <button onClick={() => { navigator.clipboard?.writeText(recl.cuerpo); setCopiado(true) }} style={btn}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const dupGhost: React.CSSProperties = { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
const dupDanger: React.CSSProperties = { background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }

// Botón que abre Claude Code web y copia /facturas-correo al portapapeles listo para pegar.
export function RevisarCorreoBtn() {
  const [estado, setEstado] = useState<'idle' | 'ok'>('idle')

  function abrir() {
    navigator.clipboard?.writeText('/facturas-correo').catch(() => {})
    window.open('https://claude.ai/code', '_blank', 'noopener')
    setEstado('ok')
    setTimeout(() => setEstado('idle'), 3000)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={abrir} style={ghost} title="Abre Claude Code y copia el comando al portapapeles">
        {estado === 'ok' ? '✓ Comando copiado' : '📧 Revisar correo'}
      </button>
      {estado === 'ok' && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Pega con Ctrl+V en Claude</span>}
    </span>
  )
}

// Tabla de movimientos con buscador + filtros (texto, signo, categoría). Filtra en cliente
// sobre los movimientos ya cargados; sin llamadas extra al servidor.
type MovTabla = {
  id: string; fecha: string | null; concepto: string; categoria: string | null
  importe: number; conciliado: boolean
}
export function MovimientosTabla({ movimientos, catLabel }: {
  movimientos: MovTabla[]
  catLabel: Record<string, string>
}) {
  // Filas montadas de inicio; el resto sale con «Ver más» (regla global de rendimiento).
  const PAGE = 50
  const [q, setQ] = useState('')
  const [signo, setSigno] = useState<'todos' | 'ingreso' | 'gasto'>('todos')
  const [cat, setCat] = useState('todas')
  const [visibles, setVisibles] = useState(PAGE)

  const cats = Array.from(new Set(movimientos.map(m => m.categoria).filter(Boolean))) as string[]
  const texto = q.trim().toLowerCase()
  const filtrados = movimientos.filter(m => {
    if (texto && !m.concepto.toLowerCase().includes(texto)) return false
    if (signo === 'ingreso' && m.importe < 0) return false
    if (signo === 'gasto' && m.importe >= 0) return false
    if (cat !== 'todas' && m.categoria !== cat) return false
    return true
  })
  const suma = filtrados.reduce((s, m) => s + m.importe, 0)
  const conc = filtrados.filter(m => m.conciliado).length

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Movimientos</h2>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {filtrados.length}/{movimientos.length} · suma {eur(suma)} · 🔗 {conc} conciliados
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input value={q} onChange={e => { setQ(e.target.value); setVisibles(PAGE) }} placeholder="🔍 Buscar concepto…"
          style={{ ...input, flex: '1 1 200px', minWidth: '160px' }} />
        <select value={signo} onChange={e => { setSigno(e.target.value as typeof signo); setVisibles(PAGE) }} style={{ ...input, flexShrink: 0 }}>
          <option value="todos">Ingresos y gastos</option>
          <option value="ingreso">Solo ingresos</option>
          <option value="gasto">Solo gastos</option>
        </select>
        <select value={cat} onChange={e => { setCat(e.target.value); setVisibles(PAGE) }} style={{ ...input, flexShrink: 0 }}>
          <option value="todas">Todas las categorías</option>
          {cats.map(c => <option key={c} value={c}>{catLabel[c] || c}</option>)}
        </select>
      </div>
      <div className="banca-movs-outer">
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>Sin movimientos que coincidan.</div>
        ) : filtrados.slice(0, visibles).map((m, i) => (
          <div key={m.id} className="banca-movs-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}</div>
              {m.categoria && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{catLabel[m.categoria] || m.categoria}</div>}
            </div>
            <div style={{ fontSize: '13px', flexShrink: 0, width: '18px', textAlign: 'center' }} title={m.conciliado ? 'Conciliado con factura' : 'Sin conciliar'}>
              {m.conciliado ? '🔗' : ''}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: m.importe >= 0 ? '#16a34a' : '#dc2626', flexShrink: 0, width: '92px', textAlign: 'right' }}>{eur(m.importe)}</div>
          </div>
        ))}
        {filtrados.length > visibles && (
          <button onClick={() => setVisibles(v => v + 100)}
            style={{ display: 'block', width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Ver más ({filtrados.length - visibles} movimientos restantes)
          </button>
        )}
      </div>
      </div>
    </section>
  )
}
