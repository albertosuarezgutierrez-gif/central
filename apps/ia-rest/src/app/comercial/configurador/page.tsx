'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const C = {
  dark: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  paper: '#F6F1E7', ink2: '#D8CDB6', ink3: '#9C8E7E', ink4: '#6B5F52',
  red: '#D9442B', amber: '#E8A33B', green: '#3F7D44', rule: '#2E2720'
}

interface Opcion {
  id: string; nombre: string; descripcion?: string
  precio_coste: number; precio_venta: number
  es_opcion_base: boolean; precio_diferencial: number
  alergenos: string[]; activo: boolean
}
interface Bloque {
  id: string; nombre: string; orden: number
  es_upgrade: boolean; precio_diferencial: number; apto_ninos: boolean
  opciones: Opcion[]
}
interface BarraTier { id: string; nombre: string; precio_persona_hora: number; requiere_consulta: boolean }
interface Desglose {
  precio_adulto: number; precio_nino: number
  subtotal_menu: number; barra_nombre: string; barra_precio: number
  subtotal_bruto: number; descuento_pct: number; descuento_eur: number
  total_final: number; total_coste: number; margen_real_pct: number; rentable: boolean
}

function ConfiguradorContent({ menuId, briefingId }: { menuId: string; briefingId: string }) {
  const [bloques, setBloques] = useState<Bloque[]>([])
  const [tiers, setTiers] = useState<BarraTier[]>([])
  const [desglose, setDesglose] = useState<Desglose | null>(null)
  const [selecciones, setSelecciones] = useState<Record<string, string>>({})
  const [adultos, setAdultos] = useState(50)
  const [ninos, setNinos] = useState(0)
  const [barraTierId, setBarraTierId] = useState('')
  const [barraHoras, setBarraHoras] = useState(3)
  const [descuentoPct, setDescuentoPct] = useState(0)
  const [descuentoMax, setDescuentoMax] = useState(10)
  const [comisionBase] = useState(5)
  const [mostrarCostes, setMostrarCostes] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [calculando, setCalculando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (!menuId) return
    Promise.all([
      fetch(`/api/owner/eventos/menus/${menuId}/bloques`).then(r => r.json()),
      fetch('/api/owner/eventos/barra-tiers').then(r => r.json()),
      fetch('/api/owner/eventos/config').then(r => r.json()),
    ]).then(([b, t, cfg]) => {
      const bls: Bloque[] = b.bloques || []
      setBloques(bls)
      setTiers(t.tiers || [])
      if (cfg.config) {
        setMostrarCostes(cfg.config.mostrar_costes_comercial || false)
        setDescuentoMax(cfg.config.descuento_requiere_aprobacion_desde || 10)
      }
      const selInicial: Record<string, string> = {}
      bls.forEach(bl => {
        const base = bl.opciones.find(o => o.es_opcion_base && o.activo)
        if (base) selInicial[bl.id] = base.id
      })
      setSelecciones(selInicial)
    }).finally(() => setCargando(false))
  }, [menuId])

  const calcular = useCallback(async () => {
    if (!menuId) return
    setCalculando(true)
    try {
      const params = new URLSearchParams({
        adultos: String(adultos), ninos: String(ninos),
        descuento_pct: String(descuentoPct), barra_horas: String(barraHoras),
        ...(barraTierId && { barra_tier_id: barraTierId })
      })
      const r = await fetch(`/api/owner/eventos/menus/${menuId}/calcular?${params}`)
      const d = await r.json()
      if (d.desglose) setDesglose(d.desglose)
    } finally { setCalculando(false) }
  }, [menuId, adultos, ninos, barraTierId, barraHoras, descuentoPct])

  useEffect(() => {
    const t = setTimeout(calcular, 400)
    return () => clearTimeout(t)
  }, [calcular])

  const comision = desglose ? Math.round(desglose.total_final * (comisionBase / 100) * 100) / 100 : 0

  const guardar = async () => {
    if (!desglose) return
    setGuardando(true)
    try {
      await fetch('/api/owner/eventos/presupuestos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefing_id: briefingId || null, menu_evento_id: menuId,
          adultos, ninos, precio_adulto: desglose.precio_adulto, precio_nino: desglose.precio_nino,
          barra_precio: desglose.barra_precio, subtotal: desglose.subtotal_bruto,
          descuento_aplicado_pct: descuentoPct, descuento_aplicado_eur: desglose.descuento_eur,
          total: desglose.total_final, comision_comercial_eur: comision,
          margen_real_pct: desglose.margen_real_pct, estado: 'borrador'
        })
      })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } finally { setGuardando(false) }
  }

  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sh = (s: React.CSSProperties) => s

  if (cargando) return (
    <div style={sh({ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' })}>
      <div style={sh({ color: C.ink2, fontFamily: 'Inter Tight, sans-serif' })}>Cargando...</div>
    </div>
  )

  return (
    <div style={sh({ fontFamily: 'Inter Tight, sans-serif' })}>
      <div style={sh({ background: C.bg2, borderBottom: `1px solid ${C.rule}`, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
        <div>
          <div style={sh({ color: C.paper, fontWeight: 700 })}>Configurador de menú</div>
          <div style={sh({ color: C.ink3, fontSize: '0.78rem' })}>Precio en tiempo real</div>
        </div>
        <button onClick={guardar} disabled={guardando || !desglose}
          style={sh({ padding: '0.6rem 1.1rem', background: guardado ? C.green : C.red, border: 'none', borderRadius: 8, color: C.paper, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' })}>
          {guardado ? '✅ Guardado' : guardando ? '...' : '💾 Guardar presupuesto'}
        </button>
      </div>

      <div style={sh({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' })}>
        {/* Columna configuración */}
        <div style={sh({ padding: '1.25rem 1.5rem', borderRight: `1px solid ${C.rule}`, overflowY: 'auto', maxHeight: 'calc(100vh - 65px)' })}>

          {/* Comensales */}
          <div style={sh({ background: C.bg2, borderRadius: 10, padding: '1rem', marginBottom: '1rem', border: `1px solid ${C.rule}` })}>
            <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' })}>Comensales</div>
            <div style={sh({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' })}>
              {[{ label: 'Adultos', val: adultos, set: setAdultos }, { label: 'Niños', val: ninos, set: setNinos }].map(f => (
                <div key={f.label}>
                  <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.82rem', marginBottom: '0.3rem' })}>{f.label}</label>
                  <input type="number" min={0} value={f.val}
                    onChange={e => f.set(parseInt(e.target.value) || 0)}
                    style={sh({ width: '100%', padding: '0.6rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 7, color: C.paper, fontSize: '1rem', boxSizing: 'border-box' })} />
                </div>
              ))}
            </div>
          </div>

          {/* Bloques menú */}
          <div style={sh({ marginBottom: '1rem' })}>
            <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' })}>Composición del menú</div>
            {bloques.map(bloque => {
              const sel = bloque.opciones.find(o => o.id === selecciones[bloque.id])
              const precio = sel ? sel.precio_venta + (sel.es_opcion_base ? 0 : sel.precio_diferencial) : 0
              return (
                <div key={bloque.id} style={sh({ background: C.bg2, borderRadius: 10, padding: '0.9rem', marginBottom: '0.6rem', border: `1px solid ${C.rule}` })}>
                  <div style={sh({ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' })}>
                    <div style={sh({ color: C.paper, fontWeight: 600, fontSize: '0.9rem' })}>{bloque.nombre}</div>
                    <div style={sh({ color: C.amber, fontSize: '0.82rem', fontWeight: 600 })}>{fmt(precio)}€/p</div>
                  </div>
                  {bloque.opciones.filter(o => o.activo).map(opcion => (
                    <button key={opcion.id} onClick={() => setSelecciones(prev => ({ ...prev, [bloque.id]: opcion.id }))}
                      style={sh({ width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', marginBottom: '0.3rem', borderRadius: 7, cursor: 'pointer', border: `2px solid ${selecciones[bloque.id] === opcion.id ? C.red : C.rule}`, background: selecciones[bloque.id] === opcion.id ? 'rgba(217,68,43,0.12)' : C.bg3 })}>
                      <div style={sh({ display: 'flex', justifyContent: 'space-between' })}>
                        <span style={sh({ color: selecciones[bloque.id] === opcion.id ? C.paper : C.ink2, fontSize: '0.88rem' })}>{opcion.nombre}</span>
                        <span style={sh({ color: !opcion.es_opcion_base && opcion.precio_diferencial > 0 ? C.amber : C.ink4, fontSize: '0.78rem' })}>
                          {!opcion.es_opcion_base && opcion.precio_diferencial > 0 ? `+${fmt(opcion.precio_diferencial)}€/p` : mostrarCostes ? `coste ${fmt(opcion.precio_coste)}€` : ''}
                        </span>
                      </div>
                      {opcion.alergenos?.length > 0 && (
                        <div style={sh({ color: C.amber, fontSize: '0.72rem', marginTop: '0.2rem' })}>⚠ {opcion.alergenos.join(', ')}</div>
                      )}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Barra libre */}
          <div style={sh({ background: C.bg2, borderRadius: 10, padding: '0.9rem', marginBottom: '1rem', border: `1px solid ${C.rule}` })}>
            <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' })}>Barra libre (opcional)</div>
            {[{ id: '', nombre: 'Sin barra libre', precio_persona_hora: 0, requiere_consulta: false }, ...tiers].map(tier => (
              <button key={tier.id} onClick={() => setBarraTierId(tier.id)}
                style={sh({ width: '100%', textAlign: 'left', padding: '0.5rem 0.7rem', marginBottom: '0.3rem', borderRadius: 7, cursor: 'pointer', border: `2px solid ${barraTierId === tier.id ? C.red : C.rule}`, background: barraTierId === tier.id ? 'rgba(217,68,43,0.12)' : C.bg3 })}>
                <div style={sh({ display: 'flex', justifyContent: 'space-between' })}>
                  <span style={sh({ color: barraTierId === tier.id ? C.paper : C.ink2, fontSize: '0.88rem' })}>{tier.nombre}</span>
                  <span style={sh({ color: C.amber, fontSize: '0.78rem' })}>
                    {tier.requiere_consulta ? 'Consultar' : tier.precio_persona_hora > 0 ? `${fmt(tier.precio_persona_hora)}€/p/h` : ''}
                  </span>
                </div>
              </button>
            ))}
            {barraTierId && (
              <div style={sh({ marginTop: '0.6rem' })}>
                <div style={sh({ color: C.ink2, fontSize: '0.82rem', marginBottom: '0.35rem' })}>Horas</div>
                <div style={sh({ display: 'flex', gap: '0.4rem' })}>
                  {[2, 3, 4, 5, 6].map(h => (
                    <button key={h} onClick={() => setBarraHoras(h)}
                      style={sh({ flex: 1, padding: '0.45rem', border: `2px solid ${barraHoras === h ? C.red : C.rule}`, borderRadius: 6, background: barraHoras === h ? 'rgba(217,68,43,0.12)' : C.bg3, color: barraHoras === h ? C.paper : C.ink3, cursor: 'pointer', fontSize: '0.82rem' })}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Descuento */}
          <div style={sh({ background: C.bg2, borderRadius: 10, padding: '0.9rem', border: `1px solid ${C.rule}` })}>
            <div style={sh({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' })}>
              <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' })}>Descuento</div>
              <div style={sh({ color: C.paper, fontWeight: 700 })}>{descuentoPct}%</div>
            </div>
            <input type="range" min={0} max={descuentoMax} step={0.5} value={descuentoPct}
              onChange={e => setDescuentoPct(parseFloat(e.target.value))}
              style={sh({ width: '100%', accentColor: C.red })} />
            <div style={sh({ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: C.ink4, marginTop: '0.25rem' })}>
              <span>0%</span><span>Máx. {descuentoMax}%</span>
            </div>
            {descuentoPct > 0 && desglose && (
              <div style={sh({ marginTop: '0.5rem', color: C.ink2, fontSize: '0.82rem' })}>
                Descuento: <span style={{ color: C.amber }}>-{fmt(desglose.descuento_eur)}€</span>
                {' · '}Comisión: <span style={{ color: C.green }}>{fmt(comision)}€</span>
              </div>
            )}
            {descuentoPct >= descuentoMax && (
              <div style={sh({ marginTop: '0.4rem', color: C.amber, fontSize: '0.78rem' })}>⚠ Requiere aprobación del owner</div>
            )}
          </div>
        </div>

        {/* Columna resumen */}
        <div style={sh({ padding: '1.25rem 1.5rem' })}>
          {/* Total KPI */}
          <div style={sh({ background: C.bg2, borderRadius: 12, padding: '1.5rem', textAlign: 'center', marginBottom: '1rem', border: `1px solid ${C.rule}` })}>
            <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' })}>
              Total evento {calculando ? '⟳' : ''}
            </div>
            <div style={sh({ fontFamily: 'Newsreader, serif', fontSize: '3rem', color: C.paper, fontWeight: 300, lineHeight: 1 })}>
              {desglose ? fmt(desglose.total_final) : '—'}
            </div>
            <div style={sh({ color: C.ink4, fontSize: '0.82rem', marginTop: '0.3rem' })}>€</div>
            {desglose && (
              <div style={sh({ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '0.75rem' })}>
                <div>
                  <div style={sh({ color: C.amber, fontWeight: 700, fontSize: '1.05rem' })}>{fmt(desglose.precio_adulto)}€</div>
                  <div style={sh({ color: C.ink4, fontSize: '0.72rem' })}>adulto</div>
                </div>
                {ninos > 0 && (
                  <div>
                    <div style={sh({ color: C.ink2, fontWeight: 700, fontSize: '1.05rem' })}>{fmt(desglose.precio_nino)}€</div>
                    <div style={sh({ color: C.ink4, fontSize: '0.72rem' })}>niño</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desglose */}
          {desglose && (
            <div style={sh({ background: C.bg2, borderRadius: 10, padding: '1rem', marginBottom: '1rem', border: `1px solid ${C.rule}` })}>
              <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' })}>Desglose</div>
              {[
                { label: `Menú (${adultos}A${ninos > 0 ? `+${ninos}N` : ''})`, valor: desglose.subtotal_menu, neg: false },
                ...(barraTierId && desglose.barra_precio > 0 ? [{ label: `${desglose.barra_nombre} ${barraHoras}h`, valor: desglose.barra_precio, neg: false }] : []),
                ...(descuentoPct > 0 ? [{ label: `Descuento ${descuentoPct}%`, valor: desglose.descuento_eur, neg: true }] : []),
              ].map((item, i) => (
                <div key={i} style={sh({ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: `1px solid ${C.rule}` })}>
                  <span style={sh({ color: C.ink2, fontSize: '0.88rem' })}>{item.label}</span>
                  <span style={sh({ color: item.neg ? C.amber : C.paper, fontSize: '0.88rem', fontWeight: 500 })}>
                    {item.neg ? '-' : ''}{fmt(item.valor)}€
                  </span>
                </div>
              ))}
              <div style={sh({ display: 'flex', justifyContent: 'space-between', padding: '0.55rem 0 0' })}>
                <span style={sh({ color: C.paper, fontWeight: 700 })}>Total</span>
                <span style={sh({ color: C.paper, fontWeight: 700, fontSize: '1.05rem' })}>{fmt(desglose.total_final)}€</span>
              </div>
            </div>
          )}

          {/* Rentabilidad */}
          {desglose && mostrarCostes && (
            <div style={sh({ background: desglose.rentable ? 'rgba(63,125,68,0.1)' : 'rgba(217,68,43,0.1)', border: `1px solid ${desglose.rentable ? C.green : C.red}`, borderRadius: 10, padding: '0.9rem', marginBottom: '1rem' })}>
              <div style={sh({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                <div>
                  <div style={sh({ color: desglose.rentable ? C.green : C.red, fontWeight: 700 })}>{desglose.rentable ? '✅ Rentable' : '⚠ Margen bajo'}</div>
                  <div style={sh({ color: C.ink3, fontSize: '0.78rem', marginTop: '0.2rem' })}>Coste est.: {fmt(desglose.total_coste)}€</div>
                </div>
                <div style={sh({ textAlign: 'right' })}>
                  <div style={sh({ color: desglose.rentable ? C.green : C.amber, fontSize: '1.4rem', fontFamily: 'Newsreader, serif', fontWeight: 600 })}>{desglose.margen_real_pct}%</div>
                  <div style={sh({ color: C.ink4, fontSize: '0.72rem' })}>margen</div>
                </div>
              </div>
            </div>
          )}

          {/* Comisión */}
          {comision > 0 && (
            <div style={sh({ background: 'rgba(63,125,68,0.08)', border: `1px solid ${C.green}`, borderRadius: 10, padding: '0.9rem', marginBottom: '1rem' })}>
              <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' })}>Tu comisión estimada</div>
              <div style={sh({ color: C.green, fontSize: '1.8rem', fontFamily: 'Newsreader, serif', fontWeight: 600 })}>{fmt(comision)}€</div>
              <div style={sh({ color: C.ink4, fontSize: '0.75rem', marginTop: '0.2rem' })}>{comisionBase}% sobre {desglose ? fmt(desglose.total_final) : '0'}€</div>
            </div>
          )}

          {/* Resumen selecciones */}
          {bloques.length > 0 && (
            <div style={sh({ background: C.bg2, borderRadius: 10, padding: '1rem', border: `1px solid ${C.rule}` })}>
              <div style={sh({ color: C.ink3, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' })}>Menú configurado</div>
              {bloques.map(bl => {
                const sel = bl.opciones.find(o => o.id === selecciones[bl.id])
                return (
                  <div key={bl.id} style={sh({ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: `1px solid ${C.rule}` })}>
                    <div>
                      <div style={sh({ color: C.ink4, fontSize: '0.72rem' })}>{bl.nombre}</div>
                      <div style={sh({ color: sel ? C.ink2 : C.ink4, fontSize: '0.85rem' })}>{sel?.nombre || '—'}</div>
                    </div>
                    {sel && !sel.es_opcion_base && sel.precio_diferencial > 0 && (
                      <span style={sh({ color: C.amber, fontSize: '0.78rem', alignSelf: 'center' })}>+{fmt(sel.precio_diferencial)}€/p</span>
                    )}
                  </div>
                )
              })}
              {barraTierId && (
                <div style={sh({ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' })}>
                  <div>
                    <div style={sh({ color: C.ink4, fontSize: '0.72rem' })}>Barra libre</div>
                    <div style={sh({ color: C.ink2, fontSize: '0.85rem' })}>{tiers.find(t => t.id === barraTierId)?.nombre} · {barraHoras}h</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConfiguradorMenuPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#14110E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9C8E7E', fontFamily: 'Inter Tight, sans-serif' }}>Cargando...</div>
      </div>
    }>
      <ConfiguradorMenuInner />
    </Suspense>
  )
}

function ConfiguradorMenuInner() {
  const searchParams = useSearchParams()
  const menuId = searchParams.get('menu_id') || ''
  const briefingId = searchParams.get('briefing_id') || ''

  if (!menuId) return (
    <div style={{ minHeight: '100vh', background: '#14110E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#9C8E7E', fontFamily: 'Inter Tight, sans-serif' }}>
        Accede desde un briefing o selecciona un menú
      </div>
    </div>
  )

  return <ConfiguradorContent menuId={menuId} briefingId={briefingId} />
}
