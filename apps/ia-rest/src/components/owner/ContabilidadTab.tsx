'use client'
// ContabilidadTab — Panel de contabilidad ia.rest
// Resumen · Cierre diario · IVA 303 · Exportar · Configuración

import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type SubTab = 'resumen' | 'cierre' | 'iva' | 'exportar' | 'config'

interface Kpis {
  ingresos_brutos: number; base_ventas: number; iva_repercutido: number
  gastos_compras: number; iva_soportado: number; resultado_bruto: number
  iva_pendiente: number; food_cost_pct: number; ticket_medio: number; num_tickets: number
}
interface Cobros { efectivo: number; tarjeta: number; bizum: number }
interface EvolucionDia { fecha: string; ventas: number; tickets: number }

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'resumen',  label: '📊 Resumen'       },
  { id: 'cierre',   label: '🔒 Cierre diario'  },
  { id: 'iva',      label: '📋 IVA 303'         },
  { id: 'exportar', label: '📤 Exportar'        },
  { id: 'config',   label: '⚙️ Configuración'   },
]

const fmt = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const fmtPct = (n: number) => n.toFixed(1) + '%'

// Denominaciones de euro para el arqueo físico (clave del desglose = valor en euros).
const DENOMINACIONES_EUR = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]
const fmtDenom = (d: number) =>
  (Number.isInteger(d) ? String(d) : d.toLocaleString('es', { minimumFractionDigits: 2 })) + ' €'

interface CuadreCaja {
  fondo_inicial: number; cobros_efectivo: number; salidas_caja: number
  saldo_teorico: number; fondo_final: number; diferencia_caja: number; conteo_realizado: boolean
}
interface CuadreEmpleado { camarero_id: string | null; camarero_nombre: string | null; cuadre: CuadreCaja }

