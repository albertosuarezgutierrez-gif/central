'use client'
import { useEffect, useState } from 'react'

// Onboarding del laboratorio de inversión: explica qué es y su invariante (SOLO paper). Descartable,
// se recuerda en localStorage. Reaparece si se sube la versión (para re-explicar cambios grandes).
const VERSION = 'v1'
const KEY = `trading_onboarding_${VERSION}`

const PASOS = [
  { icon: '🧪', titulo: 'Es un simulador (paper)', texto: 'El agente NO ejecuta ninguna orden real en tu cuenta de Interactive Brokers. Todo lo que ves aquí son operaciones SIMULADAS en base de datos. Cero riesgo de dinero real.' },
  { icon: '🔎', titulo: 'Descubre solo dónde mirar', texto: 'Explora temas del mercado (Nuclear, Quantum, Defensa…), detecta volumen inusual y acciones baratas, y descarta la “lotería” (volatilidad extrema). Autonomía = decidir qué estudiar, nunca comprar.' },
  { icon: '🛡️', titulo: 'Con barreras de riesgo', texto: 'Antes de una compra simulada aplica límites: máx. 20% del capital por nombre, no promediar perdedores, no fadear tendencias fuertes (ADX) y no comprar justo antes de resultados (earnings).' },
  { icon: '📊', titulo: 'Se mide contra el histórico', texto: 'Cada idea se puntúa a posteriori (walk-forward) y hay backtests sobre datos reales. La puerta a operar de verdad NO se abre hasta que demuestre rentabilidad sostenida fuera de muestra.' },
]

export default function OnboardingBanner() {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setVisible(localStorage.getItem(KEY) !== '1') }, [])
  if (!visible) return null
  const cerrar = () => { localStorage.setItem(KEY, '1'); setVisible(false) }
  return (
    <div style={{ border: '1px solid var(--border)', background: 'var(--info-bg)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>👋 Bienvenido al laboratorio de inversión</div>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Un agente que estudia el mercado por ti — <strong>100% simulado</strong> hasta que sea rentable.</div>
        </div>
        <button onClick={cerrar} style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Entendido ✓</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
        {PASOS.map(p => (
          <div key={p.titulo} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{p.icon} {p.titulo}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>{p.texto}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
