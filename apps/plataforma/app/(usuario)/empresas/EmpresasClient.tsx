'use client'
import { useEffect, useState } from 'react'
import AgenteEmpresas from './AgenteEmpresas'
import EmpresaCard, { type Empresa } from './EmpresaCard'

const PAGE = 50
const CUADRANTE: Record<string, { label: string; color: string }> = {
  caza: { label: '🎯 Zona caza', color: 'var(--primary)' },
  declive: { label: '⚠️ Declive', color: 'var(--warning, #b45309)' },
  sano: { label: '😴 Sano', color: 'var(--muted)' },
  ignorar: { label: '🚫 Ignorar', color: 'var(--muted)' },
}

interface PuntoRadar {
  clave: string; concursos: number; disoluciones: number; dificultad: number; cuadrante: string
}
interface Datos {
  empresas: Empresa[]; radar: PuntoRadar[]; total: number; provincias: string[]; cnaes: string[]
}

const control: React.CSSProperties = {
  minHeight: 44, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)',
}

export default function EmpresasClient({ inicial, invitado = false }: { inicial: Datos | null; invitado?: boolean }) {
  const [data, setData] = useState<Datos | null>(inicial)
  const [prov, setProv] = useState('')
  const [cnae, setCnae] = useState('')
  const [factMin, setFactMin] = useState('')
  const [factMax, setFactMax] = useState('')
  const [visibles, setVisibles] = useState(PAGE)
  const [cargando, setCargando] = useState(false)
  const [ingiriendo, setIngiriendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [presu, setPresu] = useState<{ gastoMes: number; tope: number; configurado: boolean } | null>(null)
  const [sectorQ, setSectorQ] = useState('')
  const [sectorRes, setSectorRes] = useState<string | null>(null)
  const [analizandoSector, setAnalizandoSector] = useState(false)

  async function analizarSector() {
    const s = sectorQ.trim()
    if (!s || analizandoSector) return
    setAnalizandoSector(true)
    setSectorRes(null)
    try {
      const r = await fetch('/api/empresas/sector-web', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sector: s }),
      })
      const j = await r.json()
      setSectorRes(j.ok ? j.text : (j.error || 'Sin resultados.'))
    } catch {
      setSectorRes('No se pudo buscar.')
    } finally {
      setAnalizandoSector(false)
    }
  }

  function recargar(over?: Partial<{ prov: string; cnae: string; factMin: string; factMax: string }>) {
    setCargando(true)
    const p = over?.prov ?? prov, c = over?.cnae ?? cnae, mn = over?.factMin ?? factMin, mx = over?.factMax ?? factMax
    const qs = new URLSearchParams()
    if (p) qs.set('provincia', p)
    if (c) qs.set('cnae', c)
    if (mn) qs.set('facturacionMin', String(Number(mn) * 1_000_000))
    if (mx) qs.set('facturacionMax', String(Number(mx) * 1_000_000))
    fetch(`/api/empresas?${qs.toString()}`)
      .then((r) => r.json())
      .then((d: Datos) => { setData(d); setVisibles(PAGE) })
      .catch(() => setAviso('No se pudieron cargar las empresas.'))
      .finally(() => setCargando(false))
  }

  function cargarPresu() {
    fetch('/api/empresas/enriquecer').then((r) => r.json()).then(setPresu).catch(() => {})
  }

  useEffect(() => {
    if (!inicial) recargar()
    cargarPresu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ingestaManual() {
    setIngiriendo(true)
    setAviso(null)
    try {
      const r = await fetch('/api/empresas/ingesta-manual', { method: 'POST' })
      const j = await r.json()
      setAviso(j.ok ? `Ingesta OK: ${j.eventos} eventos del ${j.fecha}.` : `Ingesta con error: ${j.error ?? 'desconocido'}`)
    } catch {
      setAviso('No se pudo lanzar la ingesta.')
    } finally {
      setIngiriendo(false)
      recargar()
    }
  }

  const empresas = data?.empresas ?? []
  const radar = data?.radar ?? []
  const provincias = data?.provincias ?? []
  const cnaes = data?.cnaes ?? []

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto', color: 'var(--text)' }}>
      <h1 style={{ fontSize: 22, margin: '4px 0' }}>Empresas en dificultad</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
        Feed BORME (gratis) + enriquecimiento por empresa (facturación, CNAE, balance) cuando esté contratado eInforma.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0', alignItems: 'center' }}>
        <select value={prov} onChange={(e) => { setProv(e.target.value); recargar({ prov: e.target.value }) }} style={control}>
          <option value="">Todas las provincias</option>
          {provincias.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={cnae} onChange={(e) => { setCnae(e.target.value); recargar({ cnae: e.target.value }) }} style={control} disabled={cnaes.length === 0} title={cnaes.length === 0 ? 'El sector (CNAE) llega con el enriquecimiento' : ''}>
          <option value="">{cnaes.length === 0 ? 'Sector (tras enriquecer)' : 'Todos los sectores'}</option>
          {cnaes.map((c) => <option key={c} value={c}>CNAE {c}</option>)}
        </select>
        <input value={factMin} onChange={(e) => setFactMin(e.target.value)} onBlur={() => recargar()} inputMode="decimal"
          placeholder="Fact. mín (M€)" style={{ ...control, width: 130 }} />
        <input value={factMax} onChange={(e) => setFactMax(e.target.value)} onBlur={() => recargar()} inputMode="decimal"
          placeholder="Fact. máx (M€)" style={{ ...control, width: 130 }} />
        {!invitado && (
          <button onClick={ingestaManual} disabled={ingiriendo}
            style={{ ...control, background: 'var(--primary)', color: '#fff', cursor: ingiriendo ? 'default' : 'pointer' }}>
            {ingiriendo ? 'Actualizando…' : 'Actualizar BORME (hoy)'}
          </button>
        )}
      </div>

      {presu && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          {presu.configurado
            ? `Enriquecimiento: ${presu.gastoMes.toFixed(2)}€ gastados este mes${presu.tope > 0 ? ` de ${presu.tope}€ de tope` : ''}.`
            : '⏳ Enriquecimiento pendiente: falta contratar la API de eInforma (facturación, CNAE y señales de balance).'}
        </div>
      )}
      {aviso && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{aviso}</div>}

      <AgenteEmpresas provincia={prov} />

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, background: 'var(--surface)', marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>🌐 Analizar un sector en la web (gratis)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={sectorQ} onChange={(e) => setSectorQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') analizarSector() }}
            placeholder="Ej.: calzado Alicante, hostelería Sevilla…" style={{ ...control, flex: 1, minWidth: 180 }} />
          <button onClick={analizarSector} disabled={analizandoSector}
            style={{ ...control, background: 'var(--primary)', color: '#fff', cursor: analizandoSector ? 'default' : 'pointer' }}>
            {analizandoSector ? 'Analizando…' : 'Analizar'}
          </button>
        </div>
        {sectorRes && (
          <div style={{ marginTop: 10, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Fuentes públicas — verifica:</div>
            {sectorRes}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 16 }}>Radar por provincia</h2>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 10 }}>Provincia</th>
              <th style={{ padding: 10 }}>Concursos</th>
              <th style={{ padding: 10 }}>Disoluciones</th>
              <th style={{ padding: 10 }}>Dificultad</th>
              <th style={{ padding: 10 }}>Cuadrante</th>
            </tr>
          </thead>
          <tbody>
            {radar.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 12, color: 'var(--muted)' }}>Sin datos todavía. Pulsa «Actualizar BORME».</td></tr>
            )}
            {radar.map((r) => (
              <tr key={r.clave} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 10 }}>{r.clave}</td>
                <td style={{ padding: 10 }}>{r.concursos}</td>
                <td style={{ padding: 10 }}>{r.disoluciones}</td>
                <td style={{ padding: 10 }}>{r.dificultad}</td>
                <td style={{ padding: 10, color: CUADRANTE[r.cuadrante]?.color }}>{CUADRANTE[r.cuadrante]?.label ?? r.cuadrante}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>
        Empresas ({empresas.length}){cargando ? ' · cargando…' : ''}
      </h2>
      <div style={{ opacity: cargando ? 0.5 : 1, display: 'grid', gap: 8 }}>
        {empresas.length === 0 && !cargando && (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Sin empresas con estos filtros. Pulsa «Actualizar BORME» para ingerir el día.</div>
        )}
        {empresas.slice(0, visibles).map((e) => (
          <EmpresaCard key={e.empresaNorm} e={e} invitado={invitado} onCambio={() => { recargar(); cargarPresu() }} />
        ))}
      </div>
      {empresas.length > visibles && (
        <button onClick={() => setVisibles((v) => v + 100)}
          style={{ marginTop: 12, ...control, cursor: 'pointer' }}>
          Ver más ({empresas.length - visibles} restantes)
        </button>
      )}
    </div>
  )
}
