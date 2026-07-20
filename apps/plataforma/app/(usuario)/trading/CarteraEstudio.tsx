'use client'
import { useEffect, useState } from 'react'
import { eur } from '@/lib/dinero'

// 💼 Cartera de ESTUDIO (Alberto, 20/07/2026): 30.000€ SIMULADOS sobre la cohorte congelada más
// reciente del forward paper, en euros con FX real. Client component con carga perezosa (la página
// SSR no paga los ~10 fetch de precios; solo quien mira la card). SOLO estudio — cero órdenes reales.

type Posicion = { simbolo: string; invertidoEur: number; valorEur: number; retorno: number }
type Cartera = {
  capitalEur: number; fechaInicio: string; cohorte: string
  fx: { inicio: number; hoy: number; disponible: boolean }
  posiciones: Posicion[]
  valorEur: number; plEur: number; plPct: number
  bench: { simbolo: string; valorEur: number; plEur: number; retorno: number }
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 14, whiteSpace: 'nowrap' }

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const signo = (n: number) => (n >= 0 ? 'var(--positive)' : 'var(--negative)')

export default function CarteraEstudio() {
  const [cartera, setCartera] = useState<Cartera | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')

  useEffect(() => {
    fetch('/api/trading/cartera-estudio')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(j => { setCartera(j.cartera); setEstado('ok') })
      .catch(() => setEstado('error'))
  }, [])

  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        💼 Cartera de estudio <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>
          (30.000€ SIMULADOS en la última cohorte congelada — solo estudio, nada se opera en el bróker)
        </span>
      </div>
      {estado === 'cargando' && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Valorando la cartera con precios de mercado…</div>}
      {estado === 'error' && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin precios ahora mismo (fuente caída) — recarga en un rato.</div>}
      {estado === 'ok' && cartera && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{eur(cartera.valorEur)}</span>
            <span style={{ fontWeight: 700, color: signo(cartera.plEur) }}>{cartera.plEur >= 0 ? '+' : ''}{eur(cartera.plEur)} ({pct(cartera.plPct)})</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              {cartera.bench.simbolo} con los mismos {eur(cartera.capitalEur)}: {eur(cartera.bench.valorEur)} ({pct(cartera.bench.retorno)})
              {cartera.valorEur >= cartera.bench.valorEur ? ' — vamos por delante ✅' : ' — vamos por detrás ⚠️'}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
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
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
            Desde el {cartera.fechaInicio} · equiponderada, sin rebalanceo ni comisiones · cierres sin dividendos
            (igual para la cesta y el {cartera.bench.simbolo}, la comparativa es justa) ·
            {cartera.fx.disponible
              ? ` FX EUR/USD ${cartera.fx.inicio.toFixed(4)} → ${cartera.fx.hoy.toFixed(4)}`
              : ' FX no disponible ahora — cifras sin convertir'}
            · el dinero real solo llegará si el forward bate al SPY de forma sostenida (regla firmada).
          </div>
        </>
      )}
    </div>
  )
}
