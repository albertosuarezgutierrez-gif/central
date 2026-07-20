'use client'
import { useState } from 'react'

// 🔍 Buscador de análisis por acción (Alberto, 20/07/2026: "pongo PayPal y el agente me hace un
// análisis"). Client component: pide GET /api/trading/analisis-simbolo y pinta el informe
// DETERMINISTA (factores, puesto en el ranking, técnico, 📊 volumen, 💪 fuerza relativa en caídas,
// 📰 8-K, 🧑‍💼 insiders, 📅 próximo informe). SOLO estudio — nada se opera.

type Analisis = {
  simbolo: string; nombre: string | null; enUniverso: boolean
  puesto: number | null; deTotal: number | null; score: number | null
  etiqueta: 'fuerte' | 'media' | 'debil' | null
  factores: { piotroski: number | null; roic: number | null; earningsYield: number | null; fcfYield: number | null; momentum: number | null; mktCap: number | null } | null
  precio: number | null
  tecnico: 'si' | 'esperar' | null; sobreSma50: boolean | null; rsi14: number | null
  volumen: { spikesUp: number; spikesDown: number; veredicto: 'acumulacion' | 'distribucion' | 'neutral' } | null
  fuerza: { diasCaida: number; medianaAccion: number; medianaBench: number; pctVerdes: number; veredicto: 'resiste' | 'acompaña' | 'sufre' } | null
  eventos8K: Array<{ fecha: string; etiquetas: string[] }>
  insiders: { compras: number; ventas: number; usdCompras: number } | null
  proximoInforme: string | null
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }
const fila: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14, padding: '3px 0' }
const etiq: React.CSSProperties = { color: 'var(--muted)', minWidth: 150, fontSize: 13 }

