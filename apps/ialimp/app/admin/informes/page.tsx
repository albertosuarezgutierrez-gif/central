'use client'
import { useState, useEffect } from 'react'

const C = { primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0', ok: '#16a34a', okBg: '#f0fdf4' }

export default function InformesPage() {
  const [clientes, setClientes] = useState<any[]>([])
  const [periodo, setPeriodo]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7) })
  const [loading, setLoading]   = useState<string|null>(null)
  const [generados, setGenerados] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/clientes').then(r => r.json()).then(d => setClientes(d.clientes || []))
  }, [])

  async function generar(cliente_id: string, enviar: boolean) {
    setLoading(cliente_id)
    const r = await fetch('/api/admin/informes/generar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id, periodo, enviar_email: enviar })
    })
    const d = await r.json()
    if (d.ok) {
      setGenerados(s => new Set([...s, cliente_id]))
      if (d.html) {
        const win = window.open('', '_blank')
        if (win) { win.document.write(d.html); win.document.close() }
      }
    }
    setLoading(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: C.primary, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
        <div>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>Informes mensuales</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>Genera y envía informes a tus clientes</p>
        </div>
      </header>

      <div style={{ padding: '24px', maxWidth: 700, margin: '0 auto' }}>
        {/* Selector de periodo */}
        <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 24 }}>📅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 4 }}>Período del informe</div>
            <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
              style={{ padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, outline: 'none' }} />
          </div>
        </div>

        {/* Clientes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clientes.map((c: any) => {
            const yaGenerado = generados.has(c.id)
            const cargando   = loading === c.id
            return (
              <div key={c.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${yaGenerado ? C.ok : C.border}`, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', borderLeft: `4px solid ${yaGenerado ? C.ok : C.brand}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{c.nombre}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{c.tipo}</div>
                </div>
                {yaGenerado ? (
                  <span style={{ fontSize: 13, color: C.ok, fontWeight: 600 }}>✅ Generado</span>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => generar(c.id, false)} disabled={!!cargando}
                      style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'white', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {cargando ? '...' : '👁️ Ver'}
                    </button>
                    <button onClick={() => generar(c.id, true)} disabled={!!cargando}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.primary, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {cargando ? '...' : '📧 Enviar'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 20, padding: 16, background: C.light, borderRadius: 10, fontSize: 12, color: C.brand }}>
          💡 El informe se abre en una nueva pestaña — usa Ctrl+P para guardarlo como PDF
        </div>
      </div>
    </div>
  )
}
