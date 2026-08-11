'use client'
import { useEffect, useState } from 'react'

// Onboarding del laboratorio de inversión: explica qué es y su invariante (SOLO paper). Descartable,
// se recuerda en localStorage. Reaparece si se sube la versión (para re-explicar cambios grandes).
// Condensado a UNA línea + <details> (11/08/2026): la versión de 4 tarjetas se comía el primer
// scroll del móvil, y lo primero de la página deben ser las empresas y la rentabilidad.
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
    <details style={{ border: '1px solid var(--border)', background: 'var(--info-bg)', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 18 }}>
      <summary style={{ cursor: 'pointer', fontSize: 14 }}>
        <strong>👋 ¿Cómo funciona el laboratorio?</strong> <span style={{ color: 'var(--muted)' }}>100% simulado — el agente nunca opera tu cuenta</span>
      </summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        {PASOS.map(p => (
          <div key={p.titulo} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{p.icon} {p.titulo}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>{p.texto}</div>
          </div>
        ))}
      </div>
      <button onClick={cerrar} style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', minHeight: 44, cursor: 'pointer', marginTop: 12 }}>Entendido, no volver a mostrar ✓</button>
    </details>
  )
}
