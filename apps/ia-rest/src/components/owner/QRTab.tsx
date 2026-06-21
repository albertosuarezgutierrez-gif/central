'use client'
// QRTab — Configuracion del modulo QR mesa digital
// Tab dentro de /owner para activar QR por mesa, modo pago y precio fijo por persona

import { useState, useEffect } from 'react'
import { C, SN, SM } from '@/lib/colors'

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

export default function QRTab({ restauranteId, stripeHeaders }: Props) {
  const [mesas,        setMesas]        = useState<Mesa[]>([])
  const [conectado,    setConectado]    = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState<string | null>(null)
  const [editPrecio,   setEditPrecio]   = useState<Record<string, string>>({})
  const [editConcepto, setEditConcepto] = useState<Record<string, string>>({})
  const [copiado,      setCopiado]      = useState<string | null>(null)

  const copiarUrl = async (mesaId: string, token: string) => {
    const url = `https://www.iarest.es/q/${token}`
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
      }
      setCopiado(mesaId)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
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

  const nActivas   = mesas.filter(m => m.qr_habilitado).length
  const costeTotal = nActivas * 12

  if (loading) return <div style={{ padding: 32, fontFamily: SN, color: C.ink4 }}>Cargando...</div>

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Stripe Connect */}
      {!conectado ? (
        <div style={{ background: C.paper2, borderRadius: 14, padding: '20px 22px', border: `1px solid ${C.rule}`, marginBottom: 24 }}>
          <div style={{ fontFamily: SN, fontSize: 16, fontWeight: 600, color: C.ink, marginBottom: 6 }}>Activar pagos QR</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 16, lineHeight: 1.6 }}>
            Conecta tu cuenta bancaria para recibir los pagos de tus clientes directamente.
            Los cobros van a tu cuenta. ia.rest recibe un 0,5% automatico.
          </div>
          <button onClick={conectarStripe} style={{ padding: '11px 20px', background: C.red, border: 'none', borderRadius: 10, color: 'white', fontFamily: SN, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Conectar cuenta bancaria &rarr;
          </button>
        </div>
      ) : (
        <div style={{ background: C.greenS, borderRadius: 14, padding: '14px 18px', border: `1px solid ${C.green}44`, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: C.green, fontSize: 18 }}>&#10003;</span>
            <div>
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>Cuenta bancaria conectada</div>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 1 }}>Los cobros QR llegan directamente a tu banco</div>
            </div>
          </div>
          <button onClick={conectarStripe} style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${C.green}44`, borderRadius: 8, fontFamily: SN, color: C.ink3, fontSize: 12, cursor: 'pointer' }}>
            Ver panel Stripe
          </button>
        </div>
      )}

      {/* Resumen coste */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: SN, fontSize: 18, fontWeight: 600, color: C.ink }}>Mesas QR</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SM, fontSize: 15, color: C.amber }}>{costeTotal},00 &euro;/mes</div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>{nActivas} mesa{nActivas !== 1 ? 's' : ''} activa{nActivas !== 1 ? 's' : ''} &times; 12 &euro;</div>
        </div>
      </div>

      {/* Lista mesas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mesas.map(mesa => {
          const on          = mesa.qr_habilitado
          const isSaving    = saving === mesa.id
          const precioEdit  = editPrecio[mesa.id] ?? (mesa.qr_precio_fijo_persona?.toString() || '')
          const conceptoEdit = editConcepto[mesa.id] ?? (mesa.qr_precio_fijo_concepto || 'Cubierto')

          return (
            <div key={mesa.id} style={{
              background: C.card,
              borderRadius: 14,
              padding: '16px 18px',
              border: `1px solid ${on ? C.green + '44' : C.rule}`,
            }}>
              {/* Header mesa */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: on ? 14 : 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: SM, fontSize: 15, color: C.ink, fontWeight: 600 }}>{mesa.codigo}</span>
                  {on && (
                    <span style={{ fontFamily: SM, fontSize: 10, padding: '2px 7px', background: C.green + '18', border: `1px solid ${C.green}44`, borderRadius: 20, color: C.green }}>
                      QR ACTIVO &middot; 12 &euro;/mes
                    </span>
                  )}
                </div>
                <div
                  onClick={() => !isSaving && updateMesa(mesa.id, { qr_habilitado: !on })}
                  style={{ width: 42, height: 24, borderRadius: 12, background: on ? C.red : C.paper3, cursor: isSaving ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background .2s', opacity: isSaving ? 0.6 : 1, flexShrink: 0 }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                </div>
              </div>

              {on && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Modo pago */}
                  <div>
                    <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink4, marginBottom: 7 }}>Modo pago</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {([['solo_pedido', 'Solo pedido'], ['opcional', 'Pago opcional'], ['obligatorio', 'Pago obligatorio']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => updateMesa(mesa.id, { qr_modo_pago: v })} style={{
                          flex: 1, padding: '7px 0',
                          background: mesa.qr_modo_pago === v ? C.red + '12' : 'transparent',
                          border: `1px solid ${mesa.qr_modo_pago === v ? C.red + '55' : C.rule}`,
                          borderRadius: 8,
                          color: mesa.qr_modo_pago === v ? C.red : C.ink3,
                          fontFamily: SN, fontSize: 11, fontWeight: mesa.qr_modo_pago === v ? 600 : 400,
                          cursor: 'pointer',
                        }}>{l}</button>
                      ))}
                    </div>
                  </div>

                  {/* Precio fijo por persona */}
                  <div>
                    <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink4, marginBottom: 7 }}>Precio fijo por persona</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={conceptoEdit}
                        onChange={e => setEditConcepto(p => ({ ...p, [mesa.id]: e.target.value }))}
                        onBlur={() => updateMesa(mesa.id, { qr_precio_fijo_concepto: conceptoEdit || 'Cubierto' })}
                        placeholder="Concepto (ej: Cubierto)"
                        style={{ flex: 2, padding: '8px 12px', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 9, fontFamily: SN, color: C.ink, fontSize: 13, outline: 'none' }}
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
                          min="0" step="0.50"
                          style={{ width: '100%', padding: '8px 30px 8px 12px', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 9, fontFamily: SN, color: C.ink, fontSize: 13, outline: 'none' }}
                        />
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.ink4 }}>&euro;</span>
                      </div>
                    </div>
                    {mesa.qr_precio_fijo_persona ? (
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.amber, marginTop: 6 }}>
                        Al cliente se le preguntara cuantas personas son &middot; Se suma a la cuenta automaticamente
                      </div>
                    ) : (
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 5 }}>Deja vacio si no hay precio por persona</div>
                    )}
                  </div>

                  {/* QR link */}
                  {mesa.qr_token && (
                    <div style={{ background: C.paper2, borderRadius: 9, padding: '10px 14px', border: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>/q/{mesa.qr_token.slice(0, 12)}...</span>
                      <button
                        onClick={() => copiarUrl(mesa.id, mesa.qr_token!)}
                        style={{
                          padding: '4px 10px',
                          background: copiado === mesa.id ? C.green + '18' : 'transparent',
                          border: `1px solid ${copiado === mesa.id ? C.green + '55' : C.rule}`,
                          borderRadius: 6,
                          fontFamily: SN,
                          color: copiado === mesa.id ? C.green : C.ink3,
                          fontSize: 11, cursor: 'pointer', transition: 'all .2s',
                        }}
                      >
                        {copiado === mesa.id ? '\u00a1Copiado!' : 'Copiar URL'}
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
