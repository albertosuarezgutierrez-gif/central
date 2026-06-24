'use client'
import { useState, useEffect, useCallback } from 'react'

// Espejo de los tipos de lib/finanzas.ts (sin importar el módulo de servidor en el cliente).
type Bucket = 'negocio' | 'renta' | 'no_deducible' | 'traspaso'
type GastoMov = {
  id: string; fecha: string | null; concepto: string; banco: string; importe: number
  destino: string; destinoLabel: string; bucket: Bucket; deducible: boolean
  confirmado: boolean; porRevisar: boolean; conciliado: boolean; facturaRef: string | null
  amortizable: boolean; busqueda: string; comercio: string | null
}
type GastoGrupo = {
  comercio: string | null; label: string; count: number; total: number; sinJustificante: number; movs: GastoMov[]
}
type GastosControl = {
  porRevisar: GastoMov[]
  porRevisarGrupos: GastoGrupo[]
  buckets: { bucket: Bucket; label: string; deducible: boolean; total: number; movs: GastoMov[] }[]
  resumen: { deducibleTotal: number; amortizablesTotal: number; noDeducibleTotal: number; sinJustificante: number }
  year: number; quarter: number
}
type Sugerencia = { bucket: Bucket; amortizable: boolean; motivo: string }

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// Destinos a los que se puede mover un cargo (con el destino concreto que persiste).
const DESTINOS: { v: string; label: string }[] = [
  { v: 'seguros', label: '🛡️ Correduría' },
  { v: 'turistico_pisos', label: '🏖️ Pisos (Kutxa)' },
  { v: 'turistico_duplex', label: '🏠 Dúplex' },
  { v: 'personal', label: '👨‍👩‍👧 Personal' },
  { v: 'traspaso_interno', label: '🔁 Traspaso' },
]
// Destino por defecto al confirmar la sugerencia de la IA (Alberto puede afinar con los botones).
const BUCKET_DESTINO: Record<Bucket, string> = {
  negocio: 'seguros', renta: 'turistico_pisos', no_deducible: 'personal', traspaso: 'traspaso_interno',
}

const btn: React.CSSProperties = {
  padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer',
}

