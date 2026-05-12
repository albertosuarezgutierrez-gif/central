'use client'
// QRTab — Configuración del módulo QR mesa digital
// Tab dentro de /owner para activar QR por mesa, modo pago y precio fijo por persona

import { useState, useEffect } from 'react'
import { createServerClient } from '@/lib/supabase'

interface Mesa {
  id: string
  codigo: string
  nombre: string | null
  zona: string
  qr_habilitado: boolean
  qr_modo_pago: 'solo_pedido' | 'opcional' | 'obligatorio'
  qr_precio_fijo_persona: number | null
  qr_precio_fijo_concepto: string | null
  qr_token: string | null
}

interface Props {
  restauranteId: string
  stripeHeaders: () => Record<string, string>
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

export default function QRTab({ restauranteId, stripeHeaders }: Props) {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [conectado, setConectado] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editPrecio, setEditPrecio] = useState<Record<string, string>>({})
  const [editConcepto, setEditConcepto] = useState<Record<string, string>>({})
  const [copiado, setCopiado] = useState<string | null>(null)

  const copiarUrl = async (mesaId: string, token: string) => {
    const url = `https://www.iarest.es/q/${token}`
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        // Fallback para contextos sin clipboard API
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopiado(mesaId)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      // Si todo falla, mostrar la URL en un alert como último recurso
      window.prompt('Copia esta URL:', url)
    }
  }

  const sh = stripeHeaders

  useEffect(() => {
    Promise.all([
      fetch('/api/owner/mesas', { headers: sh() }).then(r => r.json()),
      fetch('/api/qr/connect/status', { headers: sh() }).then(r => r.json()),
    ]).then(([mesasData, connectData]) => {
      setMesas(mesasData.mesas || [])
      setConectado(connectData.conectado || false)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const updateMesa = async (id: string, patch: Partial<Mesa>) => {
    setSaving(id)
    await fetch('/api/owner/mesas', {
      method: 'PATCH',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    setMesas(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    setSaving(null)
  }

  const conectarStripe = async () => {
    const res = await fetch('/api/qr/connect/link', { method: 'POST', headers: sh() })
    const { url } = await res.json()
    if (url) window.location.href = url
  }

  const nActivas = mesas.filter(m => m.qr_habilitado).length
  const costeTotal = nActivas * 12

  if (loading) return <div style={{ padding: 32, color: '#8C7B69' }}>Cargando...</div>

  return (
    <div style={{ maxWidth: 680 }}>

      {/* ── STRIPE CONNECT ── */}
      {!conectado ? (
        <div style={{ background: '#1E1A15', borderRadius: 14, padding: '20px 22px', border: '1px solid #2E2720', marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#F6F1E7', marginBottom: 6 }}>Activar pagos QR</div>
          <div style={{ fontSize: 13, color: '#8C7B69', marginBottom: 16, lineHeight: 1.6 }}>
            Conecta tu cuenta bancaria para recibir los pagos de tus clientes directamente.
            Los cobros van a tu cuenta. ia.rest recibe un 0,5% automático.
          </div>
          <button onClick={conectarStripe} style={{ padding: '11px 20px', background: '#D9442B', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Conectar cuenta bancaria →
          </button>
        </div>
      ) : (
        <div style={{ background: '#1E3320', borderRadius: 14, padding: '14px 18px', border: '1px solid #2E4830', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: '#3F7D44', fontSize: 18 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F6F1E7' }}>Cuenta bancaria conectada</div>
              <div style={{ fontSize: 11, color: '#8C7B69', marginTop: 1 }}>Los cobros QR llegan directamente a tu banco</div>
            </div>
          </div>
          <button onClick={conectarStripe} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #2E4830', borderRadius: 8, color: '#8C7B69', fontSize: 12, cursor: 'pointer' }}>
            Ver panel Stripe
          </button>
        </div>
      )}

      {/* ── RESUMEN COSTE ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#F6F1E7' }}>Mesas QR</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 15, color: '#E8A33B' }}>{costeTotal},00 €/mes</div>
          <div style={{ fontSize: 11, color: '#8C7B69' }}>{nActivas} mesa{nActivas !== 1 ? 's' : ''} activa{nActivas !== 1 ? 's' : ''} × 12 €</div>
        </div>
      </div>

      {/* ── LISTA MESAS ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mesas.map(mesa => {
          const on = mesa.qr_habilitado
          const isSaving = saving === mesa.id
          const precioEdit = editPrecio[mesa.id] ?? (mesa.qr_precio_fijo_persona?.toString() || '')
          const conceptoEdit = editConcepto[mesa.id] ?? (mesa.qr_precio_fijo_concepto || 'Cubierto')

          return (
            <div key={mesa.id} style={{ background: '#1E1A15', borderRadius: 14, padding: '16px 18px', border: `1px solid ${on ? '#3F7D4440' : '#2E2720'}` }}>
              {/* Fila header mesa */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: on ? 14 : 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 15, color: '#F6F1E7', fontWeight: 600 }}>{mesa.codigo}</span>
                  {on && <span style={{ fontSize: 10, padding: '2px 7px', background: '#3F7D4420', border: '1px solid #3F7D4440', borderRadius: 20, color: '#3F7D44' }}>QR ACTIVO · 12 €/mes</span>}
                </div>
                <div
                  onClick={() => !isSaving && updateMesa(mesa.id, { qr_habilitado: !on })}
                  style={{ width: 42, height: 24, borderRadius: 12, background: on ? '#D9442B' : '#2A221A', cursor: isSaving ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: isSaving ? 0.6 : 1, flexShrink: 0 }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>

              {on && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Modo pago */}
                  <div>
                    <div style={{ fontSize: 11, color: '#8C7B69', marginBottom: 7, fontFamily: 'monospace', letterSpacing: '0.05em' }}>MODO PAGO</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {([['solo_pedido', 'Solo pedido'], ['opcional', 'Pago opcional'], ['obligatorio', 'Pago obligatorio']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => updateMesa(mesa.id, { qr_modo_pago: v })} style={{ flex: 1, padding: '7px 0', background: mesa.qr_modo_pago === v ? '#2A221A' : 'transparent', border: `1px solid ${mesa.qr_modo_pago === v ? '#2E2720' : '#2E272066'}`, borderRadius: 8, color: mesa.qr_modo_pago === v ? '#F6F1E7' : '#8C7B69', fontSize: 11, cursor: 'pointer' }}>{l}</button>
                      ))}
                    </div>
                  </div>

                  {/* Precio fijo por persona */}
                  <div>
                    <div style={{ fontSize: 11, color: '#8C7B69', marginBottom: 7, fontFamily: 'monospace', letterSpacing: '0.05em' }}>PRECIO FIJO POR PERSONA</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={conceptoEdit}
                        onChange={e => setEditConcepto(p => ({ ...p, [mesa.id]: e.target.value }))}
                        onBlur={() => updateMesa(mesa.id, { qr_precio_fijo_concepto: conceptoEdit || 'Cubierto' })}
                        placeholder="Concepto (ej: Cubierto)"
                        style={{ flex: 2, padding: '8px 12px', background: '#14110E', border: '1px solid #2E2720', borderRadius: 9, color: '#F6F1E7', fontSize: 13, outline: 'none' }}
                      />
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input
                          type="number"
                          value={precioEdit}
                          onChange={e => setEditPrecio(p => ({ ...p, [mesa.id]: e.target.value }))}
                          onBlur={() => {
                            const v = parseFloat(precioEdit) || null
                            updateMesa(mesa.id, { qr_precio_fijo_persona: v })
                          }}
                          placeholder="0,00"
                          min="0"
                          step="0.50"
                          style={{ width: '100%', padding: '8px 30px 8px 12px', background: '#14110E', border: '1px solid #2E2720', borderRadius: 9, color: '#F6F1E7', fontSize: 13, outline: 'none' }}
                        />
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#8C7B69' }}>€</span>
                      </div>
                    </div>
                    {mesa.qr_precio_fijo_persona && (
                      <div style={{ fontSize: 11, color: '#E8A33B', marginTop: 6 }}>
                        Al cliente se le preguntará cuántas personas son · Se suma a la cuenta automáticamente
                      </div>
                    )}
                    {!mesa.qr_precio_fijo_persona && (
                      <div style={{ fontSize: 11, color: '#8C7B69', marginTop: 5 }}>Deja vacío si no hay precio por persona</div>
                    )}
                  </div>

                  {/* QR link */}
                  {mesa.qr_token && (
                    <div style={{ background: '#14110E', borderRadius: 9, padding: '10px 14px', border: '1px solid #2E2720', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#8C7B69' }}>/q/{mesa.qr_token.slice(0, 12)}...</span>
                      <button
                        onClick={() => copiarUrl(mesa.id, mesa.qr_token!)}
                        style={{
                          padding: '4px 10px',
                          background: copiado === mesa.id ? '#3F7D44' : 'transparent',
                          border: `1px solid ${copiado === mesa.id ? '#3F7D44' : '#2E2720'}`,
                          borderRadius: 6,
                          color: copiado === mesa.id ? '#F6F1E7' : '#8C7B69',
                          fontSize: 11,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        {copiado === mesa.id ? '¡Copiado!' : 'Copiar URL'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
