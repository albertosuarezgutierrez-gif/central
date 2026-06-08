'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState } from 'react'

const C = { primary: 'var(--brand-primary)',brand: 'var(--brand-secondary)',light: 'var(--brand-light)',bg:'#f1f5f9',text:'#1e293b',muted:'#64748b',border:'#e2e8f0',ok:'#16a34a',okBg:'#f0fdf4' }

const PLANES = [
  {
    id: 'starter', nombre: 'Starter', precio: 0,
    desc: 'Para empezar sin compromiso',
    features: ['1 limpiadora','5 propiedades','App limpiadora','Vista propietario','Soporte básico'],
    cta: 'Plan actual', disabled: true
  },
  {
    id: 'pro', nombre: 'Pro', precio: 49,
    desc: 'Para empresas en crecimiento',
    features: ['Limpiadoras ilimitadas','Propiedades ilimitadas','Agenda semanal','RRHH + IA','Informes PDF mensuales','Control horario','Sync Smoobu/iCal','Soporte prioritario'],
    cta: 'Empezar Pro', highlight: true
  },
  {
    id: 'agency', nombre: 'Agency', precio: 149,
    desc: 'Para empresas con múltiples clientes',
    features: ['Todo en Pro','Multi-empresa','API pública','Onboarding dedicado','Facturación automática','SLA 99.9%','Manager de cuenta'],
    cta: 'Contactar ventas'
  }
]

export default function PlanesPage() {
  const [loading, setLoading] = useState<string|null>(null)
  const [annual, setAnnual]   = useState(false)

  async function suscribir(planId: string) {
    if (planId === 'starter') return
    if (planId === 'agency') {
      window.location.href = 'mailto:hola@ialimp.com?subject=Plan Agency'
      return
    }
    setLoading(planId)
    try {
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ plan: planId, annual })
      })
      const d = await r.json()
      if (d.url) window.location.href = d.url
      else alert(d.error || 'Error al crear sesión de pago')
    } catch { alert('Error de conexión') }
    setLoading(null)
  }

  return (
    <div style={{ minHeight:'100vh', background: C.bg, fontFamily:"'Nunito',sans-serif" }}>
      <header style={{ background: C.primary, padding:'18px 24px', display:'flex', alignItems:'center', gap:16 }}>
        <a href="/dashboard" style={{ color:'rgba(255,255,255,0.7)', fontSize:13, textDecoration:'none' }}>← Dashboard</a>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:10 }}>
          <LogoIalimp size={20} />
          <div style={{ width:1, height:14, background:'rgba(255,255,255,.25)' }} />
          <h1 style={{ color:'rgba(255,255,255,.85)', fontWeight:600, fontSize:15 }}>Planes y precios</h1>
        </div>
      </header>

      <div style={{ padding:'32px 24px', maxWidth:900, margin:'0 auto' }}>
        {/* Toggle anual/mensual */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:12, background:'white', padding:'8px 16px', borderRadius:30, border:`1px solid ${C.border}` }}>
            <span style={{ fontSize:13, color: !annual ? C.primary : C.muted, fontWeight: !annual ? 700 : 400 }}>Mensual</span>
            <button onClick={() => setAnnual(a => !a)}
              style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative', background: annual ? C.primary : C.border, transition:'background 0.2s' }}>
              <div style={{ width:18, height:18, borderRadius:'50%', background:'white', position:'absolute', top:3, left: annual ? 23 : 3, transition:'left 0.2s' }} />
            </button>
            <span style={{ fontSize:13, color: annual ? C.primary : C.muted, fontWeight: annual ? 700 : 400 }}>
              Anual <span style={{ color: C.ok, fontSize:11, fontWeight:700 }}>-20%</span>
            </span>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:20 }}>
          {PLANES.map(plan => (
            <div key={plan.id} style={{
              background:'white', borderRadius:16,
              border: plan.highlight ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              padding:'28px 24px', position:'relative',
              boxShadow: plan.highlight ? '0 8px 24px rgba(79,70,229,0.15)' : '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              {plan.highlight && (
                <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', background: C.primary, color:'white', fontSize:11, fontWeight:800, padding:'4px 16px', borderRadius:20 }}>
                  MÁS POPULAR
                </div>
              )}
              <div style={{ marginBottom:20 }}>
                <h3 style={{ fontWeight:800, fontSize:18, color: C.text, marginBottom:6 }}>{plan.nombre}</h3>
                <p style={{ fontSize:12, color: C.muted, marginBottom:16 }}>{plan.desc}</p>
                <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                  <span style={{ fontSize:36, fontWeight:800, color: C.text }}>
                    {plan.precio === 0 ? 'Gratis' : `€${annual ? Math.round(plan.precio * 0.8) : plan.precio}`}
                  </span>
                  {plan.precio > 0 && <span style={{ fontSize:13, color: C.muted }}>/mes</span>}
                </div>
                {plan.precio > 0 && annual && (
                  <div style={{ fontSize:11, color: C.ok, marginTop:2 }}>
                    Facturado anual · ahorro €{Math.round(plan.precio * 0.2 * 12)}/año
                  </div>
                )}
              </div>

              <ul style={{ listStyle:'none', marginBottom:24 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display:'flex', gap:8, fontSize:13, color: C.text, marginBottom:8 }}>
                    <span style={{ color: C.ok }}>✓</span>{f}
                  </li>
                ))}
              </ul>

              <button onClick={() => suscribir(plan.id)}
                disabled={!!plan.disabled || loading === plan.id}
                style={{
                  width:'100%', padding:12, borderRadius:10, border:'none', cursor: plan.disabled ? 'default' : 'pointer',
                  background: plan.disabled ? C.bg : plan.highlight ? C.primary : C.text,
                  color: plan.disabled ? C.muted : 'white',
                  fontSize:14, fontWeight:700, opacity: loading === plan.id ? 0.6 : 1, fontFamily:'inherit'
                }}>
                {loading === plan.id ? 'Cargando...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop:32, textAlign:'center', fontSize:12, color: C.muted }}>
          Todos los planes incluyen prueba gratuita de 30 días · Sin compromiso · Cancela cuando quieras
        </div>
      </div>
    </div>
  )
}
