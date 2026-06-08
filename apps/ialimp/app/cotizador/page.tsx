'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState, useEffect } from 'react'

const EMPRESA_ID = '05edacff-ea49-42fe-8997-f9369613a845'

const C = {
  primary: '#4f46e5', brand: '#6366f1', light: '#eef2ff',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4',
}

function Stepper({ label, value, onChange, min = 0, max = 10 }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', borderRadius: 10, padding: '10px 14px', border: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 18, cursor: value <= min ? 'not-allowed' : 'pointer', color: value <= min ? C.border : C.text, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ width: 24, textAlign: 'center', fontWeight: 800, fontSize: 18, color: value > 0 ? C.primary : C.muted }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.brand}`, background: C.light, fontSize: 18, cursor: value >= max ? 'not-allowed' : 'pointer', color: C.primary, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>
    </div>
  )
}

export default function CotizadorPage() {
  const [config, setConfig]     = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [enviado, setEnviado]   = useState(false)
  const [sending, setSending]   = useState(false)

  const [tipo, setTipo]         = useState('')
  const [m2, setM2]             = useState('')
  const [frecuencia, setFrecuencia] = useState('')
  const [recargos, setRecargos] = useState<string[]>([])
  const [habitaciones, setHabitaciones] = useState<Record<string, number>>({})
  const [nombre, setNombre]     = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail]       = useState('')

  useEffect(() => {
    fetch(`/api/cotizador?empresa_id=${EMPRESA_ID}`)
      .then(r => r.json())
      .then(d => {
        setConfig(d.config)
        // Init habitaciones a 0
        if (d.config?.incrementos) {
          const init: Record<string, number> = {}
          Object.keys(d.config.incrementos).forEach(k => { init[k] = 0 })
          setHabitaciones(init)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // ── Cálculo de precio ─────────────────────────────────────────────
  const calcularPrecio = () => {
    if (!config || !tipo) return null
    const servicio   = config.servicios?.find((s: any) => s.id === tipo)
    const frecConfig = config.frecuencias?.find((f: any) => f.id === frecuencia)
    if (!servicio) return null

    let precio = servicio.base

    // Por m²
    if (m2 && Number(m2) > 0) {
      precio += Number(m2) * servicio.por_m2
    }

    // Por habitaciones/estancias
    if (config.incrementos) {
      Object.entries(habitaciones).forEach(([key, qty]) => {
        const incr = config.incrementos[key]
        if (incr?.activo && qty > 0) {
          precio += incr.precio * qty
        }
      })
    }

    // Frecuencia
    if (frecConfig) precio *= frecConfig.mult

    // Recargos
    if (config.recargos) {
      config.recargos.filter((r: any) => r.activo && recargos.includes(r.id)).forEach((r: any) => {
        if (r.tipo === 'fijo') precio += r.valor
        else if (r.tipo === 'porcentaje') precio *= (1 + r.valor / 100)
      })
    }

    return Math.round(precio)
  }

  const precio = calcularPrecio()

  // Desglose
  const desglose = () => {
    if (!config || !tipo) return []
    const servicio = config.servicios?.find((s: any) => s.id === tipo)
    if (!servicio) return []
    const items: { label: string; valor: number }[] = []
    items.push({ label: `Base (${servicio.label})`, valor: servicio.base })
    if (m2 && Number(m2) > 0) items.push({ label: `${m2} m²`, valor: Math.round(Number(m2) * servicio.por_m2) })
    Object.entries(habitaciones).forEach(([key, qty]) => {
      const incr = config.incrementos?.[key]
      if (incr?.activo && qty > 0) items.push({ label: `${qty}× ${incr.label}`, valor: Math.round(incr.precio * qty) })
    })
    return items
  }

  async function enviar() {
    setSending(true)
    await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre, telefono, email, zona: 'Sevilla',
        tipo_servicio: tipo, m2: Number(m2),
        frecuencia, precio_estimado: precio,
        notas: Object.entries(habitaciones)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${v} ${config?.incrementos?.[k]?.label || k}`)
          .join(', ')
      })
    })
    setEnviado(true); setSending(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ color: C.muted }}>Cargando...</div>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ textAlign: 'center', padding: 32, maxWidth: 400 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontWeight: 800, fontSize: 24, color: C.text, marginBottom: 8 }}>¡Presupuesto solicitado!</h2>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.5 }}>Te contactamos en menos de 24h.</p>
        {precio && <div style={{ marginTop: 16, background: C.primary, borderRadius: 12, padding: '16px 24px', color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Precio estimado</div>
          <div style={{ fontSize: 36, fontWeight: 800 }}>{precio}€</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>por limpieza · sin IVA</div>
        </div>}
      </div>
    </div>
  )

  const serviciosActivos = config?.servicios?.filter((s: any) => s.activo) || []
  const frecuenciasActivas = config?.frecuencias?.filter((f: any) => f.activo) || []
  const recargosActivos = config?.recargos?.filter((r: any) => r.activo) || []
  const incrementosActivos = config?.incrementos
    ? Object.entries(config.incrementos).filter(([, v]: any) => v.activo)
    : []

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: '24px 20px', textAlign: 'center' }}>
        <LogoIalimp size={26} style={{ marginBottom:8, display:"block" }} />
        <h1 style={{ color: 'white', fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: '-0.02em' }}>
          {config?.titulo || 'Calcula tu presupuesto'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: '6px 0 0' }}>
          {config?.subtitulo || 'Gratis y sin compromiso'}
        </p>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* 1. Tipo de servicio */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>¿Qué tipo de limpieza necesitas?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {serviciosActivos.map((s: any) => (
              <button key={s.id} type="button" onClick={() => setTipo(s.id)}
                style={{ padding: '12px', borderRadius: 10, border: `2px solid ${tipo === s.id ? C.primary : C.border}`, background: tipo === s.id ? C.light : 'white', color: tipo === s.id ? C.primary : C.text, fontSize: 12, fontWeight: tipo === s.id ? 700 : 500, cursor: 'pointer', textAlign: 'left', lineHeight: 1.4, fontFamily: 'inherit' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. M² */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>¿Cuántos m²? <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[40, 60, 80, 100, 150].map(v => (
              <button key={v} type="button" onClick={() => setM2(m2 === String(v) ? '' : String(v))}
                style={{ padding: '9px 14px', borderRadius: 8, border: `2px solid ${m2 === String(v) ? C.primary : C.border}`, background: m2 === String(v) ? C.light : 'white', color: m2 === String(v) ? C.primary : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {v}m²
              </button>
            ))}
            <input type="number" value={m2} onChange={e => setM2(e.target.value)} placeholder="Otro m²"
              style={{ width: 80, padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }} />
          </div>
        </div>

        {/* 3. Estancias */}
        {incrementosActivos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Estancias del inmueble</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incrementosActivos.map(([key, incr]: any) => (
                <Stepper
                  key={key}
                  label={incr.label}
                  value={habitaciones[key] || 0}
                  onChange={(v: number) => setHabitaciones(h => ({ ...h, [key]: v }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* 4. Frecuencia */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>¿Con qué frecuencia?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {frecuenciasActivas.map((f: any) => (
              <button key={f.id} type="button" onClick={() => setFrecuencia(frecuencia === f.id ? '' : f.id)}
                style={{ padding: '9px 16px', borderRadius: 8, border: `2px solid ${frecuencia === f.id ? C.primary : C.border}`, background: frecuencia === f.id ? C.light : 'white', color: frecuencia === f.id ? C.primary : C.muted, fontSize: 12, fontWeight: frecuencia === f.id ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Recargos */}
        {recargosActivos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>¿Aplica algún recargo?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {recargosActivos.map((r: any) => (
                <button key={r.id} type="button"
                  onClick={() => setRecargos(rs => rs.includes(r.id) ? rs.filter(x => x !== r.id) : [...rs, r.id])}
                  style={{ padding: '9px 14px', borderRadius: 8, border: `2px solid ${recargos.includes(r.id) ? C.primary : C.border}`, background: recargos.includes(r.id) ? C.light : 'white', color: recargos.includes(r.id) ? C.primary : C.muted, fontSize: 12, fontWeight: recargos.includes(r.id) ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {r.label} ({r.tipo === 'fijo' ? `+${r.valor}€` : `+${r.valor}%`})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Precio estimado */}
        {precio && (
          <div style={{ background: C.primary, borderRadius: 14, padding: '20px', marginBottom: 20, textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>Precio estimado</div>
            <div style={{ color: 'white', fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{precio}€</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 6 }}>por limpieza · sin IVA · sin compromiso</div>
            {/* Desglose */}
            {desglose().length > 1 && (
              <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', textAlign: 'left' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Desglose</div>
                {desglose().map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>
                    <span>{item.label}</span><span>+{item.valor}€</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contacto */}
        <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: '20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Déjanos tus datos y te llamamos</div>
          {[
            { k: 'nombre',   label: 'Nombre *',    ph: 'Tu nombre completo',  type: 'text' },
            { k: 'telefono', label: 'Teléfono *',   ph: '6xx xxx xxx',         type: 'tel' },
            { k: 'email',    label: 'Email',         ph: 'tu@email.com',        type: 'email' },
          ].map(f => (
            <div key={f.k} style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{f.label}</label>
              <input type={f.type}
                value={f.k === 'nombre' ? nombre : f.k === 'telefono' ? telefono : email}
                onChange={e => f.k === 'nombre' ? setNombre(e.target.value) : f.k === 'telefono' ? setTelefono(e.target.value) : setEmail(e.target.value)}
                placeholder={f.ph}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          ))}
          <button type="button" onClick={enviar}
            disabled={sending || !nombre || !telefono || !tipo}
            style={{ width: '100%', padding: '13px', background: C.primary, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: (!nombre || !telefono || !tipo) ? 'not-allowed' : 'pointer', opacity: (!nombre || !telefono || !tipo) ? 0.5 : 1, fontFamily: 'inherit', marginTop: 4 }}>
            {sending ? 'Enviando...' : '📩 Solicitar presupuesto gratis'}
          </button>
        </div>
      </div>
    </div>
  )
}
