'use client'
import { useState } from 'react'

const C = { primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0', ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb', red: '#dc2626', redBg: '#fef2f2' }

const URGENCIA = {
  alta:  { bg: C.redBg,  color: C.red,  label: '🔴 Alta'  },
  media: { bg: C.warnBg, color: C.warn, label: '🟡 Media' },
  baja:  { bg: C.okBg,   color: C.ok,   label: '🟢 Baja'  },
}

export default function IAPage() {
  const [analisis, setAnalisis]   = useState<any>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function analizar() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/ia/patrones')
      const d = await r.json()
      if (d.ok) setAnalisis(d.analisis)
      else setError(d.error || 'Error')
    } catch { setError('Error de conexión') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: C.primary, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
        <div>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>🤖 IA — Patrones y predicciones</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>Análisis inteligente de tu operativa</p>
        </div>
      </header>

      <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
        {!analisis && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🤖</div>
            <h2 style={{ fontWeight: 800, fontSize: 24, color: C.text, marginBottom: 8 }}>Análisis inteligente</h2>
            <p style={{ color: C.muted, fontSize: 15, marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>
              La IA analizará tus datos de los últimos 60 días: quejas, carga de trabajo, rendimiento por limpiadora y patrones ocultos.
            </p>
            <button onClick={analizar}
              style={{ background: C.primary, color: 'white', border: 'none', borderRadius: 14, padding: '14px 32px', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
              🔍 Analizar ahora
            </button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <h3 style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>Analizando datos...</h3>
            <p style={{ color: C.muted, fontSize: 13 }}>Buscando patrones en quejas, sesiones y rendimiento</p>
          </div>
        )}

        {error && <div style={{ background: C.redBg, borderRadius: 12, padding: 16, color: C.red, marginBottom: 16 }}>{error}</div>}

        {analisis && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.text }}>Resultados del análisis</h2>
              <button onClick={analizar} style={{ background: C.light, color: C.primary, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                🔄 Actualizar
              </button>
            </div>

            {/* Patrones */}
            {analisis.patrones?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontWeight: 700, fontSize: 14, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>🔍 Patrones detectados</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {analisis.patrones.map((p: any, i: number) => {
                    const u = URGENCIA[p.urgencia as keyof typeof URGENCIA] || URGENCIA.baja
                    return (
                      <div key={i} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, borderLeft: `4px solid ${u.color}`, padding: '14px 18px' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 4 }}>{p.titulo}</div>
                            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{p.descripcion}</p>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: u.bg, color: u.color, whiteSpace: 'nowrap' }}>{u.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Predicciones */}
            {analisis.predicciones?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontWeight: 700, fontSize: 14, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>📅 Predicciones próximas semanas</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {analisis.predicciones.map((pred: any, i: number) => (
                    <div key={i} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{pred.semana}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: C.primary }}>{pred.limpiezas_estimadas}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>limpiezas estimadas</div>
                      {pred.alerta && <div style={{ marginTop: 6, fontSize: 11, color: C.warn, fontWeight: 600 }}>⚠️ {pred.alerta}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acciones */}
            {analisis.acciones_recomendadas?.length > 0 && (
              <div style={{ background: C.light, borderRadius: 14, border: `1px solid ${C.brand}33`, padding: '18px 20px' }}>
                <h3 style={{ fontWeight: 700, fontSize: 14, color: C.primary, marginBottom: 12 }}>💡 Acciones recomendadas</h3>
                {analisis.acciones_recomendadas.map((a: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: C.text }}>
                    <span style={{ color: C.brand }}>›</span>{a}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
