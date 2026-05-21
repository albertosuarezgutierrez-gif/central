'use client'
// PagosProveedorTab — Gestión de pagos a proveedores
// Dos canales: SEPA XML (transferencia bancaria) + Stripe Connect (pago directo)

import React, { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface OrdenPago {
  id: string
  proveedor_nombre: string
  concepto: string
  importe: number
  fecha_vencimiento: string
  estado: string
  metodo: string
  pagado_at?: string | null
  aprobado_at?: string | null
  stripe_transfer_id?: string | null
  sepa_msg_id?: string | null
  notas?: string | null
}

const ESTADO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:     { label: 'Pendiente aprobación', color: C.amber,  bg: '#2A1E00' },
  aprobado:      { label: 'Aprobado',             color: '#60A5FA', bg: '#001A2E' },
  enviado_sepa:  { label: 'SEPA enviado',         color: C.green,  bg: '#0A2614' },
  pagado_stripe: { label: 'Pagado Stripe',        color: C.green,  bg: '#0A2614' },
  pagado_manual: { label: 'Pagado',               color: C.green,  bg: '#0A2614' },
  cancelado:     { label: 'Cancelado',            color: C.ink3,   bg: C.dark2   },
}

export default function PagosProveedorTab({ sh }: { sh: () => Record<string, string> }) {
  const [ordenes, setOrdenes]   = useState<OrdenPago[]>([])
  const [totales, setTotales]   = useState({ pendiente: 0, aprobado: 0, total: 0 })
  const [loading, setLoading]   = useState(true)
  const [filtro,  setFiltro]    = useState<'todos' | 'pendiente' | 'aprobado' | 'pagado'>('todos')
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [exportando, setExportando] = useState(false)
  const [aprobando, setAprobando]   = useState<string | null>(null)
  const [toast,    setToast]    = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = async () => {
    setLoading(true)
    const url = filtro === 'todos' ? '/api/owner/pagos' :
      filtro === 'pagado' ? '/api/owner/pagos?estado=pagado_stripe&estado=enviado_sepa&estado=pagado_manual' :
      `/api/owner/pagos?estado=${filtro}`
    const r = await fetch(url, { headers: sh() })
    const d = await r.json()
    setOrdenes(d.ordenes ?? [])
    setTotales(d.totales ?? { pendiente: 0, aprobado: 0, total: 0 })
    setLoading(false)
  }

  useEffect(() => { load() }, [filtro])

  const aprobar = async (id: string) => {
    setAprobando(id)
    await fetch('/api/owner/pagos', {
      method: 'PATCH', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion: 'aprobar' })
    })
    await load()
    setAprobando(null)
    showToast('✅ Orden aprobada')
  }

  const cancelar = async (id: string) => {
    if (!confirm('¿Cancelar esta orden de pago?')) return
    await fetch('/api/owner/pagos', {
      method: 'PATCH', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion: 'cancelar' })
    })
    await load()
  }

  const exportarSEPA = async () => {
    const aprobadas = seleccionados.length > 0
      ? seleccionados
      : ordenes.filter(o => o.estado === 'aprobado' && o.metodo === 'sepa').map(o => o.id)
    if (!aprobadas.length) { showToast('No hay órdenes aprobadas SEPA para exportar'); return }
    setExportando(true)
    try {
      const r = await fetch('/api/owner/pagos/sepa', {
        method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden_ids: aprobadas })
      })
      if (!r.ok) {
        const d = await r.json(); showToast('Error: ' + d.error); return
      }
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `sepa-pagos-${new Date().toISOString().slice(0, 10)}.xml`
      a.click()
      URL.revokeObjectURL(url)
      const n = r.headers.get('X-SEPA-Pagos') ?? '?'
      const t = r.headers.get('X-SEPA-Total') ?? '?'
      showToast(`✅ SEPA generado — ${n} pago${Number(n) > 1 ? 's' : ''} · ${t} €`)
      setSeleccionados([])
      await load()
    } finally { setExportando(false) }
  }

  const pagarStripe = async (orden: OrdenPago) => {
    if (!confirm(`¿Pagar ${orden.importe.toFixed(2)} € a ${orden.proveedor_nombre} via Stripe ahora?`)) return
    const r = await fetch('/api/owner/proveedores/stripe-onboard', {
      method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor_id: '---', accion: 'pagar', orden_id: orden.id })
    })
    const d = await r.json()
    if (!d.ok) { showToast('Error Stripe: ' + d.error); return }
    showToast(`✅ Pagado ${d.importe} € a ${d.proveedor} via Stripe`)
    await load()
  }

  const fmt = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const fmtFecha = (s: string) => new Date(s).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
  const isVencida = (s: string) => new Date(s) < new Date()

  const ordenesFiltradas = filtro === 'pagado'
    ? ordenes.filter(o => ['enviado_sepa', 'pagado_stripe', 'pagado_manual'].includes(o.estado))
    : ordenes

  return (
    <div style={{ padding: '18px 20px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, marginBottom: 3 }}>Pagos a proveedores</div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
            SEPA XML (sube al banco · sin coste) · Stripe Connect (pago directo)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportarSEPA} disabled={exportando}
            style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, padding: '8px 14px', background: exportando ? C.rule : C.ink, color: C.paper, border: 'none', borderRadius: 8, cursor: exportando ? 'default' : 'pointer' }}>
            {exportando ? '⏳ Generando…' : '📄 Exportar SEPA'}
          </button>
        </div>
      </div>

      {/* Totales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Pendiente aprobación', valor: totales.pendiente, color: C.amber },
          { label: 'Aprobado (listo para pagar)', valor: totales.aprobado, color: '#60A5FA' },
          { label: 'Total en cola', valor: totales.total, color: C.ink },
        ].map(({ label, valor, color }) => (
          <div key={label} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color }}>{fmt(valor)}</div>
          </div>
        ))}
      </div>

      {/* Aviso SEPA */}
      <div style={{ background: '#EEF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontFamily: SN, fontSize: 12, color: '#1E40AF' }}>
        <strong>Canal SEPA:</strong> exporta el fichero XML → súbelo al portal de tu banco (BBVA, CaixaBank, Santander…) → el banco ejecuta las transferencias en la fecha indicada. Sin intermediarios, sin comisión. Los proveedores reciben en su IBAN habitual.
        <br /><strong>Canal Stripe:</strong> pago instantáneo a proveedores que tengan cuenta Stripe Connect activa. Coste: 0,25% + 0,10 €/transferencia.
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['todos', 'pendiente', 'aprobado', 'pagado'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            fontFamily: SN, fontSize: 12, padding: '5px 12px', borderRadius: 20,
            background: filtro === f ? C.ink : 'transparent',
            color: filtro === f ? C.paper : C.ink3,
            border: `1px solid ${filtro === f ? C.ink : C.rule}`,
            cursor: 'pointer',
          }}>
            {f === 'todos' ? 'Todos' : f === 'pendiente' ? 'Pendientes' : f === 'aprobado' ? 'Aprobados' : 'Pagados'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading && <div style={{ padding: 32, textAlign: 'center', fontFamily: SE, fontStyle: 'italic', color: C.ink3 }}>Cargando…</div>}
      {!loading && ordenesFiltradas.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: SN, fontSize: 13, color: C.ink3 }}>
          No hay órdenes de pago {filtro !== 'todos' ? `en estado "${filtro}"` : ''}.
          <div style={{ marginTop: 8, fontSize: 11, color: C.ink4 }}>
            Las órdenes se crean automáticamente al confirmar una recepción sin incidencias.
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ordenesFiltradas.map(o => {
          const est = ESTADO_LABEL[o.estado] ?? { label: o.estado, color: C.ink3, bg: C.dark2 }
          const vencida = ['pendiente', 'aprobado'].includes(o.estado) && isVencida(o.fecha_vencimiento)
          const selected = seleccionados.includes(o.id)
          return (
            <div key={o.id} style={{
              padding: '13px 16px', borderRadius: 10, background: C.bone,
              border: `1.5px solid ${selected ? C.ink : vencida ? C.verm + '77' : C.rule}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Checkbox selección SEPA */}
                {o.estado === 'aprobado' && o.metodo === 'sepa' && (
                  <input type="checkbox" checked={selected}
                    onChange={e => setSeleccionados(s => e.target.checked ? [...s, o.id] : s.filter(x => x !== o.id))}
                    style={{ marginTop: 3, accentColor: C.ink }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink }}>{o.proveedor_nombre}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: est.bg, color: est.color, fontFamily: SM }}>{est.label}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: C.paper2, color: C.ink3, fontFamily: SM }}>
                      {o.metodo === 'sepa' ? '🏦 SEPA' : '⚡ Stripe'}
                    </span>
                    {vencida && <span style={{ fontSize: 10, color: C.verm, fontFamily: SM }}>⚠️ Vencida</span>}
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 2 }}>{o.concepto}</div>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
                    Vencimiento: {fmtFecha(o.fecha_vencimiento)}
                    {o.pagado_at && ` · Pagado: ${fmtFecha(o.pagado_at)}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink, marginBottom: 6 }}>
                    {fmt(Number(o.importe))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {o.estado === 'pendiente' && (
                      <>
                        <button onClick={() => aprobar(o.id)} disabled={aprobando === o.id}
                          style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, padding: '4px 10px', background: C.green, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                          {aprobando === o.id ? '…' : '✓ Aprobar'}
                        </button>
                        <button onClick={() => cancelar(o.id)}
                          style={{ fontFamily: SN, fontSize: 11, padding: '4px 10px', background: 'none', color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 6, cursor: 'pointer' }}>
                          Cancelar
                        </button>
                      </>
                    )}
                    {o.estado === 'aprobado' && o.metodo === 'stripe' && (
                      <button onClick={() => pagarStripe(o)}
                        style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, padding: '4px 10px', background: '#635BFF', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        ⚡ Pagar ahora
                      </button>
                    )}
                    {o.estado === 'aprobado' && o.metodo === 'sepa' && (
                      <span style={{ fontFamily: SM, fontSize: 10, color: '#60A5FA', padding: '4px 0' }}>
                        Incluir en SEPA →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Info canales */}
      {!loading && ordenesFiltradas.length > 0 && (
        <div style={{ marginTop: 20, padding: '12px 14px', background: C.paper2, borderRadius: 8, fontFamily: SN, fontSize: 11, color: C.ink3 }}>
          <strong>SEPA:</strong> selecciona las órdenes aprobadas con checkbox y pulsa "Exportar SEPA" para generar el XML. Sin selección → exporta todas las aprobadas SEPA.
          <br /><strong>Stripe:</strong> pulsa "Pagar ahora" en cada orden. El proveedor debe tener onboarding completado (<em>/owner → Proveedores → Stripe</em>).
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.ink, color: C.paper, fontFamily: SN, fontSize: 13, padding: '10px 20px', borderRadius: 20, zIndex: 999 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