export default function GastosTab({ year, quarter }: { year: number; quarter: number }) {
  const [data, setData] = useState<GastosControl | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [reclasif, setReclasif] = useState<string | null>(null)
  const [reclasifGrupo, setReclasifGrupo] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [sugerencias, setSugerencias] = useState<Record<string, Sugerencia | 'loading' | 'error'>>({})
  const [sugLote, setSugLote] = useState<Record<string, Sugerencia>>({})   // keyed por id del representante del grupo
  const [sugLoteEstado, setSugLoteEstado] = useState<'idle' | 'loading' | 'error'>('idle')

  const cargar = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/finanzas/gastos?year=${year}&quarter=${quarter}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar los gastos'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [year, quarter])

  useEffect(() => { cargar() }, [cargar])

  async function reclasificar(id: string, destino: string) {
    setBusy(id)
    await fetch('/api/banca/destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, destino }) })
    setReclasif(null); setBusy(null); cargar()
  }
  async function confirmar(id: string) {
    setBusy(id)
    await fetch('/api/banca/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirmado: true }) })
    setBusy(null); cargar()
  }
  async function toggleAmort(id: string, amortizable: boolean) {
    setBusy(id)
    await fetch('/api/banca/amortizable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, amortizable }) })
    setBusy(null); cargar()
  }
  async function sugerir(id: string) {
    setSugerencias(s => ({ ...s, [id]: 'loading' }))
    try {
      const res = await fetch('/api/finanzas/gastos/sugerir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error()
      const sug = await res.json() as Sugerencia
      setSugerencias(s => ({ ...s, [id]: sug }))
    } catch { setSugerencias(s => ({ ...s, [id]: 'error' })) }
  }
  // Acciones de GRUPO (un comercio): una decisión clasifica todos los iguales.
  async function reclasificarGrupo(g: GastoGrupo, destino: string) {
    const key = g.comercio ?? g.movs[0].id
    setBusy(key)
    // Reclasificar el representante: si trae comercio, el endpoint aprende la regla y la aplica a
    // TODOS los iguales (mismo comercio); si es suelto, solo a ese.
    await fetch('/api/banca/destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.movs[0].id, destino }) })
    setReclasifGrupo(null); setBusy(null); cargar()
  }
  async function confirmarGrupo(g: GastoGrupo) {
    const key = g.comercio ?? g.movs[0].id
    setBusy(key)
    await Promise.all(g.movs.map(m =>
      fetch('/api/banca/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, confirmado: true }) })
    ))
    setBusy(null); cargar()
  }
  // Sugerencia IA en BLOQUE para toda la bandeja (un representante por grupo).
  async function sugerirTodo() {
    if (!data) return
    setSugLoteEstado('loading')
    try {
      const ids = data.porRevisarGrupos.map(g => g.movs[0].id)
      const res = await fetch('/api/finanzas/gastos/sugerir-lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      if (!res.ok) throw new Error()
      setSugLote(await res.json()); setSugLoteEstado('idle')
    } catch { setSugLoteEstado('error') }
  }
  async function applyDestinoGrupo(g: GastoGrupo, destino: string, amort: boolean) {
    await fetch('/api/banca/destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.movs[0].id, destino }) })
    if (amort) await Promise.all(g.movs.map(m =>
      fetch('/api/banca/amortizable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, amortizable: true }) })))
  }
  async function aceptarGrupo(g: GastoGrupo) {
    const sug = sugLote[g.movs[0].id]; if (!sug) return
    const key = g.comercio ?? g.movs[0].id; setBusy(key)
    await applyDestinoGrupo(g, BUCKET_DESTINO[sug.bucket], sug.amortizable)
    setBusy(null); cargar()
  }
  async function aceptarTodas() {
    if (!data) return
    setBusy('__all__')
    for (const g of data.porRevisarGrupos) {
      const sug = sugLote[g.movs[0].id]
      if (sug) await applyDestinoGrupo(g, BUCKET_DESTINO[sug.bucket], sug.amortizable)
    }
    setSugLote({}); setBusy(null); cargar()
  }
  async function aplicarSugerencia(id: string, sug: Sugerencia) {
    setBusy(id)
    await fetch('/api/banca/destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, destino: BUCKET_DESTINO[sug.bucket] }) })
    if (sug.amortizable) {
      await fetch('/api/banca/amortizable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, amortizable: true }) })
    }
    setBusy(null); cargar()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>Cargando gastos…</div>
  if (error) return <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#dc2626' }}>{error}</div>
  if (!data) return null

  function Fila({ m, enBandeja }: { m: GastoMov; enBandeja: boolean }) {
    const sug = sugerencias[m.id]
    const sinJustif = m.deducible && !m.conciliado && !m.facturaRef
    return (
      <div style={{ border: `1px solid ${enBandeja ? '#fdba74' : 'var(--border)'}`, background: enBandeja ? '#fff7ed' : 'transparent', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{m.concepto}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{m.fecha ?? '—'} · {m.banco}</span>
              <span style={{ padding: '1px 7px', borderRadius: 10, background: 'var(--primary-light)', color: 'var(--text)' }}>{m.destinoLabel}</span>
              {m.amortizable && <span style={{ padding: '1px 7px', borderRadius: 10, background: '#e9d8fd', color: '#553c9a' }}>📦 amortizable</span>}
              {m.deducible && (m.conciliado || m.facturaRef
                ? <span style={{ color: '#16a34a' }}>📎 con factura</span>
                : <span style={{ color: '#ea580c' }}>❗ sin justificante</span>)}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#e53e3e', whiteSpace: 'nowrap' }}>−{fmt(m.importe)}</div>
        </div>

        {/* Sugerencia IA */}
        {sug && sug !== 'loading' && sug !== 'error' && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--primary-light)', fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>🤖 sugiere: <strong>{DESTINOS.find(d => d.v === BUCKET_DESTINO[sug.bucket])?.label}</strong>{sug.amortizable ? ' · 📦 amortizable' : ''} — {sug.motivo}</span>
            <button disabled={busy === m.id} onClick={() => aplicarSugerencia(m.id, sug)} style={{ ...btn, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>Confirmar</button>
          </div>
        )}
        {sug === 'error' && <div style={{ marginTop: 6, fontSize: 11, color: '#ea580c' }}>La IA no pudo sugerir ahora mismo.</div>}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {reclasif === m.id ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Mover a:</span>
              {DESTINOS.filter(d => d.v !== m.destino).map(d => (
                <button key={d.v} disabled={busy === m.id} onClick={() => reclasificar(m.id, d.v)} style={btn}>{d.label}</button>
              ))}
              <button onClick={() => setReclasif(null)} style={{ ...btn, border: 'none', background: 'none', color: 'var(--muted)' }}>cancelar</button>
            </>
          ) : (
            <>
              {enBandeja && (
                <button disabled={busy === m.id} onClick={() => confirmar(m.id)} style={{ ...btn, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', fontWeight: 600 }}>✓ Está bien</button>
              )}
              <button disabled={busy === m.id} onClick={() => setReclasif(m.id)} style={btn}>↪ Reclasificar</button>
              <button disabled={busy === m.id} onClick={() => toggleAmort(m.id, !m.amortizable)} style={{ ...btn, ...(m.amortizable ? { borderColor: '#9f7aea', color: '#553c9a' } : {}) }}>
                {m.amortizable ? '📦 quitar amortizable' : '📦 amortizable'}
              </button>
              {sug !== 'loading' && !sug && <button disabled={busy === m.id} onClick={() => sugerir(m.id)} style={btn}>🤖 sugerir</button>}
              {sug === 'loading' && <span style={{ fontSize: 11, color: 'var(--muted)' }}>🤖 pensando…</span>}
              {m.deducible && !m.conciliado && !m.facturaRef && (
                <a href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(m.busqueda)}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>🔎 buscar factura</a>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  function Grupo({ g }: { g: GastoGrupo }) {
    const key = g.comercio ?? g.movs[0].id
    const abierto = expandido === key
    const sel = reclasifGrupo === key
    return (
      <div style={{ border: '1px solid #fdba74', background: '#fff7ed', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>
              {g.label}{g.count > 1 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> ×{g.count}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Cargo suelto: muestra fecha · banco para poder localizarlo (el concepto «Adeudo nº…» no
                  identifica banco ni fecha). En grupos de varios las fechas difieren → se ven al desplegar. */}
              {g.count === 1 && <span>{g.movs[0].fecha ?? '—'}{g.movs[0].banco ? ` · ${g.movs[0].banco}` : ''}</span>}
              <span style={{ padding: '1px 7px', borderRadius: 10, background: 'var(--primary-light)', color: 'var(--text)' }}>{g.movs[0].destinoLabel}</span>
              {g.sinJustificante > 0 && <span style={{ color: '#ea580c' }}>❗ {g.sinJustificante} sin justificante</span>}
              {g.count > 1 && <button onClick={() => setExpandido(abierto ? null : key)} style={{ ...btn, padding: '1px 8px', fontSize: 11 }}>{abierto ? 'ocultar' : `ver ${g.count}`}</button>}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#e53e3e', whiteSpace: 'nowrap' }}>−{fmt(g.total)}</div>
        </div>

        {sugLote[g.movs[0].id] && !sel && (() => {
          const s = sugLote[g.movs[0].id]
          return (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--primary-light)', fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>🤖 <strong>{DESTINOS.find(d => d.v === BUCKET_DESTINO[s.bucket])?.label}</strong>{s.amortizable ? ' · 📦 amortizable' : ''} — {s.motivo}</span>
              <button disabled={busy !== null} onClick={() => aceptarGrupo(g)} style={{ ...btn, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>✓ aceptar{g.count > 1 ? ` (${g.count})` : ''}</button>
            </div>
          )
        })()}

        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {sel ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{g.count > 1 ? `Mover los ${g.count} a:` : 'Mover a:'}</span>
              {DESTINOS.map(d => (
                <button key={d.v} disabled={busy === key} onClick={() => reclasificarGrupo(g, d.v)} style={btn}>{d.label}</button>
              ))}
              <button onClick={() => setReclasifGrupo(null)} style={{ ...btn, border: 'none', background: 'none', color: 'var(--muted)' }}>cancelar</button>
            </>
          ) : (
            <>
              <button disabled={busy === key} onClick={() => confirmarGrupo(g)} style={{ ...btn, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', fontWeight: 600 }}>✓ Está bien{g.count > 1 ? ` (${g.count})` : ''}</button>
              <button disabled={busy === key} onClick={() => setReclasifGrupo(key)} style={btn}>↪ Reclasificar{g.count > 1 ? ` los ${g.count}` : ''}</button>
              {g.comercio && g.count > 1 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>aprende la regla «{g.comercio}»</span>}
            </>
          )}
        </div>

        {abierto && <div style={{ marginTop: 8 }}>{g.movs.map(m => <Fila key={m.id} m={m} enBandeja={false} />)}</div>}
      </div>
    )
  }

  return (
    <div>
      {/* Resumen de cabecera */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Deducible del año', value: fmt(data.resumen.deducibleTotal), color: 'var(--primary)' },
          { label: 'A amortizar', value: fmt(data.resumen.amortizablesTotal), color: '#805ad5' },
          { label: 'No deducible', value: fmt(data.resumen.noDeducibleTotal), color: 'var(--muted)' },
          { label: 'Deducibles SIN justificante', value: String(data.resumen.sinJustificante), color: data.resumen.sinJustificante ? '#ea580c' : 'var(--primary)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Bandeja por revisar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 4px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>⚠️ Por revisar <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({data.porRevisar.length} en {data.porRevisarGrupos.length} grupos)</span></h2>
          {data.porRevisarGrupos.length > 0 && (
            Object.keys(sugLote).length > 0
              ? <button disabled={busy !== null} onClick={aceptarTodas} style={{ ...btn, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>✓ Aceptar todas las sugerencias</button>
              : <button disabled={sugLoteEstado === 'loading'} onClick={sugerirTodo} style={btn}>{sugLoteEstado === 'loading' ? '🤖 pensando…' : '🤖 Sugerir todo'}</button>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>Agrupado por comercio: una decisión clasifica todos los iguales y aprende la regla (pasados y futuros). «🤖 Sugerir todo» propone el destino de cada grupo de una pasada.</p>
        {sugLoteEstado === 'error' && <div style={{ fontSize: 12, color: '#ea580c', marginBottom: 8 }}>La IA no pudo sugerir ahora mismo.</div>}
        {data.porRevisarGrupos.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>✓ Nada pendiente de revisar en este periodo.</div>
          : data.porRevisarGrupos.map(g => <Grupo key={g.comercio ?? g.movs[0].id} g={g} />)}
      </div>

      {/* Buckets */}
      {data.buckets.filter(b => b.movs.length).map(b => (
        <details key={b.bucket} style={{ marginBottom: 12 }} open={b.bucket === 'negocio' || b.bucket === 'renta'}>
          <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '8px 0' }}>
            {b.label} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {fmt(b.total)} · {b.movs.length} mov.</span>
            {!b.deducible && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> · no deducible</span>}
          </summary>
          <div style={{ marginTop: 8 }}>{b.movs.map(m => <Fila key={m.id} m={m} enBandeja={false} />)}</div>
        </details>
      ))}
    </div>
  )
}
