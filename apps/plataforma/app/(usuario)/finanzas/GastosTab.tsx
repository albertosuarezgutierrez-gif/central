'use client'
import { useState, useEffect, useCallback } from 'react'
import { eur } from '@/lib/dinero'

// Espejo de los tipos de lib/finanzas.ts (sin importar el módulo de servidor en el cliente).
type Bucket = 'negocio' | 'renta' | 'no_deducible' | 'traspaso'
type DeduccionCuotaTipo = 'mecenazgo' | 'guarderia' | 'deportiva_and'
type Desglose = { propiedad: string; porcentaje: number; importe: number }
type CuotaDeduccionResumen = { mecenazgo: number; guarderia: number; deportivaAnd: number }
type GastoMov = {
  id: string; fecha: string | null; concepto: string; banco: string; importe: number
  destino: string; destinoLabel: string; bucket: Bucket; deducible: boolean
  confirmado: boolean; porRevisar: boolean; conciliado: boolean; facturaRef: string | null
  amortizable: boolean; busqueda: string; comercio: string | null; desglose: Desglose[]
  comentario: string | null; deduccionCuotaTipo: DeduccionCuotaTipo | null
}
type GastoGrupo = {
  comercio: string | null; label: string; count: number; total: number; sinJustificante: number; movs: GastoMov[]
}
type Piso = { id: string; nombre: string }
type GastosControl = {
  porRevisar: GastoMov[]
  porRevisarGrupos: GastoGrupo[]
  buckets: { bucket: Bucket; label: string; deducible: boolean; total: number; movs: GastoMov[] }[]
  resumen: { deducibleTotal: number; amortizablesTotal: number; noDeducibleTotal: number; sinJustificante: number }
  cuotaDeduccionResumen: CuotaDeduccionResumen
  pisos: Piso[]
  year: number; quarter: number
}
type Sugerencia = { bucket: Bucket; amortizable: boolean; motivo: string; deduccionCuotaTipo?: DeduccionCuotaTipo | null }

