'use client'
import { useState, useEffect } from 'react'

const C = { primary: 'var(--brand-primary)',brand: 'var(--brand-secondary)',light: 'var(--brand-light)',bg:'#f1f5f9',text:'#1e293b',muted:'#64748b',border:'#e2e8f0',ok:'#16a34a',okBg:'#f0fdf4',warn:'#d97706',warnBg:'#fffbeb' }

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [generando, setGen]     = useState<string|null>(null)

  useEffect(() => {
    fetch('/api/admin/facturas').then(r => r.json()).then(d => { setFacturas(d.facturas || []); setLoading(false) })
  }, [])

  async function generar(cliente_id: string, periodo: string) {
    setGen(cliente_id + periodo)
    const r = await fetch('/api/admin/informes/generar', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ cliente_id, periodo, enviar_email: false })
    })
    const d = await r.json()
    if (d.html) {
      const win = window.open('', '_blank')
      if (win) { win.document.write(d.html); win.document.close() }
    }
    setGen(null)
    // Recargar
    fetch('/api/admin/facturas').then(r => r.json()).then(d => setFacturas(d.facturas || []))
  }

  async function enviarEmail(id: string, cliente_id: string, periodo: string) {
    setGen(id)
    await fetch('/api/admin/informes/generar', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ cliente_id, periodo, enviar_email: true })
    })
    setGen(null)
  }

  // Generar lista de periodos disponibles (últimos 6 meses)
  const periodos = Array.from({length:6}, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i - 1)
    return d.toISOString().slice(0,7)
  })

  return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:"'Nunito',sans-serif" }}>
      <header style={{ background:C.primary, padding:'18px 24px', display:'flex', alignItems:'center', gap:16 }}>
        <a href="/dashboard" style={{ color:'rgba(255,255,255,0.7)', fontSize:13, textDecoration:'none' }}>← Dashboard</a>
        <div>
          <h1 style={{ color:'white', fontWeight:800, fontSize:20 }}>Facturas mensuales</h1>
          <p style={{ color:'rgba(255,255,255,0.65)', fontSize:12 }}>Se generan automáticamente el día 1 de cada mes</p>
        </div>
      </header>

      <div style={{ padding:'20px 24px', maxWidth:800, margin:'0 auto' }}>
        {loading && <div style={{ textAlign:'center', padding:40, color:C.muted }}>Cargando...</div>}

        {!loading && (
          <>
            <div style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, padding:'14px 18px', marginBottom:20, display:'flex', gap:16, alignItems:'center', fontSize:13 }}>
              <span style={{ fontSize:20 }}>💡</span>
              <div>
                <span style={{ fontWeight:600, color:C.text }}>Generación automática activa — </span>
                <span style={{ color:C.muted }}>El día 1 de cada mes se genera y envía el informe de cada cliente automáticamente si tienes configurado el email.</span>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {facturas.map((f: any) => (
                <div key={f.id} style={{ background:'white', borderRadius:12, border:`1px solid ${C.border}`, padding:'16px 20px' }}>
                  <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{f.cliente_nombre}</div>
                      <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>
                        {f.periodo} · {f.total_sesiones || 0} sesiones · {f.total_horas ? f.total_horas + 'h' : '—'} · €{f.total_facturado || 0}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                      <button onClick={() => generar(f.cliente_id, f.periodo)}
                        disabled={generando === f.cliente_id + f.periodo}
                        style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${C.border}`, background:'white', color:C.text, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                        👁️ Ver PDF
                      </button>
                      {f.contacto_email && (
                        <button onClick={() => enviarEmail(f.id, f.cliente_id, f.periodo)}
                          disabled={generando === f.id}
                          style={{ padding:'7px 14px', borderRadius:8, border:'none', background: f.email_enviado ? C.okBg : C.primary, color: f.email_enviado ? C.ok : 'white', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          {f.email_enviado ? '✅ Enviado' : '📧 Enviar'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {facturas.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>📄</div>
                  <div style={{ fontWeight:700 }}>Sin facturas generadas aún</div>
                  <p style={{ fontSize:13, marginTop:4 }}>Se generarán automáticamente el 1 de cada mes</p>
                </div>
              )}
            </div>

            <div style={{ marginTop:24 }}>
              <h3 style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:12 }}>Generar informe manualmente</h3>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {periodos.map(p => (
                  <button key={p}
                    onClick={async () => {
                      const clientes = await fetch('/api/admin/clientes').then(r => r.json())
                      const cs = clientes.clientes || []
                      if (cs.length === 1) generar(cs[0].id, p)
                      else alert('Selecciona el cliente desde la lista de arriba')
                    }}
                    style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${C.border}`, background:'white', color:C.muted, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