const pct = (x: number | null | undefined, dec = 1) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dec)}%`)
const mm$ = (n: number | null) => (n == null ? '—' : `${(n / 1e9).toLocaleString('es-ES', { maximumFractionDigits: n >= 1e11 ? 0 : 1 })} mM$`)

const FUERZA = {
  resiste: '💪 RESISTE — en los días malos del índice suele acabar plana o en verde (compradores defendiéndola)',
  acompaña: '🟡 acompaña — cae en los días malos, pero menos que el índice',
  sufre: '🔴 sufre — cae igual o más que el índice en los días malos',
} as const
const VOLUMEN = {
  acumulacion: '📊↑ acumulación — picos de volumen en días de subida (huella de fondos entrando)',
  distribucion: '📊↓ distribución — picos de volumen en días de bajada (soltando papel)',
  neutral: '— sin picos de volumen relevantes en las últimas 20 sesiones',
} as const

export default function AnalisisSimbolo() {
  const [q, setQ] = useState('')
  const [a, setA] = useState<Analisis | null>(null)
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'ok' | 'error'>('idle')

  const analizar = () => {
    const simbolo = q.trim().toUpperCase()
    if (!simbolo) return
    setEstado('cargando'); setA(null)
    fetch(`/api/trading/analisis-simbolo?simbolo=${encodeURIComponent(simbolo)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(j => { setA(j.analisis); setEstado('ok') })
      .catch(() => setEstado('error'))
  }

  return (
    <div style={{ ...card, marginBottom: 22 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        🔍 Analiza una acción <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>
          (ticker de EEUU, p. ej. PYPL — informe determinista con los mismos ojos del radar; solo estudio)
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') analizar() }}
          placeholder="Ticker (PYPL, AAPL…)" style={{ ...sel, width: 160 }} maxLength={10}
        />
        <button onClick={analizar} disabled={estado === 'cargando'} style={{ ...sel, cursor: 'pointer', fontWeight: 700 }}>
          {estado === 'cargando' ? 'Analizando…' : 'Analizar'}
        </button>
      </div>
      {estado === 'error' && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>No encuentro ese ticker (¿es de EEUU?) o la fuente de precios no responde — prueba otra vez.</div>}
      {estado === 'ok' && a && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {a.simbolo} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— {a.nombre ?? 'fuera del universo del radar'}</span>
            {a.precio != null && <span style={{ marginLeft: 10, fontWeight: 400 }}>{a.precio.toLocaleString('es-ES', { maximumFractionDigits: 2 })} $</span>}
          </div>
          {a.enUniverso ? (
            <>
              <div style={fila}><span style={etiq}>Puesto en el ranking</span><strong>{a.puesto != null ? `${a.puesto} de ${a.deTotal}` : '—'}</strong>{a.etiqueta && <span>· calidad {a.etiqueta === 'fuerte' ? '🟢 fuerte' : a.etiqueta === 'media' ? '🟡 media' : '⚪ débil'}</span>}</div>
              <div style={fila}><span style={etiq}>Fundamentales</span><span>Piotroski <strong>{a.factores?.piotroski ?? '—'}</strong> · ROIC <strong>{pct(a.factores?.roic, 0)}</strong> · EY <strong>{pct(a.factores?.earningsYield)}</strong> · FCF yield <strong>{pct(a.factores?.fcfYield)}</strong> · cap <strong>{mm$(a.factores?.mktCap ?? null)}</strong></span></div>
              <div style={fila}><span style={etiq}>Momentum 12m</span><strong>{pct(a.factores?.momentum, 0)}</strong></div>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '3px 0' }}>Fuera del universo del radar (~550 mayores de EEUU) — análisis solo de precio, sin fundamentales de la SEC.</div>
          )}
          <div style={fila}><span style={etiq}>Técnico (el CUÁNDO)</span><span>{a.tecnico === 'si' ? '📈 compra ahora' : a.tecnico === 'esperar' ? '⏳ en espera' : '—'} · {a.sobreSma50 == null ? '' : a.sobreSma50 ? 'sobre su media de 50' : 'bajo su media de 50'} · RSI {a.rsi14 != null ? a.rsi14.toFixed(0) : '—'}</span></div>
          <div style={fila}><span style={etiq}>Volumen (fondos)</span><span>{a.volumen ? VOLUMEN[a.volumen.veredicto] : '—'}</span></div>
          <div style={fila}><span style={etiq}>Fuerza en caídas</span><span>{a.fuerza ? <>{FUERZA[a.fuerza.veredicto]} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({a.fuerza.diasCaida} días malos del SPY: acción {pct(a.fuerza.medianaAccion)} vs SPY {pct(a.fuerza.medianaBench)}, verde el {(a.fuerza.pctVerdes * 100).toFixed(0)}%)</span></> : '—'}</span></div>
          <div style={fila}><span style={etiq}>📰 8-K (30 días)</span><span>{a.eventos8K.length ? a.eventos8K.map(e => `${e.etiquetas.join(' + ')} (${e.fecha.slice(5)})`).join(' · ') : 'sin eventos materiales'}</span></div>
          <div style={fila}><span style={etiq}>🧑‍💼 Insiders (30 días)</span><span>{a.insiders ? `${a.insiders.compras} compra${a.insiders.compras !== 1 ? 's' : ''}${a.insiders.usdCompras > 0 ? ` ~${Math.round(a.insiders.usdCompras / 1000)} k$` : ''} / ${a.insiders.ventas} venta${a.insiders.ventas !== 1 ? 's' : ''}` : 'sin operaciones de mercado abierto'}</span></div>
          <div style={fila}><span style={etiq}>📅 Resultados</span><span>{a.proximoInforme ? `pronto — ~${a.proximoInforme} (estimado por el patrón del año pasado)` : 'sin informe estimado en los próximos 10 días'}</span></div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
            Todo determinista (SEC + precios públicos), mismas reglas que el radar: la selección elige el QUÉ, el técnico el CUÁNDO; volumen/fuerza/noticias = contexto. SOLO estudio — nada se opera.
          </div>
        </div>
      )}
    </div>
  )
}
