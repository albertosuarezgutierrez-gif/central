'use client'
import { useEffect, useState } from 'react'
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts'
import { eur } from '@/lib/dinero'

// 💼 Cartera de ESTUDIO (Alberto, 20/07/2026): 30.000€ SIMULADOS en CADA cohorte congelada del
// forward paper, en euros con FX real, con curva semanal. Client component con carga perezosa (la
// página SSR no paga los fetch de precios; solo quien mira la card). SOLO estudio — cero órdenes.

type Posicion = { simbolo: string; invertidoEur: number; valorEur: number; retorno: number }
type Cartera = {
  capitalEur: number; fechaInicio: string; cohorte: string
  fx: { inicio: number; hoy: number; disponible: boolean }
  posiciones: Posicion[]
  valorEur: number; plEur: number; plPct: number
  bench: { simbolo: string; valorEur: number; plEur: number; retorno: number }
}
type PuntoCurva = { fecha: string; valorEur: number; benchEur: number }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 14, whiteSpace: 'nowrap' }

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const signo = (n: number) => (n >= 0 ? 'var(--positive)' : 'var(--negative)')

function BloqueCartera({ cartera, curva, abierta }: { cartera: Cartera; curva: PuntoCurva[]; abierta: boolean }) {
  const [verPosiciones, setVerPosiciones] = useState(abierta)
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontWeight: 700 }}>Cohorte del {cartera.fechaInicio}</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{eur(cartera.valorEur)}</span>
        <span style={{ fontWeight: 700, color: signo(cartera.plEur) }}>{cartera.plEur >= 0 ? '+' : ''}{eur(cartera.plEur)} ({pct(cartera.plPct)})</span>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {cartera.bench.simbolo}: {eur(cartera.bench.valorEur)} ({pct(cartera.bench.retorno)})
          {cartera.valorEur >= cartera.bench.valorEur ? ' ✅' : ' ⚠️'}
        </span>
      </div>
      {curva.length >= 2 ? (
        <div style={{ height: 160, marginBottom: 6 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={curva} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={(f: string) => f.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} width={58} domain={['auto', 'auto']} tickFormatter={(v: number) => `${Math.round(v / 1000)}k€`} />
              <Tooltip formatter={(v: number, name: string) => [eur(v), name === 'valorEur' ? 'Cartera' : cartera.bench.simbolo]} labelFormatter={(f: string) => f} />
              {/* Tokens del tema, no hex fijos (regla del repo: el hex se quedaba fijo en modo oscuro). */}
              <Line type="monotone" dataKey="valorEur" stroke="var(--brand)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="benchEur" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>La curva se dibuja con los snapshots del cron semanal (aún acumulando puntos).</div>
      )}
      <button onClick={() => setVerPosiciones(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: 13 }}>
        {verPosiciones ? 'Ocultar posiciones' : `Ver las ${cartera.posiciones.length} posiciones`}
      </button>
      {verPosiciones && (
        <div style={{ overflowX: 'auto', marginTop: 4 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
            <thead><tr><th style={th}>Posición</th><th style={th}>Invertido</th><th style={th}>Valor hoy</th><th style={th}>Retorno</th></tr></thead>
            <tbody>
              {cartera.posiciones.map(p => (
                <tr key={p.simbolo}>
                  <td style={{ ...td, fontWeight: 700 }}>{p.simbolo}</td>
                  <td style={td}>{eur(p.invertidoEur)}</td>
                  <td style={td}>{eur(p.valorEur)}</td>
                  <td style={{ ...td, color: signo(p.retorno) }}>{pct(p.retorno)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CarteraEstudio() {
  const [carteras, setCarteras] = useState<Cartera[]>([])
  const [curvas, setCurvas] = useState<Record<string, PuntoCurva[]>>({})
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')

  useEffect(() => {
    fetch('/api/trading/cartera-estudio')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(j => { setCarteras(j.carteras ?? []); setCurvas(j.curvas ?? {}); setEstado('ok') })
      .catch(() => setEstado('error'))
  }, [])

  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <div style={{ fontWeight: 700 }}>
        💼 Cartera de estudio <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>
          (30.000€ SIMULADOS en cada cohorte congelada — solo estudio, nada se opera en el bróker; comparar
          varias entradas separa el efecto del momento de compra del efecto del modelo)
        </span>
      </div>
      {estado === 'cargando' && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Valorando las carteras con precios de mercado…</div>}
      {estado === 'error' && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Sin precios ahora mismo (fuente caída) — recarga en un rato.</div>}
      {estado === 'ok' && carteras.map((c, i) => (
        <BloqueCartera key={c.cohorte} cartera={c} curva={curvas[c.cohorte] ?? []} abierta={i === carteras.length - 1} />
      ))}
      {estado === 'ok' && carteras.length > 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
          Equiponderada, sin rebalanceo ni comisiones · cierres sin dividendos (igual para cesta y SPY — comparativa justa) ·
          FX EUR/USD real por fecha · el dinero real solo llegará si el forward bate al SPY de forma sostenida (regla firmada).
        </div>
      )}
    </div>
  )
}
