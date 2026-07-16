'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { eur } from '@/lib/dinero'
import { deducibleDeMovimiento } from '@/lib/deducibilidad'

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

// Barra de acciones consolidada: un botón principal «➕ Añadir» (importar extracto / conectar banco)
// y un desplegable «⋯ Más» (subir factura, conciliar, re-analizar, exportar, revisar correo). Antes
// eran 7 botones apilados que en móvil se comían la primera pantalla entera. Reutiliza los botones
// existentes tal cual (mantienen sus modales y su lógica): aquí solo cambia el CONTENEDOR.
export function AccionesBanca({ anadir, mas }: { anadir: React.ReactNode; mas: React.ReactNode }) {
  const [abierto, setAbierto] = useState<null | 'anadir' | 'mas'>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(null)
    }
    document.addEventListener('click', fuera)
    return () => document.removeEventListener('click', fuera)
  }, [])
  return (
    <div ref={ref} style={{ display: 'flex', gap: '10px', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <button type="button" aria-expanded={abierto === 'anadir'}
          onClick={() => setAbierto(a => (a === 'anadir' ? null : 'anadir'))} style={btn}>➕ Añadir</button>
        {abierto === 'anadir' && (
          <div style={menuPanel} onClick={() => setAbierto(null)}>{anadir}</div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <button type="button" aria-expanded={abierto === 'mas'}
          onClick={() => setAbierto(a => (a === 'mas' ? null : 'mas'))} style={ghost}>⋯ Más</button>
        {abierto === 'mas' && (
          <div style={{ ...menuPanel, left: 'auto', right: 0 }} onClick={() => setAbierto(null)}>{mas}</div>
        )}
      </div>
    </div>
  )
}
const menuPanel: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30,
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
  boxShadow: 'var(--shadow)', padding: '8px', minWidth: '230px', maxWidth: '86vw',
  display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch',
}

// Envoltorio plegable para agrupar los paneles secundarios (IA / herramientas) y que no tapen los
// movimientos. Cerrado por defecto y con MONTAJE PEREZOSO: los hijos no se renderizan (ni disparan
// sus fetch bajo demanda) hasta que se abre. Sigue la regla de rendimiento del monorepo.
export function Plegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <section style={{ marginBottom: '32px' }}>
      <button type="button" onClick={() => setAbierto(a => !a)}
        style={{ ...ghost, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{titulo}</span>
        <span style={{ color: 'var(--muted)' }}>{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && <div style={{ marginTop: '16px' }}>{children}</div>}
    </section>
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
    setMsg(`${f.emisor} · ${eur(f.importe)} · ${f.fecha}` + (data.conciliado ? ' → ✅ conciliada con un movimiento' : ' → sin movimiento que casar'))
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
        }
      `}</style>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>🏷️ Gastos por revisar · categoría ({pendientes.length})</h2>
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>La IA no tuvo clara la <strong>categoría contable</strong> de estos gastos. Asígnasela tú con un clic. (El <em>negocio</em> de los ingresos dudosos se asigna arriba, en «Ingresos por revisar».)</p>
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

// Libro COMPLETO de movimientos: filtros por cuenta bancaria, rango de fechas, signo y texto, con
// paginación de SERVIDOR («Ver más» → /api/banca/movimientos). Así se llega a CUALQUIER movimiento
// (antes solo se veían los 300 más recientes). Cada fila permite reclasificar el negocio en línea.
type MovLedgerUI = {
  id: string; fecha: string | null; concepto: string; contraparte: string | null
  importe: number; destino: string | null; categoria: string | null; banco: string | null
  cuentaBancariaId: string; conciliado: boolean; requiereRevision: boolean; amortizable: boolean
}
// Destinos que acepta /api/banca/destino (sin actividad_pilar, que es de las cuentas de Pilar).
const DESTINOS_RECLASIF = ['turistico_pisos', 'turistico_duplex', 'seguros', 'traspaso_interno', 'personal'] as const
// El endpoint /api/finanzas/gastos/sugerir razona en BUCKETS de deducibilidad; el libro reclasifica
// por DESTINO. Este mapa traduce la sugerencia de la IA al destino que aplica el `<select>`.
const BUCKET_A_DESTINO: Record<string, string> = {
  negocio: 'seguros',
  renta: 'turistico_pisos',
  no_deducible: 'personal',
}
type SugFila = { destino: string; motivo: string } | 'cargando' | 'error'

export function MovimientosTabla({ cuentas, destinoLabel, initial, periodo }: {
  cuentas: { id: string; label: string }[]
  destinoLabel: Record<string, string>
  initial: { movimientos: MovLedgerUI[]; total: number; hayMas: boolean }
  // Rango por defecto (mes en curso): el SSR `initial` ya viene acotado a él y los filtros
  // arrancan con estas fechas. "Limpiar" las vacía → se ve TODO el histórico.
  periodo?: { desde: string; hasta: string }
}) {
  const PAGE = 50
  const [cuenta, setCuenta] = useState('')
  const [desde, setDesde] = useState(periodo?.desde ?? '')
  const [hasta, setHasta] = useState(periodo?.hasta ?? '')
  const [signo, setSigno] = useState<'todos' | 'ingreso' | 'gasto'>('todos')
  const [q, setQ] = useState('')
  const [movs, setMovs] = useState<MovLedgerUI[]>(initial.movimientos)
  const [total, setTotal] = useState(initial.total)
  const [hayMas, setHayMas] = useState(initial.hayMas)
  const [loading, setLoading] = useState(false)
  const [sugs, setSugs] = useState<Record<string, SugFila>>({})
  const primera = useRef(true)

  function params(offset: number): string {
    const p = new URLSearchParams()
    if (cuenta) p.set('cuenta', cuenta)
    if (desde) p.set('desde', desde)
    if (hasta) p.set('hasta', hasta)
    if (signo !== 'todos') p.set('signo', signo)
    if (q.trim()) p.set('q', q.trim())
    p.set('limit', String(PAGE)); p.set('offset', String(offset))
    return p.toString()
  }

  async function cargar(offset: number, append: boolean) {
    setLoading(true)
    try {
      const res = await fetch(`/api/banca/movimientos?${params(offset)}`)
      if (!res.ok) return
      const data = await res.json() as { movimientos: MovLedgerUI[]; total: number; hayMas: boolean }
      setTotal(data.total); setHayMas(data.hayMas)
      setMovs(prev => append ? [...prev, ...data.movimientos] : data.movimientos)
    } finally { setLoading(false) }
  }

  // Refetch al cambiar filtros (debounce para el texto). El primer render usa `initial` (SSR).
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    const t = setTimeout(() => cargar(0, false), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta, desde, hasta, signo, q])

  async function reclasificar(id: string, destino: string) {
    setMovs(prev => prev.map(m => m.id === id ? { ...m, destino } : m))
    await fetch('/api/banca/destino', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, destino }),
    }).catch(() => {})
  }

  // 🤖 Sugerir el negocio de un cargo con la IA (bajo demanda, por fila). Reutiliza el endpoint del
  // triaje de gastos (bucket + motivo, prompt de deducibilidad afinado) y traduce bucket → destino.
  // Solo SUGIERE: Alberto aplica con «Aplicar» (que reclasifica y aprende regla, igual que el select).
  async function sugerir(id: string) {
    setSugs(prev => ({ ...prev, [id]: 'cargando' }))
    try {
      const res = await fetch('/api/finanzas/gastos/sugerir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('no ok')
      const data = await res.json() as { bucket?: string; motivo?: string }
      const destino = BUCKET_A_DESTINO[data.bucket || '']
      if (!destino) throw new Error('sin destino')
      setSugs(prev => ({ ...prev, [id]: { destino, motivo: (data.motivo || '').trim() } }))
    } catch {
      setSugs(prev => ({ ...prev, [id]: 'error' }))
    }
  }

  function aplicarSugerencia(id: string, destino: string) {
    reclasificar(id, destino)
    setSugs(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function descartarSugerencia(id: string) {
    setSugs(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const sumaCargados = movs.reduce((s, m) => s + m.importe, 0)

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Todos los movimientos</h2>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {total} en total · {movs.length} cargados · suma cargada {eur(sumaCargados)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Buscar concepto o contraparte…"
          style={{ ...input, flex: '1 1 200px', minWidth: '160px' }} />
        {cuentas.length > 1 && (
          <select value={cuenta} onChange={e => setCuenta(e.target.value)} style={{ ...input, flexShrink: 0 }}>
            <option value="">Todas las cuentas</option>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <select value={signo} onChange={e => setSigno(e.target.value as typeof signo)} style={{ ...input, flexShrink: 0 }}>
          <option value="todos">Ingresos y gastos</option>
          <option value="ingreso">Solo ingresos</option>
          <option value="gasto">Solo gastos</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
          Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...input, padding: '6px 8px' }} />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
          Hasta <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...input, padding: '6px 8px' }} />
        </label>
        {(cuenta || desde || hasta || signo !== 'todos' || q) && (
          <button onClick={() => { setCuenta(''); setDesde(''); setHasta(''); setSigno('todos'); setQ('') }}
            style={{ ...ghost, padding: '8px 12px', fontSize: '13px' }}>Limpiar</button>
        )}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <span><span style={{ color: 'var(--positive)' }}>✅</span> Deducible</span>
        <span><span style={{ color: 'var(--negative)' }}>❌</span> No deducible</span>
        <span>🔁 Traspaso</span>
        <span><sup style={{ fontSize: '9px' }}>A</sup> Amortizable (se reparte por años)</span>
        <span>🔗 Con factura</span>
      </div>
      <div className="banca-movs-outer">
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
        {movs.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>
            {loading ? 'Cargando…' : 'Sin movimientos que coincidan.'}
          </div>
        ) : movs.map((m, i) => {
          // Badge de deducibilidad IRPF, derivado del negocio (`destino`) que puso la IA/agente.
          // Sólo en gastos: los ingresos no llevan badge (deducible/no es concepto de gasto).
          const ded = deducibleDeMovimiento(m.destino, m.importe)
          const sug = sugs[m.id]
          return (
          <div key={m.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
          <div className="banca-movs-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.requiereRevision && <span title="Pendiente de revisar">🔎 </span>}{m.concepto}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{m.banco || ''}</div>
            </div>
            {m.importe < 0 && (
              <button onClick={() => sugerir(m.id)} disabled={sug === 'cargando'}
                title="Pídele a la IA que sugiera el negocio de este cargo"
                style={{ ...ghost, padding: '5px 8px', fontSize: '13px', flexShrink: 0, cursor: sug === 'cargando' ? 'default' : 'pointer', opacity: sug === 'cargando' ? 0.5 : 1 }}>🤖</button>
            )}
            <select value={DESTINOS_RECLASIF.includes(m.destino as typeof DESTINOS_RECLASIF[number]) ? m.destino! : ''}
              onChange={e => reclasificar(m.id, e.target.value)}
              title="Reclasificar el negocio de este movimiento"
              style={{ ...input, padding: '5px 6px', fontSize: '12px', flexShrink: 0, maxWidth: '150px' }}>
              <option value="" disabled>{m.destino ? (destinoLabel[m.destino] || m.destino) : 'Sin negocio'}</option>
              {DESTINOS_RECLASIF.map(d => <option key={d} value={d}>{destinoLabel[d] || d}</option>)}
            </select>
            <div className="banca-movs-ded" style={{ fontSize: '13px', flexShrink: 0, width: '22px', textAlign: 'center' }}
              title={ded.kind === 'ingreso' ? 'Ingreso' : ded.kind === 'gasto' && m.amortizable ? `${ded.label} · bien amortizable (se reparte por años)` : ded.label}>
              {ded.kind === 'ingreso' ? '' : (
                <span style={{ color: ded.color }}>{ded.icon}{ded.kind === 'gasto' && ded.deducible && m.amortizable ? <sup style={{ fontSize: '9px' }}>A</sup> : null}</span>
              )}
            </div>
            <div style={{ fontSize: '13px', flexShrink: 0, width: '18px', textAlign: 'center' }} title={m.conciliado ? 'Conciliado con factura' : 'Sin conciliar'}>
              {m.conciliado ? '🔗' : ''}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: m.importe >= 0 ? '#16a34a' : '#dc2626', flexShrink: 0, width: '92px', textAlign: 'right' }}>{eur(m.importe)}</div>
          </div>
          {sug && (
            <div style={{ padding: '0 16px 12px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {sug === 'cargando' ? (
                <span style={{ color: 'var(--muted)' }}>🤖 Pensando…</span>
              ) : sug === 'error' ? (
                <span style={{ color: 'var(--muted)' }}>🤖 No he podido sugerir ahora mismo. Inténtalo de nuevo.</span>
              ) : (
                <>
                  <span style={{ color: 'var(--text)' }}>
                    🤖 Parece <strong>{destinoLabel[sug.destino] || sug.destino}</strong>{sug.motivo ? ` · ${sug.motivo}` : ''}
                  </span>
                  <button onClick={() => aplicarSugerencia(m.id, sug.destino)}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Aplicar</button>
                  <button onClick={() => descartarSugerencia(m.id)}
                    style={{ ...ghost, padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>Descartar</button>
                </>
              )}
            </div>
          )}
          </div>
          )
        })}
        {hayMas && (
          <button onClick={() => cargar(movs.length, true)} disabled={loading}
            style={{ display: 'block', width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Cargando…' : `Ver más (${total - movs.length} movimientos restantes)`}
          </button>
        )}
      </div>
      </div>
    </section>
  )
}

// Bandeja de INGRESOS por revisar: abonos cuyo negocio está sin confirmar. Antes no aparecían en
// ningún sitio accionable (la revisión de gastos es solo importe<0). Aquí el dueño les asigna el
// negocio (destino) en línea; al hacerlo, la fila desaparece de la bandeja.
export function IngresosPorRevisar({ ingresos, destinoLabel }: {
  ingresos: MovLedgerUI[]
  destinoLabel: Record<string, string>
}) {
  const [items, setItems] = useState(ingresos)
  if (items.length === 0) return null

  async function asignar(id: string, destino: string) {
    setItems(prev => prev.filter(m => m.id !== id))
    await fetch('/api/banca/destino', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, destino }),
    }).catch(() => {})
  }

  return (
    <section style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>🔎 Ingresos por revisar</h2>
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
        Abonos entrantes cuyo negocio no está confirmado. Asígnales el negocio para que cuadren en el P&amp;L.
      </p>
      <div className="banca-movs-outer">
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {items.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{m.banco || ''}</div>
            </div>
            <select defaultValue="" onChange={e => e.target.value && asignar(m.id, e.target.value)}
              style={{ ...input, padding: '5px 6px', fontSize: '12px', flexShrink: 0, maxWidth: '160px' }}>
              <option value="" disabled>Asignar negocio…</option>
              {DESTINOS_RECLASIF.map(d => <option key={d} value={d}>{destinoLabel[d] || d}</option>)}
            </select>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a', flexShrink: 0, width: '92px', textAlign: 'right' }}>{eur(m.importe)}</div>
          </div>
        ))}
      </div>
      </div>
    </section>
  )
}

// Panel de "reglas aprendidas" (clave → negocio): lo que el sistema ha aprendido al reclasificar a
// mano. Colapsado por defecto (carga perezosa al abrir). Marca en rojo las claves sospechosas
// (genéricas/trampa) y permite borrar cualquiera. Da transparencia sobre lo que causó el incidente.
type ReglaAprendida = {
  clave: string; destino: string; destinoLabel: string; subcategoria: string | null
  creadoAt: string | null; sospechosa: boolean
}
export function ReglasAprendidas() {
  const [abierto, setAbierto] = useState(false)
  const [reglas, setReglas] = useState<ReglaAprendida[] | null>(null)
  const [cargando, setCargando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch('/api/banca/reglas')
      if (res.ok) setReglas(((await res.json()) as { reglas: ReglaAprendida[] }).reglas)
    } finally { setCargando(false) }
  }
  function toggle() {
    const next = !abierto
    setAbierto(next)
    if (next && reglas === null) cargar()
  }
  async function borrar(clave: string) {
    setReglas(prev => prev ? prev.filter(r => r.clave !== clave) : prev)
    await fetch('/api/banca/reglas', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }),
    }).catch(() => {})
  }

  const sospechosas = reglas?.filter(r => r.sospechosa).length ?? 0

  return (
    <section style={{ marginTop: '32px' }}>
      <button onClick={toggle} style={{ ...ghost, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>🧠 Reglas aprendidas {reglas ? `(${reglas.length})` : ''}{sospechosas > 0 ? ` · ⚠️ ${sospechosas} sospechosa${sospechosas > 1 ? 's' : ''}` : ''}</span>
        <span style={{ color: 'var(--muted)' }}>{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div className="banca-movs-outer" style={{ marginTop: '10px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {cargando && reglas === null ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>Cargando…</div>
            ) : !reglas || reglas.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>Aún no hay reglas aprendidas.</div>
            ) : (
              <>
                <div style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  Cuando reclasificas un movimiento, el sistema aprende la regla y la aplica a los iguales. Borra las que no cuadren.
                </div>
                {reglas.map((r, i) => (
                  <div key={r.clave} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: r.sospechosa ? 'var(--negative-bg, rgba(220,38,38,.08))' : undefined }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.sospechosa && <span title="Clave genérica: ya no se aplica; conviene borrarla">⚠️ </span>}
                        <code>{r.clave}</code> → {r.destinoLabel}{r.subcategoria ? ` · ${r.subcategoria}` : ''}
                      </div>
                      {r.creadoAt && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>aprendida {r.creadoAt}</div>}
                    </div>
                    <button onClick={() => borrar(r.clave)} title="Borrar regla"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer', flexShrink: 0 }}>
                      Borrar
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