function fmt(n: number) {
  return eur(n)
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

const DEDUCCION_CUOTA_LABEL: Record<DeduccionCuotaTipo, string> = {
  mecenazgo:     '🏛️ Mecenazgo',
  guarderia:     '👶 Guardería',
  deportiva_and: '⚽ Deportiva And.',
}
const DEDUCCION_CUOTA_LIMITE: Record<DeduccionCuotaTipo, number> = {
  mecenazgo: 150, guarderia: 1000, deportiva_and: 100,
}

const btn: React.CSSProperties = {
  padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer',
}

// Filas que se montan de inicio en cada sección; el resto sale con «ver más». Renderizar de golpe
// todos los movimientos del año (cada Fila son decenas de nodos) es lo que hacía lenta la página.
const PAGE = 50

export default function GastosTab({ year, quarter, desde, hasta }: { year: number; quarter: number; desde?: string; hasta?: string }) {
  const [data, setData] = useState<GastosControl | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [reclasif, setReclasif] = useState<string | null>(null)
  const [reclasifGrupo, setReclasifGrupo] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  // Buckets desplegados (cerrados por defecto): el contenido NO se monta hasta abrir.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  // Nº de filas visibles por bucket y nº de grupos visibles en la bandeja (paginación client-side).
  const [visibles, setVisibles] = useState<Record<string, number>>({})
  const [gruposVisibles, setGruposVisibles] = useState(PAGE)
  const [sugerencias, setSugerencias] = useState<Record<string, Sugerencia | 'loading' | 'error'>>({})
  const [sugLote, setSugLote] = useState<Record<string, Sugerencia>>({})   // keyed por id del representante del grupo
  const [sugLoteEstado, setSugLoteEstado] = useState<'idle' | 'loading' | 'error'>('idle')
  // Editor de desglose por piso: id del movimiento que se está repartiendo + borrador de %.
  const [desglosando, setDesglosando] = useState<string | null>(null)
  const [desgError, setDesgError] = useState('')
  // Id del movimiento cuyo comentario se está editando (null = ninguno).
  const [comentando, setComentando] = useState<string | null>(null)
  // Id del movimiento cuyo selector de deducción de cuota está abierto.
  const [cuotaTipoSelector, setCuotaTipoSelector] = useState<string | null>(null)
  // Filtros y buscador (client-side sobre datos ya cargados).
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroDestino, setFiltroDestino] = useState('')
  const [filtroBucket, setFiltroBucket] = useState('')
  const [filtroBanco, setFiltroBanco] = useState('')
  const [soloSinJustif, setSoloSinJustif] = useState(false)
  const [soloAmort, setSoloAmort] = useState(false)

  const cargar = useCallback(() => {
    setLoading(true); setError('')
    const qs = new URLSearchParams({ year: String(year), quarter: String(quarter) })
    if (desde) qs.set('desde', desde)
    if (hasta) qs.set('hasta', hasta)
    fetch(`/api/finanzas/gastos?${qs}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar los gastos'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [year, quarter, desde, hasta])

  useEffect(() => { cargar(); setVisibles({}); setGruposVisibles(PAGE) }, [cargar])

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
  // Guarda el reparto por piso de un cargo. repartos vacío = quitar desglose.
  async function guardarDesglose(id: string, repartos: { propiedad: string; porcentaje: number }[]) {
    setBusy(id); setDesgError('')
    const res = await fetch('/api/finanzas/gastos/desglose', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movimientoId: id, repartos }),
    })
    setBusy(null)
    if (!res.ok) { const e = await res.json().catch(() => ({})); setDesgError(e.error || 'No se pudo guardar el desglose'); return }
    setDesglosando(null); cargar()
  }
  async function setDeduccionCuota(id: string, tipo: DeduccionCuotaTipo | null) {
    setBusy(id)
    await fetch('/api/banca/deduccion-cuota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, tipo }) })
    setCuotaTipoSelector(null); setBusy(null); cargar()
  }
  async function aplicarSugerencia(id: string, sug: Sugerencia) {
    setBusy(id)
    await fetch('/api/banca/destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, destino: BUCKET_DESTINO[sug.bucket] }) })
    if (sug.amortizable) {
      await fetch('/api/banca/amortizable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, amortizable: true }) })
    }
    if (sug.deduccionCuotaTipo) {
      await fetch('/api/banca/deduccion-cuota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, tipo: sug.deduccionCuotaTipo }) })
    }
    setBusy(null); cargar()
  }
  // Guarda/edita la nota libre de un movimiento (vacío = borra). No afecta a clasificación ni P&L.
  async function guardarComentario(id: string, comentario: string) {
    setBusy(id)
    await fetch('/api/banca/comentario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, comentario }) })
    setBusy(null); setComentando(null); cargar()
  }

  // Solo la primera carga tapa la página; las recargas tras una acción mantienen la lista visible
  // (atenuada) en vez de desmontarla y volver a montarla entera.
  if (loading && !data) return <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>Cargando gastos…</div>
  if (error) return <div style={{ background: 'var(--negative-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: 'var(--negative)' }}>{error}</div>
  if (!data) return null

  const pisoNombre = (id: string) => data.pisos.find(p => p.id === id)?.nombre ?? id

  // Bancos únicos presentes en los datos para el selector.
  const bancos = Array.from(new Set([
    ...data.porRevisar.map(m => m.banco),
    ...data.buckets.flatMap(b => b.movs.map(m => m.banco)),
  ].filter(Boolean))).sort()

  const hayFiltros = filtroTexto || filtroDestino || filtroBucket || filtroBanco || soloSinJustif || soloAmort

  function filtrarMov(m: GastoMov): boolean {
    if (filtroTexto) {
      const q = filtroTexto.toLowerCase()
      const coincide = m.concepto.toLowerCase().includes(q)
        || (m.comercio?.toLowerCase().includes(q) ?? false)
        || (m.comentario?.toLowerCase().includes(q) ?? false)
      if (!coincide) return false
    }
    if (filtroDestino && m.destino !== filtroDestino) return false
    if (filtroBucket && m.bucket !== filtroBucket) return false
    if (filtroBanco && m.banco !== filtroBanco) return false
    if (soloSinJustif && !(m.deducible && !m.conciliado && !m.facturaRef)) return false
    if (soloAmort && !m.amortizable) return false
    return true
  }

  function limpiarFiltros() {
    setFiltroTexto(''); setFiltroDestino(''); setFiltroBucket('')
    setFiltroBanco(''); setSoloSinJustif(false); setSoloAmort(false)
  }

  // Render del comentario de un movimiento: editor en línea si se está editando, o el chip con la
  // nota + «editar» si ya hay una. El botón «💬 comentar» (cuando no hay nota) vive en las acciones.
  function comentarioUI(m: GastoMov) {
    if (comentando === m.id) {
      return <ComentarioEditor inicial={m.comentario ?? ''} busy={busy === m.id}
        onSave={t => guardarComentario(m.id, t)} onCancel={() => setComentando(null)} />
    }
    if (m.comentario) {
      return (
        <div style={{ marginTop: 6, fontSize: 11, display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span style={{ background: 'var(--primary-light)', color: 'var(--text)', padding: '2px 8px', borderRadius: 8 }}>💬 {m.comentario}</span>
          <button onClick={() => setComentando(m.id)} style={{ ...btn, padding: '1px 6px', fontSize: 11 }}>editar</button>
        </div>
      )
    }
    return null
  }

  function Fila({ m, enBandeja }: { m: GastoMov; enBandeja: boolean }) {
    const sug = sugerencias[m.id]
    const sinJustif = m.deducible && !m.conciliado && !m.facturaRef
    return (
      <div style={{ border: `1px solid ${enBandeja ? '#fdba74' : 'var(--border)'}`, background: enBandeja ? 'var(--warning-bg)' : 'transparent', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{m.concepto}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{m.fecha ?? '—'} · {m.banco}</span>
              <span style={{ padding: '1px 7px', borderRadius: 10, background: 'var(--primary-light)', color: 'var(--text)' }}>{m.destinoLabel}</span>
              {m.amortizable && <span style={{ padding: '1px 7px', borderRadius: 10, background: '#e9d8fd', color: '#553c9a' }}>📦 amortizable</span>}
              {m.deduccionCuotaTipo && <span style={{ padding: '1px 7px', borderRadius: 10, background: 'var(--positive-bg)', color: 'var(--positive)' }}>{DEDUCCION_CUOTA_LABEL[m.deduccionCuotaTipo]}</span>}
              {m.deducible && (m.conciliado || m.facturaRef
                ? <span style={{ color: 'var(--positive)' }}>📎 con factura</span>
                : <span style={{ color: 'var(--warning)' }}>❗ sin justificante</span>)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {m.bucket !== 'traspaso' && (
              <span title={m.deducible ? 'Deducible IRPF' : 'No deducible'} style={{ fontSize: 14, lineHeight: 1 }}>{m.deducible ? '✅' : '❌'}</span>
            )}
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--negative)', whiteSpace: 'nowrap' }}>−{fmt(m.importe)}</div>
          </div>
        </div>

        {/* Desglose por piso (si está repartido) */}
        {m.desglose.length > 0 && desglosando !== m.id && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>🪧 repartido:</span>
            {m.desglose.map(d => (
              <span key={d.propiedad} style={{ padding: '1px 7px', borderRadius: 10, background: 'var(--primary-light)', color: 'var(--text)' }}>
                {pisoNombre(d.propiedad)} {d.porcentaje}% · {fmt(d.importe)}
              </span>
            ))}
          </div>
        )}

        {/* Editor de reparto por piso */}
        {desglosando === m.id && (
          <DesgloseEditor mov={m} pisos={data!.pisos} busy={busy === m.id} error={desgError}
            onSave={(reps) => guardarDesglose(m.id, reps)} onCancel={() => { setDesglosando(null); setDesgError('') }} />
        )}

        {/* Sugerencia IA */}
        {sug && sug !== 'loading' && sug !== 'error' && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--primary-light)', fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>🤖 sugiere: <strong>{DESTINOS.find(d => d.v === BUCKET_DESTINO[sug.bucket])?.label}</strong>{sug.amortizable ? ' · 📦 amortizable' : ''}{sug.deduccionCuotaTipo ? ` · ${DEDUCCION_CUOTA_LABEL[sug.deduccionCuotaTipo]}` : ''} — {sug.motivo}</span>
            <button disabled={busy === m.id} onClick={() => aplicarSugerencia(m.id, sug)} style={{ ...btn, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>Confirmar</button>
          </div>
        )}
        {sug === 'error' && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--warning)' }}>La IA no pudo sugerir ahora mismo.</div>}

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
                <button disabled={busy === m.id} onClick={() => confirmar(m.id)} style={{ ...btn, border: '1px solid var(--positive)', background: 'var(--positive)', color: '#fff', fontWeight: 600 }}>✓ Está bien</button>
              )}
              <button disabled={busy === m.id} onClick={() => setReclasif(m.id)} style={btn}>↪ Reclasificar</button>
              <button disabled={busy === m.id} onClick={() => toggleAmort(m.id, !m.amortizable)} style={{ ...btn, ...(m.amortizable ? { borderColor: '#9f7aea', color: '#553c9a' } : {}) }}>
                {m.amortizable ? '📦 quitar amortizable' : '📦 amortizable'}
              </button>
              {m.bucket === 'renta' && desglosando !== m.id && (
                <button disabled={busy === m.id} onClick={() => { setDesglosando(m.id); setDesgError('') }}
                  style={{ ...btn, ...(m.desglose.length ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}) }}>
                  🪧 {m.desglose.length ? 'editar desglose' : 'desglosar por piso'}
                </button>
              )}
              {sug !== 'loading' && !sug && <button disabled={busy === m.id} onClick={() => sugerir(m.id)} style={btn}>🤖 sugerir</button>}
              {sug === 'loading' && <span style={{ fontSize: 11, color: 'var(--muted)' }}>🤖 pensando…</span>}
              {m.deducible && !m.conciliado && !m.facturaRef && (
                <a href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(m.busqueda)}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>🔎 buscar factura</a>
              )}
              {m.destino === 'personal' && cuotaTipoSelector === m.id ? (
                <>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Deducción cuota:</span>
                  {(['mecenazgo', 'guarderia', 'deportiva_and'] as DeduccionCuotaTipo[]).map(t => (
                    <button key={t} disabled={busy === m.id} onClick={() => setDeduccionCuota(m.id, t)}
                      style={{ ...btn, ...(m.deduccionCuotaTipo === t ? { borderColor: 'var(--positive)', color: 'var(--positive)', fontWeight: 600 } : {}) }}>
                      {DEDUCCION_CUOTA_LABEL[t]}
                    </button>
                  ))}
                  {m.deduccionCuotaTipo && <button disabled={busy === m.id} onClick={() => setDeduccionCuota(m.id, null)} style={{ ...btn, color: 'var(--negative)' }}>quitar</button>}
                  <button onClick={() => setCuotaTipoSelector(null)} style={{ ...btn, border: 'none', background: 'none', color: 'var(--muted)' }}>cancelar</button>
                </>
              ) : m.destino === 'personal' ? (
                <button disabled={busy === m.id} onClick={() => setCuotaTipoSelector(m.id)}
                  style={{ ...btn, ...(m.deduccionCuotaTipo ? { borderColor: 'var(--positive)', color: 'var(--positive)' } : {}) }}>
                  {m.deduccionCuotaTipo ? `${DEDUCCION_CUOTA_LABEL[m.deduccionCuotaTipo]} ✎` : '🏛️ deducción cuota'}
                </button>
              ) : null}
              {comentando !== m.id && !m.comentario && (
                <button disabled={busy === m.id} onClick={() => setComentando(m.id)} style={btn}>💬 comentar</button>
              )}
            </>
          )}
        </div>

        {/* Comentario libre del usuario */}
        {comentarioUI(m)}
      </div>
    )
  }

  function Grupo({ g }: { g: GastoGrupo }) {
    const key = g.comercio ?? g.movs[0].id
    const abierto = expandido === key
    const sel = reclasifGrupo === key
    return (
      <div style={{ border: '1px solid #fdba74', background: 'var(--warning-bg)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
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
              {g.sinJustificante > 0 && <span style={{ color: 'var(--warning)' }}>❗ {g.sinJustificante} sin justificante</span>}
              {g.count > 1 && <button onClick={() => setExpandido(abierto ? null : key)} style={{ ...btn, padding: '1px 8px', fontSize: 11 }}>{abierto ? 'ocultar' : `ver ${g.count}`}</button>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {g.movs[0].bucket !== 'traspaso' && (
              <span title={g.movs[0].deducible ? 'Deducible IRPF' : 'No deducible'} style={{ fontSize: 14, lineHeight: 1 }}>{g.movs[0].deducible ? '✅' : '❌'}</span>
            )}
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--negative)', whiteSpace: 'nowrap' }}>−{fmt(g.total)}</div>
          </div>
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
              <button disabled={busy === key} onClick={() => confirmarGrupo(g)} style={{ ...btn, border: '1px solid var(--positive)', background: 'var(--positive)', color: '#fff', fontWeight: 600 }}>✓ Está bien{g.count > 1 ? ` (${g.count})` : ''}</button>
              <button disabled={busy === key} onClick={() => setReclasifGrupo(key)} style={btn}>↪ Reclasificar{g.count > 1 ? ` los ${g.count}` : ''}</button>
              {g.count === 1 && comentando !== g.movs[0].id && !g.movs[0].comentario && (
                <button disabled={busy === key} onClick={() => setComentando(g.movs[0].id)} style={btn}>💬 comentar</button>
              )}
              {g.comercio && g.count > 1 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>aprende la regla «{g.comercio}»</span>}
            </>
          )}
        </div>

        {/* Comentario del cargo suelto (grupos de 1) */}
        {g.count === 1 && comentarioUI(g.movs[0])}

        {abierto && <div style={{ marginTop: 8 }}>{g.movs.map(m => <Fila key={m.id} m={m} enBandeja={false} />)}</div>}
      </div>
    )
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      {/* Resumen de cabecera */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Deducible del año', value: fmt(data.resumen.deducibleTotal), color: 'var(--primary)' },
          { label: 'A amortizar', value: fmt(data.resumen.amortizablesTotal), color: '#805ad5' },
          { label: 'No deducible', value: fmt(data.resumen.noDeducibleTotal), color: 'var(--muted)' },
          { label: 'Deducibles SIN justificante', value: String(data.resumen.sinJustificante), color: data.resumen.sinJustificante ? 'var(--warning)' : 'var(--primary)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tracker deducciones de cuota IRPF */}
      {(data.cuotaDeduccionResumen.mecenazgo > 0 || data.cuotaDeduccionResumen.guarderia > 0 || data.cuotaDeduccionResumen.deportivaAnd > 0) && (
        <div style={{ marginBottom: 16, background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive)', marginBottom: 8 }}>🏛️ Deducciones de cuota IRPF (personal pero con ahorro fiscal directo)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {[
              { tipo: 'mecenazgo' as DeduccionCuotaTipo, total: data.cuotaDeduccionResumen.mecenazgo,
                cuota: Math.round(Math.min(data.cuotaDeduccionResumen.mecenazgo, 150) * 0.8 + Math.max(0, data.cuotaDeduccionResumen.mecenazgo - 150) * 0.4) },
              { tipo: 'guarderia' as DeduccionCuotaTipo, total: data.cuotaDeduccionResumen.guarderia,
                cuota: Math.min(data.cuotaDeduccionResumen.guarderia, 1000) },
              { tipo: 'deportiva_and' as DeduccionCuotaTipo, total: data.cuotaDeduccionResumen.deportivaAnd,
                cuota: Math.round(Math.min(data.cuotaDeduccionResumen.deportivaAnd, 100) * 0.15) },
            ].filter(k => k.total > 0).map(k => (
              <div key={k.tipo} style={{ background: 'white', borderRadius: 8, padding: '8px 10px', border: '1px solid #9ae6b4' }}>
                <div style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 600 }}>{DEDUCCION_CUOTA_LABEL[k.tipo]}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--positive)' }}>−{eur(k.cuota)} en cuota</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  gastado {fmt(k.total)} · límite base {eur(DEDUCCION_CUOTA_LIMITE[k.tipo])}
                  {k.total > DEDUCCION_CUOTA_LIMITE[k.tipo] && <span style={{ color: 'var(--warning)' }}> · excede límite</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de búsqueda y filtros */}
      <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder="Buscar concepto, comercio…"
              value={filtroTexto}
              onChange={e => setFiltroTexto(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 30, paddingRight: 8, paddingTop: 6, paddingBottom: 6, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
          <select value={filtroDestino} onChange={e => setFiltroDestino(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
            <option value="">Todos los destinos</option>
            {DESTINOS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
          <select value={filtroBucket} onChange={e => setFiltroBucket(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
            <option value="">Todos los buckets</option>
            <option value="negocio">💼 Negocio</option>
            <option value="renta">🏖️ Renta (pisos)</option>
            <option value="no_deducible">👤 No deducible</option>
            <option value="traspaso">🔁 Traspaso</option>
          </select>
          {bancos.length > 1 && (
            <select value={filtroBanco} onChange={e => setFiltroBanco(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
              <option value="">Todos los bancos</option>
              {bancos.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={soloSinJustif} onChange={e => setSoloSinJustif(e.target.checked)} />
            ❗ Sin justificante
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={soloAmort} onChange={e => setSoloAmort(e.target.checked)} />
            📦 Amortizables
          </label>
          {hayFiltros && (
            <button onClick={limpiarFiltros} style={{ ...btn, border: 'none', background: 'none', color: 'var(--muted)', whiteSpace: 'nowrap' }}>✕ limpiar</button>
          )}
        </div>
      </div>

      {/* Bandeja por revisar */}
      {(() => {
        const gruposFiltrados = hayFiltros
          ? data.porRevisarGrupos.map(g => ({ ...g, movs: g.movs.filter(filtrarMov) })).filter(g => g.movs.length > 0)
          : data.porRevisarGrupos
        const totalFiltrados = gruposFiltrados.reduce((s, g) => s + g.movs.length, 0)
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 4px' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                ⚠️ Por revisar{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                  ({hayFiltros ? `${totalFiltrados} de ${data.porRevisar.length}` : data.porRevisar.length} en {gruposFiltrados.length} grupos)
                </span>
              </h2>
              {data.porRevisarGrupos.length > 0 && !hayFiltros && (
                Object.keys(sugLote).length > 0
                  ? <button disabled={busy !== null} onClick={aceptarTodas} style={{ ...btn, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>✓ Aceptar todas las sugerencias</button>
                  : <button disabled={sugLoteEstado === 'loading'} onClick={sugerirTodo} style={btn}>{sugLoteEstado === 'loading' ? '🤖 pensando…' : '🤖 Sugerir todo'}</button>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>Agrupado por comercio: una decisión clasifica todos los iguales y aprende la regla (pasados y futuros). «🤖 Sugerir todo» propone el destino de cada grupo de una pasada.</p>
            {sugLoteEstado === 'error' && <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>La IA no pudo sugerir ahora mismo.</div>}
            {gruposFiltrados.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  {data.porRevisarGrupos.length === 0 ? '✓ Nada pendiente de revisar en este periodo.' : '🔍 No hay resultados con estos filtros.'}
                </div>
              : <>
                  {gruposFiltrados.slice(0, gruposVisibles).map(g => <Grupo key={g.comercio ?? g.movs[0].id} g={g} />)}
                  {gruposFiltrados.length > gruposVisibles && (
                    <button onClick={() => setGruposVisibles(n => n + 100)} style={{ ...btn, width: '100%', padding: '10px 12px' }}>
                      Ver más ({gruposFiltrados.length - gruposVisibles} grupos restantes)
                    </button>
                  )}
                </>}
          </div>
        )
      })()}

      {/* Buckets — cerrados por defecto y con montaje perezoso: las filas solo se crean al abrir,
          y de 50 en 50 («ver más»). Con filtros activos se abren solos para ver los resultados. */}
      {data.buckets.filter(b => b.movs.length).map(b => {
        const movsF = hayFiltros ? b.movs.filter(filtrarMov) : b.movs
        if (movsF.length === 0) return null
        const totalF = movsF.reduce((s, m) => s + m.importe, 0)
        const abierto = abiertos[b.bucket] ?? !!hayFiltros
        const nVisibles = visibles[b.bucket] ?? PAGE
        return (
          <div key={b.bucket} style={{ marginBottom: 12 }}>
            <button
              onClick={() => setAbiertos(a => ({ ...a, [b.bucket]: !abierto }))}
              style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '12px 0', border: 'none', background: 'none', color: 'var(--text)' }}
            >
              <span style={{ fontSize: 11, width: 12, flexShrink: 0 }}>{abierto ? '▼' : '▶'}</span>
              <span>
                {b.label}{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                  · {fmt(hayFiltros ? totalF : b.total)} · {movsF.length}{hayFiltros ? ` de ${b.movs.length}` : ''} mov.
                </span>
                {!b.deducible && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> · no deducible</span>}
              </span>
            </button>
            {abierto && (
              <div style={{ marginTop: 4 }}>
                {movsF.slice(0, nVisibles).map(m => <Fila key={m.id} m={m} enBandeja={false} />)}
                {movsF.length > nVisibles && (
                  <button onClick={() => setVisibles(v => ({ ...v, [b.bucket]: nVisibles + 100 }))} style={{ ...btn, width: '100%', padding: '10px 12px' }}>
                    Ver más ({movsF.length - nVisibles} movimientos restantes)
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Editor de reparto por piso (porcentaje). Estado local estable (componente top-level) para no
// perder el foco al teclear. Por defecto pre-rellena los pisos del desglose existente, o todos a
// partes iguales si aún no hay reparto.
function DesgloseEditor({ mov, pisos, busy, error, onSave, onCancel }: {
  mov: GastoMov
  pisos: Piso[]
  busy: boolean
  error: string
  onSave: (repartos: { propiedad: string; porcentaje: number }[]) => void
  onCancel: () => void
}) {
  // Estado: por cada piso, su % (string vacío = no incluido).
  const inicial: Record<string, string> = {}
  if (mov.desglose.length) {
    for (const d of mov.desglose) inicial[d.propiedad] = String(d.porcentaje)
  } else {
    const eq = Math.round((100 / pisos.length) * 10) / 10
    for (const p of pisos) inicial[p.id] = String(eq)
  }
  const [pct, setPct] = useState<Record<string, string>>(inicial)
  // Nota del reparto automático por actividad (limpiezas × camas) cuando se aplica.
  const [sugNota, setSugNota] = useState('')
  const [sugBusy, setSugBusy] = useState(false)

  const incluidos = pisos.filter(p => pct[p.id] !== undefined && pct[p.id] !== '')
  const suma = incluidos.reduce((s, p) => s + (parseFloat(pct[p.id]) || 0), 0)
  const sumaOk = Math.abs(suma - 100) <= 0.5

  function repartirIgual() {
    const sel = incluidos.length ? incluidos : pisos
    const eq = Math.round((100 / sel.length) * 10) / 10
    const next: Record<string, string> = {}
    sel.forEach(p => { next[p.id] = String(eq) })
    setPct(next); setSugNota('')
  }
  // Pide al servidor el reparto ponderado por actividad (nº limpiezas × camas) del mes del cargo y
  // pre-rellena los %. El usuario revisa y guarda por el flujo normal (no escribe nada por sí solo).
  async function repartirPorActividad() {
    setSugBusy(true); setSugNota('')
    try {
      const res = await fetch(`/api/finanzas/gastos/reparto-sugerido?movimientoId=${mov.id}`)
      if (!res.ok) { setSugNota('No se pudo calcular el reparto automático'); return }
      const j = await res.json() as { periodo: string; base: string; repartos: { propiedad: string; porcentaje: number; limpiezas: number; huespedes: number }[] }
      const next: Record<string, string> = {}
      for (const r of j.repartos) next[r.propiedad] = String(r.porcentaje)
      setPct(next)
      const etiqueta = j.base === 'actividad' ? `actividad de ${j.periodo} (limpiezas × huéspedes)`
        : j.base === 'capacidad' ? `capacidad (huéspedes) — sin limpiezas en ${j.periodo}`
        : `partes iguales — sin datos de ${j.periodo}`
      const detalle = j.repartos.map(r => `${pisos.find(p => p.id === r.propiedad)?.nombre ?? r.propiedad} ${r.limpiezas} limp · ${r.huespedes} huésp`).join(' · ')
      setSugNota(`Repartido por ${etiqueta}: ${detalle}`)
    } catch { setSugNota('No se pudo calcular el reparto automático') }
    finally { setSugBusy(false) }
  }
  function toggle(id: string) {
    setPct(prev => {
      const next = { ...prev }
      if (next[id] !== undefined && next[id] !== '') delete next[id]
      else next[id] = '0'
      return next
    })
  }

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>🪧 Repartir {fmt(mov.importe)} entre pisos (por %)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pisos.map(p => {
          const on = pct[p.id] !== undefined && pct[p.id] !== ''
          const parte = on ? Math.round(mov.importe * (parseFloat(pct[p.id]) || 0)) / 100 : 0
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                <span style={{ color: 'var(--text)' }}>{p.nombre}</span>
              </label>
              <input
                type="number" min="0" max="100" step="0.1" disabled={!on} value={on ? pct[p.id] : ''}
                onChange={e => setPct(prev => ({ ...prev, [p.id]: e.target.value }))}
                style={{ width: 64, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }}
              />
              <span style={{ color: 'var(--muted)', width: 14 }}>%</span>
              <span style={{ color: 'var(--muted)', width: 70, textAlign: 'right' }}>{on ? fmt(parte) : '—'}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: sumaOk ? 'var(--positive)' : 'var(--warning)', fontWeight: 600 }}>Suma: {suma.toFixed(1)}%</span>
        <button disabled={sugBusy} onClick={repartirPorActividad} style={{ ...btn, border: '1px solid var(--primary)', color: 'var(--primary)' }} title="Reparte según nº de limpiezas × camas de cada piso en el mes del cargo (margen más realista)">{sugBusy ? 'calculando…' : '⚡ por actividad'}</button>
        <button onClick={repartirIgual} style={btn}>partes iguales</button>
        <button disabled={busy || !sumaOk || incluidos.length === 0}
          onClick={() => onSave(incluidos.map(p => ({ propiedad: p.id, porcentaje: parseFloat(pct[p.id]) || 0 })))}
          style={{ ...btn, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>Guardar reparto</button>
        {mov.desglose.length > 0 && (
          <button disabled={busy} onClick={() => onSave([])} style={{ ...btn, color: 'var(--negative)' }}>quitar desglose</button>
        )}
        <button onClick={onCancel} style={{ ...btn, border: 'none', background: 'none', color: 'var(--muted)' }}>cancelar</button>
      </div>
      {sugNota && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>{sugNota}. Revisa y guarda.</div>}
      {error && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--negative)' }}>{error}</div>}
    </div>
  )
}

// Editor del comentario libre de un gasto. Componente top-level con estado local (como
// DesgloseEditor) para no perder el foco del textarea al teclear.
function ComentarioEditor({ inicial, busy, onSave, onCancel }: {
  inicial: string
  busy: boolean
  onSave: (texto: string) => void
  onCancel: () => void
}) {
  const [t, setT] = useState(inicial)
  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={t} onChange={e => setT(e.target.value)} rows={2} maxLength={500} autoFocus
        placeholder="Nota para este gasto (qué es, a qué corresponde…)"
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button disabled={busy} onClick={() => onSave(t.trim())} style={{ ...btn, border: '1px solid var(--primary)', background: 'var(--primary)', color: '#fff', fontWeight: 600 }}>Guardar nota</button>
        <button onClick={onCancel} style={{ ...btn, border: 'none', background: 'none', color: 'var(--muted)' }}>cancelar</button>
      </div>
    </div>
  )
}
