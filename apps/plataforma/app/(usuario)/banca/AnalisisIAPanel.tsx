'use client'
import { useState } from 'react'

// Panel "✨ Análisis IA del periodo" — bajo demanda (no corre en cada carga, evita coste/latencia).
// Al pulsar, pide a /api/banca/analisis-ia unos insights en lenguaje natural del periodo actual.
export default function AnalisisIAPanel({ desde, hasta, periodoLabel }: {
  desde: string; hasta: string; periodoLabel: string
}) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'listo'>('idle')
  const [texto, setTexto] = useState('')

  async function analizar() {
    setEstado('cargando'); setTexto('')
    try {
      const res = await fetch('/api/banca/analisis-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde, hasta, periodoLabel }),
      })
      const data = await res.json().catch(() => ({})) as { texto?: string }
      setTexto(data.texto || 'No se pudo obtener el análisis.')
    } catch {
      setTexto('No se pudo obtener el análisis. Inténtalo de nuevo.')
    } finally {
      setEstado('listo')
    }
  }

  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>✨ Análisis IA del periodo</strong>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Insights sobre tus cifras de negocio y personal · {periodoLabel}</div>
          </div>
          <button onClick={analizar} disabled={estado === 'cargando'}
            style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', cursor: estado === 'cargando' ? 'default' : 'pointer', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600, opacity: estado === 'cargando' ? 0.6 : 1 }}>
            {estado === 'cargando' ? 'Analizando…' : estado === 'listo' ? '↻ Volver a analizar' : '✨ Analizar periodo'}
          </button>
        </div>
        {texto && (
          <div style={{ marginTop: '14px', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            {texto}
          </div>
        )}
      </div>
    </section>
  )
}
