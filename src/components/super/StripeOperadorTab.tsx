'use client'

import { useEffect, useState } from 'react'
import { C, SE, SN } from '@/lib/colors'

type EstadoStripe = 'sin_configurar' | 'pendiente_pago' | 'activa' | 'impago' | 'cancelando' | 'cancelada'

type CuentaStripe = {
  id: string
  nombre: string
  email: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_estado: EstadoStripe
  precio_mensual: number | null
  fecha_proximo_cobro: string | null
  stripe_checkout_url: string | null
  notas_comerciales: string | null
  restaurantes: { id: string; nombre: string }[]
}

const BADGE: Record<EstadoStripe, { label: string; color: string }> = {
  sin_configurar: { label: 'Sin configurar', color: C.ink4 },
  pendiente_pago:  { label: 'Pendiente pago', color: C.amber },
  activa:          { label: 'Activa',          color: C.green },
  impago:          { label: 'IMPAGO',          color: C.red },
  cancelando:      { label: 'Cancelando',      color: C.amber },
  cancelada:       { label: 'Cancelada',       color: C.ink4 },
}

export default function StripeOperadorTab() {
  const [cuentas, setCuentas] = useState<CuentaStripe[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<CuentaStripe | null>(null)
  const [form, setForm] = useState({ email: '', nombre_empresa: '', precio_mensual: '', descripcion: '' })
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const res = await fetch('/api/super/stripe-operador')
    const json = await res.json()
    setCuentas(json.cuentas || [])
    setLoading(false)
  }

  function abrirModal(cuenta: CuentaStripe) {
    setCheckoutUrl(cuenta.stripe_checkout_url || null)
    setForm({
      email: cuenta.email || '',
      nombre_empresa: cuenta.nombre || '',
      precio_mensual: cuenta.precio_mensual?.toString() || '',
      descripcion: `ia.rest — ${cuenta.nombre}`,
    })
    setModal(cuenta)
  }

  async function generarCheckout() {
    if (!modal) return
    setSaving(true)

    // Paso 1: crear customer si no existe
    if (!modal.stripe_customer_id) {
      const r1 = await fetch('/api/super/stripe-operador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuenta_id: modal.id,
          email: form.email,
          nombre_empresa: form.nombre_empresa,
        }),
      })
      if (!r1.ok) {
        const e = await r1.json()
        alert('Error al crear customer: ' + e.error)
        setSaving(false)
        return
      }
    }

    // Paso 2: generar checkout
    const r2 = await fetch('/api/super/stripe-operador/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cuenta_id: modal.id,
        precio_mensual: parseFloat(form.precio_mensual),
        descripcion: form.descripcion,
      }),
    })
    const json2 = await r2.json()
    if (!r2.ok) {
      alert('Error al generar checkout: ' + json2.error)
      setSaving(false)
      return
    }

    setCheckoutUrl(json2.checkout_url)
    setSaving(false)
    cargar()
  }

  async function cancelarSuscripcion(cuenta_id: string, nombre: string) {
    if (!confirm(`¿Cancelar suscripción de ${nombre} al final del período actual?`)) return
    await fetch('/api/super/stripe-operador/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuenta_id }),
    })
    cargar()
  }

  function copiar(texto: string, tipo: string) {
    navigator.clipboard.writeText(texto)
    setCopiado(tipo)
    setTimeout(() => setCopiado(null), 2000)
  }

  const mrr = cuentas
    .filter(c => c.stripe_estado === 'activa')
    .reduce((acc, c) => acc + (c.precio_mensual || 0), 0)

  const kpis = [
    { label: 'MRR activo', value: `${mrr.toFixed(0)}€/mes`, color: C.green },
    { label: 'Cuentas activas', value: cuentas.filter(c => c.stripe_estado === 'activa').length.toString() },
    { label: 'Pendiente pago', value: cuentas.filter(c => c.stripe_estado === 'pendiente_pago').length.toString(), color: C.amber },
    { label: 'Impagos', value: cuentas.filter(c => c.stripe_estado === 'impago').length.toString(), color: C.red },
  ]

  if (loading) return (
    <div style={{ padding: 32, color: C.ink3, fontFamily: SN, fontSize: 13 }}>Cargando suscripciones...</div>
  )

  return (
    <div style={{ padding: '24px 0' }}>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 32, flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10,
            padding: '14px 20px', minWidth: 140,
          }}>
            <div style={{ fontFamily: SE, fontSize: 26, color: k.color || C.paper, fontWeight: 700 }}>
              {k.value}
            </div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SN }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.rule}` }}>
              {['Cuenta / Email', 'Locales', 'Estado', '€/mes', 'Próximo cobro', ''].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '8px 12px',
                  color: C.ink3, fontSize: 11, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cuentas.map(c => {
              const badge = BADGE[c.stripe_estado] || BADGE.sin_configurar
              return (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.rule}` }}>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ color: C.paper, fontWeight: 600, fontSize: 14 }}>{c.nombre}</div>
                    <div style={{ color: C.ink3, fontSize: 12 }}>{c.email || '—'}</div>
                  </td>
                  <td style={{ padding: '12px 12px', color: C.ink2, fontSize: 13 }}>
                    {c.restaurantes?.map(r => r.nombre).join(', ') || '—'}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <span style={{
                      background: badge.color + '22', color: badge.color,
                      border: `1px solid ${badge.color}55`,
                      borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 12px', color: C.paper, fontSize: 14, fontWeight: 600 }}>
                    {c.precio_mensual ? `${c.precio_mensual}€` : '—'}
                  </td>
                  <td style={{ padding: '12px 12px', color: C.ink2, fontSize: 13 }}>
                    {c.fecha_proximo_cobro
                      ? new Date(c.fecha_proximo_cobro).toLocaleDateString('es-ES')
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {c.stripe_estado !== 'activa' && c.stripe_estado !== 'cancelando' && c.stripe_estado !== 'cancelada' && (
                        <button onClick={() => abrirModal(c)} style={{
                          background: C.red, color: C.paper, border: 'none',
                          borderRadius: 6, padding: '6px 14px', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', fontFamily: SN,
                        }}>
                          {c.stripe_checkout_url ? 'Ver link' : 'Activar'}
                        </button>
                      )}
                      {c.stripe_checkout_url && c.stripe_estado === 'pendiente_pago' && (
                        <button onClick={() => copiar(c.stripe_checkout_url!, 'link-' + c.id)} style={{
                          background: C.bg3, color: C.ink2, border: `1px solid ${C.rule}`,
                          borderRadius: 6, padding: '6px 12px', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', fontFamily: SN,
                        }}>
                          {copiado === 'link-' + c.id ? '✓' : '📋'}
                        </button>
                      )}
                      {c.stripe_estado === 'activa' && (
                        <button onClick={() => cancelarSuscripcion(c.id, c.nombre)} style={{
                          background: 'transparent', color: C.ink3,
                          border: `1px solid ${C.rule}`,
                          borderRadius: 6, padding: '6px 12px', fontSize: 12,
                          cursor: 'pointer', fontFamily: SN,
                        }}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal activar */}
      {modal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: '#00000090', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={() => { setModal(null); setCheckoutUrl(null) }}
        >
          <div
            style={{
              background: C.bg2, borderRadius: 14, padding: 28,
              width: '100%', maxWidth: 480, border: `1px solid ${C.rule}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: SE, color: C.paper, margin: '0 0 4px', fontSize: 20 }}>
              Activar suscripción
            </h3>
            <p style={{ fontFamily: SN, color: C.ink3, fontSize: 13, margin: '0 0 24px' }}>
              {modal.nombre}
            </p>

            {!checkoutUrl ? (
              <>
                {[
                  { label: 'Email del cliente', key: 'email', placeholder: 'hola@empresa.com' },
                  { label: 'Nombre empresa', key: 'nombre_empresa', placeholder: 'Ovejas Negras SL' },
                  { label: 'Descripción en factura', key: 'descripcion', placeholder: 'ia.rest — Ovejas Negras' },
                  { label: 'Precio mensual (€)', key: 'precio_mensual', placeholder: '259' },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 16 }}>
                    <label style={{
                      display: 'block', fontFamily: SN, fontSize: 11,
                      color: C.ink3, marginBottom: 6, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{f.label}</label>
                    <input
                      value={(form as any)[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{
                        width: '100%', background: C.bg3, border: `1px solid ${C.rule}`,
                        borderRadius: 8, padding: '10px 14px', color: C.paper,
                        fontFamily: SN, fontSize: 14, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                  <button
                    onClick={() => { setModal(null); setCheckoutUrl(null) }}
                    style={{
                      flex: 1, background: C.bg3, color: C.ink2,
                      border: `1px solid ${C.rule}`, borderRadius: 8,
                      padding: '12px', fontFamily: SN, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={generarCheckout}
                    disabled={saving || !form.email || !form.precio_mensual}
                    style={{
                      flex: 2, background: C.red, color: C.paper, border: 'none',
                      borderRadius: 8, padding: '12px', fontFamily: SN,
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Generando...' : 'Generar link de pago'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  background: C.bg3, border: `1px solid ${C.green}44`,
                  borderRadius: 10, padding: 16, marginBottom: 20,
                }}>
                  <div style={{
                    fontFamily: SN, fontSize: 11, color: C.green,
                    marginBottom: 8, fontWeight: 600, textTransform: 'uppercase',
                  }}>
                    Link generado — enviar al cliente
                  </div>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 11, color: C.ink2,
                    wordBreak: 'break-all', lineHeight: 1.6,
                  }}>
                    {checkoutUrl}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <button
                    onClick={() => copiar(checkoutUrl, 'url')}
                    style={{
                      flex: 1,
                      background: copiado === 'url' ? C.green : C.red,
                      color: C.paper, border: 'none', borderRadius: 8,
                      padding: '12px', fontFamily: SN, fontSize: 14,
                      fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s',
                    }}
                  >
                    {copiado === 'url' ? '✓ Copiado' : '📋 Copiar link'}
                  </button>
                  <button
                    onClick={() => copiar(
                      `Hola, aquí tienes el link para activar tu suscripción a ia.rest:\n\n${checkoutUrl}\n\nSolo tienes que introducir los datos de tu tarjeta y quedará configurado el pago mensual automático. Cada mes recibirás la factura por email.\n\nCualquier duda escríbenos a soporte@iarest.es`,
                      'wa'
                    )}
                    style={{
                      flex: 1,
                      background: copiado === 'wa' ? C.green : C.bg3,
                      color: copiado === 'wa' ? C.paper : C.ink2,
                      border: `1px solid ${C.rule}`,
                      borderRadius: 8, padding: '12px', fontFamily: SN,
                      fontSize: 14, cursor: 'pointer', transition: 'background 0.2s',
                    }}
                  >
                    {copiado === 'wa' ? '✓ Copiado' : '📱 Copiar WA'}
                  </button>
                </div>

                <button
                  onClick={() => { setModal(null); setCheckoutUrl(null) }}
                  style={{
                    width: '100%', background: 'transparent', color: C.ink3,
                    border: 'none', fontFamily: SN, fontSize: 13,
                    cursor: 'pointer', padding: '6px',
                  }}
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
