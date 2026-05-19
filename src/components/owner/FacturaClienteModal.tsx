'use client'
// ia.rest · FacturaClienteModal v2
// Emite factura completa (serie F) con datos fiscales del cliente
// Autocomplete en tiempo real por NIF o nombre — guarda cliente para reutilizar

import React, { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  bg: '#1C1815', bg1: '#242018', bg2: '#2C2820',
  ink: '#F6F1E7', ink2: '#D8CDB6', ink3: '#9A8D7C', ink4: '#6B5F52',
  rule: '#3A332C',
  verm: '#D9442B', vermD: '#A8311E', vermS: '#4A1E16',
  amb: '#E8A33B', ambS: '#3A2A0E',
  gr: '#3F7D44', grS: '#1A2E1C',
  blue: '#2B6A9E', blueS: '#0E2A40',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SE = "'Newsreader',Georgia,serif"

interface ClienteFiscal {
  id?: string
  nif: string
  razon_social: string
  direccion: string
  email: string
}

interface ClienteSugerido {
  id: string
  nif: string
  razon_social: string
  direccion?: string
  email?: string
}

interface FacturaCliente {
  id: string
  numero_completo: string
  total: number
  cliente_nif: string
  cliente_razon_social: string
}

interface Props {
  comandaId: string
  mesaLabel: string
  total: number
  session: { id: string; nombre: string; rol: string }
  onClose: () => void
  onEmitida: (factura: FacturaCliente) => void
}

const MOTIVOS = [
  'Gasto representación',
  'Comida de trabajo',
  'Comercial empresa',
  'Formación y reuniones',
  'Otro',
]

export default function FacturaClienteModal({
  comandaId, mesaLabel, total, session, onClose, onEmitida,
}: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<ClienteSugerido[]>([])
  const [showSugerencias, setShowSugerencias] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [cliente, setCliente] = useState<ClienteFiscal>({
    nif: '', razon_social: '', direccion: '', email: '',
  })
  const [clienteSeleccionado, setClienteSeleccionado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emitida, setEmitida] = useState<FacturaCliente | null>(null)
  const [facturaExistente, setFacturaExistente] = useState<FacturaCliente | null>(null)
  const [checkingExistente, setCheckingExistente] = useState(true)

  const busquedaRef = useRef<HTMLInputElement>(null)
  const sugerenciasRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/factura/cliente?comanda_id=${comandaId}`)
      .then(r => r.json())
      .then(d => { if (d.factura) setFacturaExistente(d.factura) })
      .catch(() => null)
      .finally(() => setCheckingExistente(false))
  }, [comandaId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        sugerenciasRef.current && !sugerenciasRef.current.contains(e.target as Node) &&
        busquedaRef.current && !busquedaRef.current.contains(e.target as Node)
      ) setShowSugerencias(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleBusquedaChange = useCallback((val: string) => {
    setBusqueda(val)
    setClienteSeleccionado(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 2) { setSugerencias([]); setShowSugerencias(false); return }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const esNif = /^[A-Z0-9]{3,}$/i.test(val.trim()) && !/\s/.test(val.trim())
        const url = esNif
          ? `/api/clientes-fiscales?nif=${encodeURIComponent(val.trim())}`
          : `/api/clientes-fiscales?q=${encodeURIComponent(val.trim())}`
        const r = await fetch(url)
        const d = await r.json()
        const lista = d.clientes ?? []
        setSugerencias(lista)
        setShowSugerencias(lista.length > 0)
      } finally { setBuscando(false) }
    }, 250)
  }, [])

  const seleccionarCliente = useCallback((c: ClienteSugerido) => {
    setCliente({ id: c.id, nif: c.nif, razon_social: c.razon_social, direccion: c.direccion ?? '', email: c.email ?? '' })
    setClienteSeleccionado(true)
    setShowSugerencias(false)
    setBusqueda('')
  }, [])

  const limpiarSeleccion = useCallback(() => {
    setBusqueda('')
    setCliente({ nif: '', razon_social: '', direccion: '', email: '' })
    setClienteSeleccionado(false)
    setSugerencias([])
    setTimeout(() => busquedaRef.current?.focus(), 50)
  }, [])

  const base  = Math.round(total / 1.10 * 100) / 100
  const cuota = Math.round((total - base) * 100) / 100

  const handleEmitir = useCallback(async () => {
    setLoading(true); setError(null)
    if (!cliente.nif.trim() || !cliente.razon_social.trim()) {
      setError('NIF y razón social son obligatorios'); setLoading(false); return
    }
    try {
      const r = await fetch('/api/factura/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comanda_id: comandaId,
          cliente: { nif: cliente.nif.trim().toUpperCase(), razon_social: cliente.razon_social.trim(), direccion: cliente.direccion.trim() || undefined, email: cliente.email.trim() || undefined },
          motivo: motivo || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Error al emitir factura'); return }
      setEmitida(d.factura); onEmitida(d.factura)
    } catch { setError('Error de red') }
    finally { setLoading(false) }
  }, [cliente, motivo, comandaId, onEmitida])

  const inputSt = (v: boolean): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box',
    background: v ? C.bg2 : C.bg1,
    border: `1px solid ${v ? '#5A4A3A' : C.rule}`,
    borderRadius: 8, padding: '9px 12px',
    fontFamily: SN, fontSize: 14, color: C.ink, outline: 'none',
  })
  const lbSt: React.CSSProperties = { fontFamily: SN, fontSize: 11, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5, display: 'block' }

  if (checkingExistente) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(10,8,6,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.bg, borderRadius: 20, padding: 32, color: C.ink3, fontFamily: SN }}>Verificando…</div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(10,8,6,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: C.bg, borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `1px solid ${C.rule}` }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: SE, fontSize: 20, color: C.ink, fontWeight: 600 }}>Emitir factura</div>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginTop: 2 }}>{mesaLabel} · Total {total.toFixed(2)}€</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ overflow: 'auto', padding: '20px 24px', flex: 1 }}>

          {/* Factura existente */}
          {facturaExistente && !emitida && (
            <div style={{ background: C.blueS, border: `1px solid ${C.blue}`, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 600, marginBottom: 4 }}>Ya existe la factura {facturaExistente.numero_completo}</div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{facturaExistente.cliente_razon_social} · {facturaExistente.cliente_nif} · {facturaExistente.total?.toFixed(2)}€</div>
              <button onClick={() => onEmitida(facturaExistente)} style={{ marginTop: 10, background: C.blue, border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: SN, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
                Ver factura existente
              </button>
            </div>
          )}

          {/* Éxito */}
          {emitida && (
            <div style={{ background: C.grS, border: `1px solid ${C.gr}`, borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ fontFamily: SE, fontSize: 18, color: C.ink, marginBottom: 4 }}>{emitida.numero_completo}</div>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>{emitida.cliente_razon_social} · {emitida.total?.toFixed(2)}€</div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.gr, marginTop: 8 }}>Datos guardados — la próxima vez aparecerá al buscar</div>
            </div>
          )}

          {/* Formulario */}
          {!emitida && (
            <>
              {/* Desglose IVA */}
              <div style={{ background: C.bg1, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
                {[['Base imponible', `${base.toFixed(2)}€`], ['IVA 10%', `${cuota.toFixed(2)}€`], ['Total', `${total.toFixed(2)}€`]].map(([l, v]) => (
                  <div key={l} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{l}</div>
                    <div style={{ fontFamily: SM, fontSize: 14, color: C.ink, fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Buscador */}
              <div style={{ marginBottom: 16, position: 'relative' }}>
                <label style={lbSt}>Buscar cliente por NIF, CIF o nombre</label>
                {clienteSeleccionado ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.bg2, border: `1px solid ${C.gr}`, borderRadius: 8, padding: '9px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SN, fontSize: 14, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cliente.razon_social}</div>
                      <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{cliente.nif}</div>
                    </div>
                    <button onClick={limpiarSeleccion} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, fontSize: 18, padding: '0 2px' }}>×</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={busquedaRef}
                      type="text"
                      placeholder="B12345678 · Empresa SL · García Juan…"
                      value={busqueda}
                      onChange={e => handleBusquedaChange(e.target.value)}
                      onFocus={() => sugerencias.length > 0 && setShowSugerencias(true)}
                      style={{ ...inputSt(!!busqueda), paddingRight: buscando ? 36 : 12 }}
                      autoFocus
                    />
                    {buscando && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: SN, fontSize: 11, color: C.ink3 }}>buscando…</span>}
                    {/* Dropdown */}
                    {showSugerencias && (
                      <div ref={sugerenciasRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                        {sugerencias.map((c, i) => (
                          <button key={c.id} onClick={() => seleccionarCliente(c)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'none', border: 'none', borderBottom: i < sugerencias.length - 1 ? `1px solid ${C.rule}` : 'none', cursor: 'pointer', textAlign: 'left' }}
                            onMouseOver={e => (e.currentTarget.style.background = C.bg2)}
                            onMouseOut={e => (e.currentTarget.style.background = 'none')}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: C.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontFamily: SM, fontSize: 9, color: C.ink3 }}>{/^[A-Z]/.test(c.nif) ? 'EMP' : 'PER'}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.razon_social}</div>
                              <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{c.nif}{c.direccion ? ` · ${c.direccion.slice(0, 28)}` : ''}</div>
                            </div>
                            <span style={{ fontFamily: SN, fontSize: 11, color: C.gr, flexShrink: 0 }}>usar →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {busqueda.length >= 2 && !buscando && sugerencias.length === 0 && !clienteSeleccionado && (
                  <div style={{ marginTop: 6, fontFamily: SN, fontSize: 12, color: C.amb }}>Cliente nuevo — rellena NIF y nombre abajo</div>
                )}
              </div>

              {/* Campos */}
              <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbSt}>NIF / CIF *</label>
                  <input type="text" placeholder="B12345678 / 12345678A" value={cliente.nif}
                    onChange={e => setCliente(p => ({ ...p, nif: e.target.value.toUpperCase() }))} style={inputSt(!!cliente.nif)} />
                </div>
                <div>
                  <label style={lbSt}>Razón social *</label>
                  <input type="text" placeholder="Empresa S.L. / Autónomo García" value={cliente.razon_social}
                    onChange={e => setCliente(p => ({ ...p, razon_social: e.target.value }))} style={inputSt(!!cliente.razon_social)} />
                </div>
                <div>
                  <label style={lbSt}>Dirección fiscal (opcional)</label>
                  <input type="text" placeholder="Calle Mayor 1, 28001 Madrid" value={cliente.direccion}
                    onChange={e => setCliente(p => ({ ...p, direccion: e.target.value }))} style={inputSt(!!cliente.direccion)} />
                </div>
                <div>
                  <label style={lbSt}>Email (opcional)</label>
                  <input type="email" placeholder="contabilidad@empresa.com" value={cliente.email}
                    onChange={e => setCliente(p => ({ ...p, email: e.target.value }))} style={inputSt(!!cliente.email)} />
                </div>
              </div>

              {/* Motivo */}
              <div style={{ marginBottom: 8 }}>
                <label style={lbSt}>Motivo (opcional)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {MOTIVOS.map(m => (
                    <button key={m} onClick={() => setMotivo(m === motivo ? '' : m)}
                      style={{ background: motivo === m ? C.verm : C.bg2, border: `1px solid ${motivo === m ? C.verm : C.rule}`, borderRadius: 20, padding: '5px 12px', fontFamily: SN, fontSize: 12, color: C.ink, cursor: 'pointer' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: C.ambS, border: `1px solid ${C.amb}33`, borderRadius: 8, padding: '8px 12px', marginTop: 12 }}>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.amb, lineHeight: 1.5 }}>
                  Factura con IVA deducible. Los datos del cliente se guardan para próximas visitas.
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!emitida && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, background: C.bg1, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 16px', fontFamily: SN, fontSize: 14, color: C.ink2, cursor: 'pointer' }}>
              Cancelar
            </button>
            {!facturaExistente && (
              <button onClick={handleEmitir} disabled={loading || !cliente.nif || !cliente.razon_social}
                style={{ flex: 2, background: loading ? C.bg2 : (!cliente.nif || !cliente.razon_social) ? C.bg2 : C.verm, border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: SN, fontSize: 14, fontWeight: 700, color: (!cliente.nif || !cliente.razon_social) ? C.ink3 : C.ink, cursor: (!cliente.nif || !cliente.razon_social || loading) ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Emitiendo…' : 'Emitir factura'}
              </button>
            )}
          </div>
        )}

        {emitida && (
          <div style={{ padding: '12px 24px 20px' }}>
            <button onClick={onClose} style={{ width: '100%', background: C.gr, border: 'none', borderRadius: 10, padding: '12px 16px', fontFamily: SN, fontSize: 14, fontWeight: 700, color: C.ink, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        )}

        {error && <div style={{ padding: '0 24px 16px', fontFamily: SN, fontSize: 13, color: C.verm, textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  )
}
