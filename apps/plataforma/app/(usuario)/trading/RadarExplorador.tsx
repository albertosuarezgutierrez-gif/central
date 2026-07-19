'use client'
import { useMemo, useState } from 'react'

// 🔎 Explorador del universo del radar (idea de Alberto): buscador + filtros + ordenación sobre las
// ~550 empresas de la caché, para manejarlas él como quiera (calidad, ROIC, momentum, señales…) en vez
// de ver solo el top-20 del modelo. Client-side puro sobre datos ya cargados por SSR (≤550 filas, KB);
// paginado a 50 + «Ver más» (regla de rendimiento). Los datos vienen de trading_universo; las señales
// 🏆/📈 solo existen para el top-20 del snapshot (el técnico no se calcula para todo el universo).

export type FilaExplorador = {
  simbolo: string; nombre: string | null
  piotroski: number | null; roic: number | null; ey: number | null; momentum: number | null
  mktCap: number | null; etiqueta: 'fuerte' | 'media' | 'debil'
  guru: boolean; tecnico: 'si' | 'esperar' | null   // solo top-20 del snapshot
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 14, whiteSpace: 'nowrap' }
const sel: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }

const ETIQ = { fuerte: '🟢 fuerte', media: '🟡 media', debil: '⚪ débil' } as const
type Orden = 'roic' | 'piotroski' | 'ey' | 'momentum' | 'mktCap' | 'simbolo'

function pctCell(n: number | null, dec = 0): string {
  return n == null ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`
}
function mktCapCell(n: number | null): string {
  if (n == null) return '—'
  return `${(n / 1e9).toLocaleString('es-ES', { maximumFractionDigits: n >= 1e11 ? 0 : 1 })} mM$`
}

export default function RadarExplorador({ filas }: { filas: FilaExplorador[] }) {
  const [q, setQ] = useState('')
  const [minPio, setMinPio] = useState(0)
  const [minRoic, setMinRoic] = useState(-1)
  const [minMom, setMinMom] = useState(-10)
  const [etiqueta, setEtiqueta] = useState<'todas' | 'fuerte' | 'media' | 'debil'>('todas')
  const [soloGuru, setSoloGuru] = useState(false)
  const [orden, setOrden] = useState<Orden>('mktCap')
  const [desc, setDesc] = useState(true)
  const [mostrar, setMostrar] = useState(50)

  const lista = useMemo(() => {
    const texto = q.trim().toLowerCase()
    const out = filas.filter(f =>
      (!texto || f.simbolo.toLowerCase().includes(texto) || (f.nombre ?? '').toLowerCase().includes(texto))
      && (minPio === 0 || (f.piotroski ?? -1) >= minPio)
      && (minRoic === -1 || (f.roic ?? -Infinity) >= minRoic)
      && (minMom === -10 || (f.momentum ?? -Infinity) >= minMom)
      && (etiqueta === 'todas' || f.etiqueta === etiqueta)
      && (!soloGuru || f.guru),
    )
    const dir = desc ? -1 : 1
    out.sort((a, b) => {
      if (orden === 'simbolo') return dir * a.simbolo.localeCompare(b.simbolo)
      const va = a[orden]; const vb = b[orden]
      if (va == null && vb == null) return 0
      if (va == null) return 1   // los sin dato siempre al final
      if (vb == null) return -1
      return dir * (va - vb)
    })
    return out
  }, [filas, q, minPio, minRoic, minMom, etiqueta, soloGuru, orden, desc])

  const cabecera = (campo: Orden, label: string) => (
    <th style={th} onClick={() => { if (orden === campo) setDesc(!desc); else { setOrden(campo); setDesc(campo !== 'simbolo') } }}>
      {label}{orden === campo ? (desc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>🔎 Explorador del universo <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>({filas.length} empresas de la caché — filtra y ordena como quieras)</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <input
          value={q} onChange={e => { setQ(e.target.value); setMostrar(50) }}
          placeholder="Buscar ticker o nombre…"
          style={{ ...sel, minWidth: 180, flex: '1 1 180px', maxWidth: 260 }}
        />
        <select style={sel} value={minPio} onChange={e => { setMinPio(Number(e.target.value)); setMostrar(50) }}>
          <option value={0}>Piotroski: todos</option>
          <option value={5}>Piotroski ≥ 5</option>
          <option value={6}>Piotroski ≥ 6</option>
          <option value={7}>Piotroski ≥ 7</option>
          <option value={8}>Piotroski ≥ 8</option>
        </select>
        <select style={sel} value={minRoic} onChange={e => { setMinRoic(Number(e.target.value)); setMostrar(50) }}>
          <option value={-1}>ROIC: todos</option>
          <option value={0}>ROIC ≥ 0%</option>
          <option value={0.10}>ROIC ≥ 10%</option>
          <option value={0.15}>ROIC ≥ 15%</option>
          <option value={0.20}>ROIC ≥ 20%</option>
        </select>
        <select style={sel} value={minMom} onChange={e => { setMinMom(Number(e.target.value)); setMostrar(50) }}>
          <option value={-10}>Momentum: todos</option>
          <option value={0}>Momentum &gt; 0</option>
          <option value={0.1}>Momentum ≥ +10%</option>
          <option value={0.3}>Momentum ≥ +30%</option>
        </select>
        <select style={sel} value={etiqueta} onChange={e => { setEtiqueta(e.target.value as typeof etiqueta); setMostrar(50) }}>
          <option value="todas">Calidad: todas</option>
          <option value="fuerte">🟢 fuerte</option>
          <option value="media">🟡 media</option>
          <option value="debil">⚪ débil</option>
        </select>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={soloGuru} onChange={e => { setSoloGuru(e.target.checked); setMostrar(50) }} />
          solo 🏆 gurús
        </label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
          <thead>
            <tr>
              {cabecera('simbolo', 'Empresa')}
              {cabecera('piotroski', 'Piotroski')}
              {cabecera('roic', 'ROIC')}
              {cabecera('ey', 'Earnings yield')}
              {cabecera('momentum', 'Momentum')}
              {cabecera('mktCap', 'Capitalización')}
              <th style={{ ...th, cursor: 'default' }}>Calidad</th>
              <th style={{ ...th, cursor: 'default' }}>Señales</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, mostrar).map(f => (
              <tr key={f.simbolo}>
                <td style={{ ...td, fontWeight: 700 }}>{f.simbolo} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— {f.nombre ?? '¿?'}</span></td>
                <td style={td}>{f.piotroski ?? '—'}</td>
                <td style={td}>{pctCell(f.roic)}</td>
                <td style={td}>{pctCell(f.ey, 1)}</td>
                <td style={td}>{pctCell(f.momentum)}</td>
                <td style={td}>{mktCapCell(f.mktCap)}</td>
                <td style={td}>{ETIQ[f.etiqueta]}</td>
                <td style={td}>{f.guru ? '🏆 ' : ''}{f.tecnico === 'si' ? '📈' : f.tecnico === 'esperar' ? '⏳' : ''}</td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td style={{ ...td, color: 'var(--muted)' }} colSpan={8}>Ningún resultado con esos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {Math.min(mostrar, lista.length)} de {lista.length} resultados · 🏆/📈 solo se calculan para el top-20 del snapshot semanal
        </span>
        {lista.length > mostrar && (
          <button onClick={() => setMostrar(m => m + 50)} style={{ ...sel, cursor: 'pointer' }}>Ver más</button>
        )}
      </div>
    </div>
  )
}