// Rejilla de detalle de un cuadre (reutilizada en vista global y por empleado).
function CuadreDetalle({ cc }: { cc: CuadreCaja }) {
  const difColor = Math.abs(cc.diferencia_caja) < 0.005 ? '#3F7D44' : cc.diferencia_caja > 0 ? C.amber : (C.verm ?? '#D9442B')
  const filas: [string, string, string][] = [
    ['Fondo inicial', fmt(cc.fondo_inicial), C.ink],
    ['Cobros efectivo', fmt(cc.cobros_efectivo), C.ink],
    ['Salidas (retiros/gastos)', fmt(cc.salidas_caja), C.ink],
    ['Saldo teórico', fmt(cc.saldo_teorico), C.ink],
    ['Contado (físico)', cc.conteo_realizado ? fmt(cc.fondo_final) : '—', C.ink],
    ['Descuadre', cc.conteo_realizado ? fmt(cc.diferencia_caja) : '—', difColor],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
      {filas.map(([l, v, col]) => (
        <div key={l} style={{ background: C.paper2, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginBottom: 2 }}>{l}</div>
          <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: col }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

export default function ContabilidadTab({ sh }: { sh: () => Record<string, string> }) {
  const [sub, setSub] = useState<SubTab>('resumen')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  return (
    <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>Contabilidad</div>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
          Adaptable a IS · IRPF directa · Módulos
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            fontFamily: SN, fontSize: 12, padding: '6px 14px', borderRadius: 20,
            background: sub === t.id ? C.ink : 'transparent',
            color: sub === t.id ? C.paper : C.ink3,
            border: `1px solid ${sub === t.id ? C.ink : C.rule}`,
            cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'resumen'  && <ResumenTab  sh={sh} showToast={showToast} />}
      {sub === 'cierre'   && <CierreTab   sh={sh} showToast={showToast} />}
      {sub === 'iva'      && <IvaTab      sh={sh} showToast={showToast} />}
      {sub === 'exportar' && <ExportarTab sh={sh} showToast={showToast} />}
      {sub === 'config'   && <ConfigTab   sh={sh} showToast={showToast} />}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: C.ink, color: C.paper, fontFamily: SN, fontSize: 13,
          padding: '10px 20px', borderRadius: 20, zIndex: 999, whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ── RESUMEN ───────────────────────────────────────────────────────────────────
function ResumenTab({ sh, showToast }: { sh: () => Record<string, string>; showToast: (m: string) => void }) {
  const [mes, setMes]     = useState(new Date().toISOString().slice(0, 7))
  const [kpis, setKpis]   = useState<Kpis | null>(null)
  const [cobros, setCobros] = useState<Cobros | null>(null)
  const [evolucion, setEvolucion] = useState<EvolucionDia[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/owner/contabilidad/resumen?mes=${mes}`, { headers: sh() })
    const d = await r.json()
    if (d.ok) { setKpis(d.kpis); setCobros(d.cobros); setEvolucion(d.evolucion_diaria) }
    setLoading(false)
  }, [mes])

  useEffect(() => { load() }, [load])

  const Card = ({ label, valor, color, sub }: { label: string; valor: string; color: string; sub?: string }) => (
    <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color }}>{valor}</div>
      {sub && <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          style={{ fontFamily: SN, fontSize: 13, padding: '6px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, outline: 'none' }} />
        {loading && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando…</span>}
      </div>

      {kpis && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Card label="Ingresos brutos"  valor={fmt(kpis.ingresos_brutos)} color={C.ink} />
            <Card label="Resultado bruto"  valor={fmt(kpis.resultado_bruto)} color={kpis.resultado_bruto >= 0 ? '#3F7D44' : C.verm} />
            <Card label="IVA a pagar (est.)" valor={fmt(kpis.iva_pendiente)} color={C.amber} />
            <Card label="Food cost"        valor={fmtPct(kpis.food_cost_pct)} color={kpis.food_cost_pct < 30 ? '#3F7D44' : kpis.food_cost_pct < 40 ? C.amber : C.verm} sub={`${fmt(kpis.gastos_compras)} en compras`} />
            <Card label="Ticket medio"     valor={fmt(kpis.ticket_medio)} color={C.ink} sub={`${kpis.num_tickets} tickets`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {/* Desglose IVA */}
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', marginBottom: 8 }}>Desglose IVA</div>
              {[
                ['Ventas (base)', fmt(kpis.base_ventas), C.ink],
                ['IVA repercutido', fmt(kpis.iva_repercutido), C.amber],
                ['Compras (base)', fmt(kpis.gastos_compras), C.ink],
                ['IVA soportado', fmt(kpis.iva_soportado), '#60A5FA'],
                ['Diferencia IVA', fmt(kpis.iva_repercutido - kpis.iva_soportado), kpis.iva_repercutido > kpis.iva_soportado ? C.verm : '#3F7D44'],
              ].map(([l, v, c]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{l}</span>
                  <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: c as string }}>{v}</span>
                </div>
              ))}
            </div>
            {/* Cobros */}
            {cobros && (
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', marginBottom: 8 }}>Cobros por canal</div>
                {[
                  ['💵 Efectivo', cobros.efectivo],
                  ['💳 Tarjeta / TPV', cobros.tarjeta],
                  ['📱 Bizum', cobros.bizum],
                ].map(([l, v]) => {
                  const total = cobros.efectivo + cobros.tarjeta + cobros.bizum
                  const pct = total > 0 ? Math.round((v as number) / total * 100) : 0
                  return (
                    <div key={l as string} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{l}</span>
                        <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink }}>{fmt(v as number)} <span style={{ color: C.ink4 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: 4, background: C.rule, borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: C.ink, borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Evolución diaria */}
          {evolucion.length > 0 && (
            <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', marginBottom: 10 }}>Evolución ventas diarias</div>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 60 }}>
                {evolucion.map(d => {
                  const max = Math.max(...evolucion.map(x => x.ventas))
                  const h = max > 0 ? Math.round(d.ventas / max * 56) : 0
                  return (
                    <div key={d.fecha} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ width: '100%', height: h, background: C.ink, borderRadius: 2, minHeight: 2 }} title={`${d.fecha}: ${fmt(d.ventas)}`} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
      {!kpis && !loading && (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: SN, fontSize: 13, color: C.ink3 }}>
          Sin datos para {mes}. Haz el primer cierre diario para ver el resumen.
        </div>
      )}
    </div>
  )
}

// ── CIERRE DIARIO ─────────────────────────────────────────────────────────────
function CierreTab({ sh, showToast }: { sh: () => Record<string, string>; showToast: (m: string) => void }) {
  const [fecha, setFecha]     = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [conArqueo, setConArqueo] = useState(false)
  const [desglose, setDesglose]   = useState<Record<string, number>>({})
  const [notas, setNotas]         = useState('')
  const [vista, setVista]         = useState<'global' | 'empleado'>('global')
  const [result, setResult]   = useState<{
    resumen: { total_ventas: number; base_10: number; iva_10: number; base_21: number; iva_21: number; efectivo: number; tarjeta: number; bizum: number; num_tickets: number }
    num_asiento: number
    cuadre?: CuadreCaja
    cuadre_por_empleado?: CuadreEmpleado[]
  } | null>(null)

  // Total contado en vivo desde el desglose físico.
  const fondoContado = DENOMINACIONES_EUR.reduce((s, d) => s + d * (desglose[String(d)] || 0), 0)
  const setDenom = (d: number, n: string) =>
    setDesglose(prev => ({ ...prev, [String(d)]: Math.max(0, parseInt(n || '0', 10) || 0) }))

  const cerrar = async () => {
    setLoading(true)
    try {
      const body: Record<string, unknown> = { fecha }
      if (conArqueo) body.desglose_monedas = desglose
      if (notas.trim()) body.notas = notas.trim()
      const r = await fetch('/api/owner/contabilidad/cierre-diario', {
        method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const d = await r.json()
      if (!d.ok) { showToast('Error: ' + d.error); return }
      setResult(d)
      const dif = d.cuadre?.conteo_realizado ? d.cuadre.diferencia_caja : null
      showToast(
        dif == null ? `✅ Cierre generado — Asiento nº ${d.num_asiento}`
        : Math.abs(dif) < 0.005 ? `✅ Cierre + caja cuadrada — Asiento nº ${d.num_asiento}`
        : `⚠️ Cierre con descuadre de ${fmt(dif)} — Asiento nº ${d.num_asiento}`
      )
    } finally { setLoading(false) }
  }

  const c = result?.cuadre
  const difColor = !c ? C.ink : Math.abs(c.diferencia_caja) < 0.005 ? '#4ADE80' : c.diferencia_caja > 0 ? C.amber : (C.verm ?? '#D9442B')

  return (
    <div>
      <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '16px', marginBottom: 16 }}>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, marginBottom: 12 }}>
          Genera el asiento contable del día calculando automáticamente las ventas desde los tickets y facturas simplificadas emitidas.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ fontFamily: SN, fontSize: 13, padding: '8px 12px', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, outline: 'none' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>
            <input type="checkbox" checked={conArqueo} onChange={e => setConArqueo(e.target.checked)} style={{ accentColor: C.ink }} />
            Hacer arqueo de caja (contar el cajón)
          </label>
          <button onClick={cerrar} disabled={loading}
            style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, padding: '8px 20px', background: loading ? C.rule : C.ink, color: C.paper, border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Generando…' : '🔒 Generar cierre del día'}
          </button>
        </div>
      </div>

      {/* Arqueo físico: conteo por denominación */}
      {conArqueo && (
        <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.05em' }}>Conteo físico del cajón</div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink }}>Contado: {fmt(fondoContado)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {DENOMINACIONES_EUR.map(d => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.paper2, borderRadius: 8, padding: '5px 8px' }}>
                <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3, minWidth: 52 }}>{fmtDenom(d)}</span>
                <input type="number" min={0} inputMode="numeric" value={desglose[String(d)] || ''} placeholder="0"
                  onChange={e => setDenom(d, e.target.value)}
                  style={{ width: '100%', fontFamily: SN, fontSize: 13, padding: '5px 6px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Notas (motivo del descuadre, incidencias…)</div>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional"
              style={{ width: '100%', fontFamily: SN, fontSize: 13, padding: '8px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      {result && (
        <div style={{ background: '#0A2614', border: '1px solid #3F7D4444', borderRadius: 10, padding: '14px 16px', marginBottom: (c?.conteo_realizado || (result.cuadre_por_empleado?.length ?? 0) > 0) ? 12 : 0 }}>
          <div style={{ fontFamily: SM, fontSize: 11, color: '#4ADE80', marginBottom: 10 }}>Asiento nº {result.num_asiento} generado</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              ['Total ventas', fmt(result.resumen.total_ventas)],
              ['Base 10%', fmt(result.resumen.base_10)],
              ['IVA 10%', fmt(result.resumen.iva_10)],
              ['Base 21%', fmt(result.resumen.base_21)],
              ['IVA 21%', fmt(result.resumen.iva_21)],
              ['Tickets', String(result.resumen.num_tickets)],
            ].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontFamily: SM, fontSize: 9, color: '#4ADE8077', marginBottom: 2 }}>{l}</div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: '#4ADE80' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cuadre de caja — vista configurable: caja única o por empleado */}
      {result && (c?.conteo_realizado || (result.cuadre_por_empleado?.length ?? 0) > 0) && (
        <div style={{ background: C.bone, border: `1px solid ${difColor}55`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.05em' }}>Cuadre de caja</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['global', 'empleado'] as const).map(v => (
                <button key={v} onClick={() => setVista(v)} style={{
                  fontFamily: SN, fontSize: 11, padding: '4px 10px', borderRadius: 14,
                  background: vista === v ? C.ink : 'transparent', color: vista === v ? C.paper : C.ink3,
                  border: `1px solid ${vista === v ? C.ink : C.rule}`, cursor: 'pointer' }}>
                  {v === 'global' ? 'Caja única' : 'Por empleado'}
                </button>
              ))}
            </div>
          </div>

          {vista === 'global' && (
            c?.conteo_realizado ? (
              <>
                <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: difColor, marginBottom: 10 }}>
                  {Math.abs(c.diferencia_caja) < 0.005 ? 'Caja cuadrada ✓' : `${c.diferencia_caja > 0 ? 'Sobra' : 'Falta'} ${fmt(Math.abs(c.diferencia_caja))}`}
                </div>
                <CuadreDetalle cc={c} />
              </>
            ) : (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Marca “Hacer arqueo” y cuenta el cajón para ver el descuadre global.</div>
            )
          )}

          {vista === 'empleado' && (
            (result.cuadre_por_empleado?.length ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.cuadre_por_empleado!.map(e => {
                  const ec = e.cuadre
                  const ecol = Math.abs(ec.diferencia_caja) < 0.005 ? '#3F7D44' : ec.diferencia_caja > 0 ? C.amber : (C.verm ?? '#D9442B')
                  return (
                    <div key={e.camarero_id ?? 'general'} style={{ background: C.paper2, borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.ink }}>{e.camarero_nombre ?? 'Caja general'}</div>
                        <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: ecol }}>
                          {!ec.conteo_realizado ? 'Sin conteo' : Math.abs(ec.diferencia_caja) < 0.005 ? 'Cuadrada ✓' : `${ec.diferencia_caja > 0 ? 'Sobra' : 'Falta'} ${fmt(Math.abs(ec.diferencia_caja))}`}
                        </div>
                      </div>
                      <CuadreDetalle cc={ec} />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>No hay movimientos de caja por empleado este día.</div>
            )
          )}
        </div>
      )}

      {/* Auditoría: histórico de descuadres por empleado */}
      <HistoricoEmpleadoPanel sh={sh} />
    </div>
  )
}

// ── Histórico / auditoría de descuadres por empleado ─────────────────────────
interface ResumenEmp {
  camarero_id: string | null; camarero_nombre: string | null
  num_cierres: number; descuadre_total: number; descuadre_medio: number
  peor_descuadre: number; racha_negativa: number; patron_recurrente: boolean
}
interface FilaEmp {
  camarero_id: string | null; camarero_nombre: string | null
  fecha: string; diferencia_caja: number; conteo_realizado: boolean; notas?: string | null
}

function HistoricoEmpleadoPanel({ sh }: { sh: () => Record<string, string> }) {
  const hoy = new Date()
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
  const [desde, setDesde] = useState(primero)
  const [hasta, setHasta] = useState(hoy.toISOString().split('T')[0])
  const [resumen, setResumen] = useState<ResumenEmp[]>([])
  const [detalle, setDetalle] = useState<FilaEmp[]>([])
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/owner/contabilidad/arqueos-empleado?desde=${desde}&hasta=${hasta}`, { headers: sh() })
      const d = await r.json()
      if (d.ok) { setResumen(d.resumen ?? []); setDetalle(d.detalle ?? []) }
      setCargado(true)
    } finally { setLoading(false) }
  }, [desde, hasta, sh])

  useEffect(() => { cargar() }, [cargar])

  const col = (v: number) => Math.abs(v) < 0.005 ? '#3F7D44' : v > 0 ? C.amber : (C.verm ?? '#D9442B')

  const exportarCSV = () => {
    const cab = ['Empleado', 'Cierres', 'Descuadre acumulado', 'Media', 'Peor', 'Racha negativa', 'Merma recurrente']
    const filas = resumen.map(r => [
      r.camarero_nombre ?? 'Caja general', r.num_cierres, r.descuadre_total, r.descuadre_medio,
      r.peor_descuadre, r.racha_negativa, r.patron_recurrente ? 'SÍ' : 'no',
    ])
    const det = detalle.map(f => [f.camarero_nombre ?? 'Caja general', f.fecha, f.diferencia_caja, f.conteo_realizado ? 'sí' : 'no', (f.notas ?? '').replace(/[\n;]/g, ' ')])
    const csv = [
      `Descuadres por empleado ${desde} a ${hasta}`, '',
      cab.join(';'), ...filas.map(f => f.join(';')),
      '', 'Detalle;Fecha;Descuadre;Conteo;Notas', ...det.map(f => f.join(';')),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `descuadres_empleado_${desde}_${hasta}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.05em' }}>Histórico de descuadres por empleado</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} />
          <span style={{ fontFamily: SN, fontSize: 12, color: C.ink4 }}>→</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inp} />
          <button onClick={cargar} disabled={loading} style={{ ...btn, opacity: loading ? .6 : 1 }}>{loading ? '…' : 'Ver'}</button>
          <button onClick={exportarCSV} disabled={!resumen.length} style={{ ...btn, opacity: resumen.length ? 1 : .4 }}>CSV</button>
        </div>
      </div>

      {!resumen.length ? (
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{cargado ? 'Sin cierres por empleado en este rango.' : 'Cargando…'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Cabecera */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr 1fr .8fr .8fr 1.2fr', gap: 6, padding: '0 8px' }}>
            {['Empleado', 'Cierres', 'Acumulado', 'Media', 'Peor', 'Tendencia'].map(h => (
              <div key={h} style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</div>
            ))}
          </div>
          {resumen.map(r => {
            const serie = detalle.filter(f => f.camarero_id === r.camarero_id && f.conteo_realizado)
            const maxAbs = Math.max(1, ...serie.map(s => Math.abs(s.diferencia_caja)))
            return (
              <div key={r.camarero_id ?? 'general'} style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr 1fr .8fr .8fr 1.2fr', gap: 6, alignItems: 'center', background: C.paper2, borderRadius: 8, padding: '8px' }}>
                <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.camarero_nombre ?? 'Caja general'}
                  {r.patron_recurrente && (
                    <span title={`${r.racha_negativa} cierres seguidos en negativo`} style={{ fontFamily: SM, fontSize: 8, color: C.paper, background: (C.verm ?? '#D9442B'), borderRadius: 6, padding: '1px 5px', textTransform: 'uppercase' }}>merma</span>
                  )}
                </div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{r.num_cierres}</div>
                <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: col(r.descuadre_total) }}>{fmt(r.descuadre_total)}</div>
                <div style={{ fontFamily: SN, fontSize: 12, color: col(r.descuadre_medio) }}>{fmt(r.descuadre_medio)}</div>
                <div style={{ fontFamily: SN, fontSize: 12, color: col(r.peor_descuadre) }}>{fmt(r.peor_descuadre)}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26 }}>
                  {serie.slice(-14).map((s, i) => (
                    <div key={i} title={`${s.fecha}: ${fmt(s.diferencia_caja)}`}
                      style={{ width: 5, height: `${Math.max(2, Math.abs(s.diferencia_caja) / maxAbs * 24)}px`, background: col(s.diferencia_caja), borderRadius: 1 }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
const inp: React.CSSProperties = { fontFamily: SN, fontSize: 12, padding: '5px 8px', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink, outline: 'none' }
const btn: React.CSSProperties = { fontFamily: SN, fontSize: 12, fontWeight: 700, padding: '5px 12px', background: C.ink, color: C.paper, border: 'none', borderRadius: 6, cursor: 'pointer' }

// ── IVA 303 ───────────────────────────────────────────────────────────────────
function IvaTab({ sh, showToast }: { sh: () => Record<string, string>; showToast: (m: string) => void }) {
  const hoy = new Date()
  const [año, setAño]       = useState(hoy.getFullYear())
  const [trim, setTrim]     = useState(Math.ceil((hoy.getMonth() + 1) / 3))
  const [data, setData]     = useState<{
    liquidacion: ReturnType<typeof import('@/lib/contabilidad')['calcularLiquidacionIVA']>
    casillas_303: Record<string, number>
    resumen_texto: string
    periodo: { limite: string }
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [marcando, setMarcando] = useState(false)

  const calcular = async () => {
    setLoading(true)
    const r = await fetch(`/api/owner/contabilidad/iva?año=${año}&trimestre=${trim}`, { headers: sh() })
    const d = await r.json()
    if (d.ok) setData(d)
    else showToast('Error: ' + d.error)
    setLoading(false)
  }

  const marcarPresentado = async () => {
    setMarcando(true)
    const r = await fetch('/api/owner/contabilidad/iva', {
      method: 'PATCH', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ año, trimestre: trim, estado: 'presentado', fecha_presentacion: new Date().toISOString().split('T')[0] })
    })
    const d = await r.json()
    if (d.ok) showToast('✅ Marcado como presentado')
    setMarcando(false)
  }

  const copiarDatos = () => {
    if (!data) return
    const txt = Object.entries(data.casillas_303)
      .map(([c, v]) => `Casilla ${c}: ${v.toFixed(2)} €`)
      .join('\n')
    navigator.clipboard.writeText(txt)
    showToast('📋 Casillas copiadas al portapapeles')
  }

  return (
    <div>
      {/* Selector período */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={año} onChange={e => setAño(Number(e.target.value))}
          style={{ fontFamily: SN, fontSize: 13, padding: '7px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={trim} onChange={e => setTrim(Number(e.target.value))}
          style={{ fontFamily: SN, fontSize: 13, padding: '7px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink }}>
          {[1, 2, 3, 4].map(t => <option key={t} value={t}>T{t}</option>)}
        </select>
        <button onClick={calcular} disabled={loading}
          style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, padding: '8px 18px', background: loading ? C.rule : C.ink, color: C.paper, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {loading ? 'Calculando…' : '📊 Calcular'}
        </button>
      </div>

      {data && (
        <>
          {/* Resultado principal */}
          <div style={{ background: data.liquidacion.cuota_diferencial > 0 ? '#2E1A0A' : '#0A2614', border: `1px solid ${data.liquidacion.cuota_diferencial > 0 ? C.amber + '44' : '#3F7D4444'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: data.liquidacion.cuota_diferencial > 0 ? C.amber : '#4ADE80', marginBottom: 4 }}>
              {data.resumen_texto}
            </div>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Fecha límite modelo 303: {data.periodo.limite}</div>
          </div>

          {/* Casillas modelo 303 */}
          <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', marginBottom: 10 }}>
              Casillas Modelo 303
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {[
                ['04/05', 'Base/Cuota 10%', data.casillas_303['04'], data.casillas_303['05']],
                ['07/08', 'Base/Cuota 21%', data.casillas_303['07'], data.casillas_303['08']],
                ['27',   'Total IVA repercutido', null, data.casillas_303['27']],
                ['28/29', 'IVA soportado 10%', data.casillas_303['28'], data.casillas_303['29']],
                ['30/31', 'IVA soportado 21%', data.casillas_303['30'], data.casillas_303['31']],
                ['45',   'Total IVA deducible', null, data.casillas_303['45']],
                ['46',   'Diferencia',          null, data.casillas_303['46']],
                ['71',   'Cuota a ingresar',    null, data.casillas_303['71']],
              ].map(([cas, desc, base, cuota]) => (
                <div key={cas as string} style={{ background: C.paper2, borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginBottom: 2 }}>Cas. {cas}</div>
                  <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, marginBottom: 4 }}>{desc}</div>
                  {base != null && <div style={{ fontFamily: SN, fontSize: 11, color: C.ink }}>B: {(base as number).toFixed(2)} €</div>}
                  {cuota != null && <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink }}>C: {(cuota as number).toFixed(2)} €</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copiarDatos}
              style={{ fontFamily: SN, fontSize: 12, padding: '8px 16px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, cursor: 'pointer' }}>
              📋 Copiar casillas
            </button>
            <button onClick={marcarPresentado} disabled={marcando}
              style={{ fontFamily: SN, fontSize: 12, padding: '8px 16px', background: '#3F7D44', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              {marcando ? '…' : '✓ Marcar como presentado'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── EXPORTAR ──────────────────────────────────────────────────────────────────
function ExportarTab({ sh, showToast }: { sh: () => Record<string, string>; showToast: (m: string) => void }) {
  const hoy = new Date()
  const [formato, setFormato] = useState('csv')
  const [desde, setDesde]     = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`)
  const [hasta, setHasta]     = useState(hoy.toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const exportar = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/owner/contabilidad/exportar', {
        method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ formato, desde, hasta })
      })
      if (!r.ok) {
        const d = await r.json(); showToast('Error: ' + d.error); return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') ?? `contabilidad.${formato === 'a3' ? 'dat' : formato}`
      a.click()
      URL.revokeObjectURL(url)
      const n = r.headers.get('X-Asientos') ?? '?'
      showToast(`✅ ${n} asientos exportados`)
    } finally { setLoading(false) }
  }

  const FORMATOS = [
    { id: 'a3',     label: 'A3 Wolters Kluwer', desc: 'SUENLACE.DAT — el más extendido en asesorías españolas' },
    { id: 'sage',   label: 'Sage 50 / Business Cloud', desc: 'CSV compatible con Sage' },
    { id: 'holded', label: 'Holded', desc: 'CSV para Holded / Contasimple / Anfix' },
    { id: 'csv',    label: 'CSV genérico', desc: 'Compatible con cualquier software o Excel' },
    { id: 'json',   label: 'JSON',         desc: 'Para integraciones personalizadas o API' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', marginBottom: 10 }}>Formato</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FORMATOS.map(f => (
            <label key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: formato === f.id ? C.ink + '11' : C.bone, border: `1.5px solid ${formato === f.id ? C.ink : C.rule}`, borderRadius: 8, cursor: 'pointer' }}>
              <input type="radio" value={f.id} checked={formato === f.id} onChange={() => setFormato(f.id)} style={{ marginTop: 2, accentColor: C.ink }} />
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{f.label}</div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{f.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', marginBottom: 6 }}>Desde</div>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            style={{ width: '100%', fontFamily: SN, fontSize: 13, padding: '8px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', marginBottom: 6 }}>Hasta</div>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ width: '100%', fontFamily: SN, fontSize: 13, padding: '8px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      <button onClick={exportar} disabled={loading}
        style={{ width: '100%', padding: '12px', background: loading ? C.rule : C.ink, color: C.paper, fontFamily: SN, fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 10, cursor: loading ? 'default' : 'pointer' }}>
        {loading ? 'Generando fichero…' : `📤 Exportar asientos en ${FORMATOS.find(f => f.id === formato)?.label}`}
      </button>
    </div>
  )
}

// ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
function ConfigTab({ sh, showToast }: { sh: () => Record<string, string>; showToast: (m: string) => void }) {
  const [cfg, setCfg]     = useState<Record<string, string | number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/owner/contabilidad/config', { headers: sh() })
      .then(r => r.json())
      .then(d => d.config && setCfg(d.config))
  }, [])

  const save = async () => {
    setSaving(true)
    const r = await fetch('/api/owner/contabilidad/config', {
      method: 'PUT', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    })
    const d = await r.json()
    if (d.ok) showToast('✅ Configuración guardada')
    else showToast('Error: ' + d.error)
    setSaving(false)
  }

  const field = (label: string, key: string, type: 'text' | 'select' | 'email' = 'text', options?: { value: string; label: string }[]) => (
    <div key={key} style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{label}</div>
      {type === 'select' && options ? (
        <select value={String(cfg[key] ?? '')} onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
          style={{ width: '100%', fontFamily: SN, fontSize: 13, padding: '8px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink }}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={String(cfg[key] ?? '')} onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
          style={{ width: '100%', fontFamily: SN, fontSize: 13, padding: '8px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, outline: 'none', boxSizing: 'border-box' as const }} />
      )}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>Régimen fiscal</div>
          {field('Tipo de régimen', 'regimen_fiscal', 'select', [
            { value: 'irpf_directa', label: 'IRPF Estimación Directa (autónomo)' },
            { value: 'irpf_modulos', label: 'IRPF Módulos (autónomo)' },
            { value: 'is',           label: 'Impuesto sobre Sociedades (SL/SA)' },
          ])}
          {field('Régimen IVA', 'iva_regimen', 'select', [
            { value: 'general',      label: 'General (10% / 21%)' },
            { value: 'simplificado', label: 'Simplificado (módulos)' },
            { value: 'igic',         label: 'IGIC — Canarias' },
          ])}
          {field('Ejercicio fiscal', 'ejercicio_actual')}
          {field('Formato exportación preferido', 'formato_exportacion', 'select', [
            { value: 'a3',     label: 'A3 / Wolters Kluwer' },
            { value: 'sage',   label: 'Sage 50' },
            { value: 'holded', label: 'Holded / Contasimple' },
            { value: 'csv',    label: 'CSV genérico' },
            { value: 'json',   label: 'JSON' },
          ])}

          {/* ── INVITAR CONTABLE / ASESORÍA ── */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Contable / Asesoría
            </div>
            <InvitarContable sh={sh} />
          </div>
        </div>
        <div>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>Plan de cuentas (PGC)</div>
          {[
            ['Ventas 10%',           'cuenta_ventas_10'],
            ['Ventas 21%',           'cuenta_ventas_21'],
            ['Compras mercaderías',  'cuenta_compras_mercancias'],
            ['Compras materias',     'cuenta_compras_materias'],
            ['IVA repercutido',      'cuenta_iva_repercutido'],
            ['IVA soportado',        'cuenta_iva_soportado'],
            ['Caja',                 'cuenta_caja'],
            ['Bancos / TPV',         'cuenta_bancos'],
            ['Propinas',             'cuenta_propinas'],
          ].map(([label, key]) => field(label, key))}
        </div>
      </div>
      <button onClick={save} disabled={saving}
        style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, padding: '10px 24px', background: saving ? C.rule : C.ink, color: C.paper, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
        {saving ? 'Guardando…' : '💾 Guardar configuración'}
      </button>
    </div>
  )
}

// ── INVITAR CONTABLE ──────────────────────────────────────────────────────────
function InvitarContable({ sh }: { sh: () => Record<string, string> }) {
  const [email, setEmail]     = useState('')
  const [nombre, setNombre]   = useState('')
  const [asesoria, setAsesoria] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState('')

  const invitar = async () => {
    if (!email || !nombre) return
    setLoading(true); setMsg('')
    const r = await fetch('/api/owner/contabilidad/invitar', {
      method: 'POST',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, nombre, nombre_asesoria: asesoria || null }),
    })
    const d = await r.json()
    if (d.ok) {
      setMsg(d.nuevo_contable
        ? `✅ Invitación enviada a ${email}. Recibirá su PIN por email.`
        : `✅ ${nombre} ya tenía cuenta. ${email} puede acceder desde su portal.`)
      setEmail(''); setNombre(''); setAsesoria('')
    } else {
      setMsg('Error: ' + d.error)
    }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 10, lineHeight: 1.5 }}>
        El contable o asesoría recibirá acceso al portal{' '}
        <strong style={{ color: C.ink }}>www.iarest.es/asesoria</strong> con email y PIN generado automáticamente.
        Si ya tiene otros clientes en ia.rest, este restaurante se añade a su lista.
      </div>

      {[
        { label: 'Email del contable', val: email, set: setEmail, type: 'email', ph: 'contable@asesoria.es' },
        { label: 'Nombre', val: nombre, set: setNombre, type: 'text', ph: 'Ricardo Fernández' },
        { label: 'Nombre de la asesoría (opcional)', val: asesoria, set: setAsesoria, type: 'text', ph: 'Asesoría García & Asociados' },
      ].map(({ label, val, set, type, ph }) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>{label}</div>
          <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
            style={{ width: '100%', padding: '8px 10px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, fontFamily: SN, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
      ))}

      {msg && (
        <div style={{ fontFamily: SN, fontSize: 12, padding: '8px 10px', borderRadius: 8, marginBottom: 8,
          background: msg.startsWith('✅') ? '#0A2E14' : '#2E1010',
          color:      msg.startsWith('✅') ? '#4ADE80' : '#F87171' }}>
          {msg}
        </div>
      )}

      <button onClick={invitar} disabled={loading || !email || !nombre}
        style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, padding: '8px 16px', background: loading || !email || !nombre ? C.rule : C.ink, color: C.paper, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
        {loading ? 'Enviando…' : '📧 Invitar al portal de contabilidad'}
      </button>
    </div>
  )
}
