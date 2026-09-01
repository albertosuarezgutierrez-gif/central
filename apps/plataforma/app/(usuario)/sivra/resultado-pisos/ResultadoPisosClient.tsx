'use client'
// Rendimiento de los pisos: P&L por rango de meses, KPIs con interanual, gráficas, previsión
// con seguimiento, canales, cancelaciones y estacionalidad. El intervalo y el piso viven en la
// URL; el filtro por piso es de presentación (se recalcula en cliente con la MISMA lógica pura
// `agregarPisos` que usa el servidor — una sola fórmula del agregado).
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { eur } from '@/lib/dinero'
import type { PLRango } from '@/lib/sivra/pl-rango'
import type { PLMensual, PLPiso } from '@/lib/sivra/pl-mensual'
import { agregarPisos, variacionPct, adr, ocupacionPct, diasDelMes } from '@/lib/sivra/pl-rango-logica'
import { PORTAL_COLORS, PORTAL_LABELS } from '@/lib/portales'
import { estadoComision, hayTarifasPendientes } from '@/lib/sivra/canales-logica'
import { card, colorMargen, nombreMesLargo } from './compartido'
import GraficasRango from './GraficasRango'
import PrevisionPanel from './PrevisionPanel'
import HeatmapEstacionalidad from './HeatmapEstacionalidad'
import DesgloseLimpieza from './DesgloseLimpieza'

function mesStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function defectoRango(): { desde: string; hasta: string } {
  // Por defecto, el año en curso hasta el mes actual: la foto de «cómo va el año».
  const hoy = new Date()
  return { desde: `${hoy.getFullYear()}-01`, hasta: mesStr(hoy) }
}

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/

export default function ResultadoPisosClient({ desdeInicial, hastaInicial, pisoInicial }: {
  desdeInicial: string | null
  hastaInicial: string | null
  pisoInicial: string
}) {
  const def = defectoRango()
  const [desde, setDesde] = useState(desdeInicial && RE_MES.test(desdeInicial) ? desdeInicial : def.desde)
  const [hasta, setHasta] = useState(hastaInicial && RE_MES.test(hastaInicial) ? hastaInicial : def.hasta)
  const [piso, setPiso] = useState(pisoInicial)
  const [data, setData] = useState<PLRango | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const primeraCarga = useRef(true)

  const load = useCallback(async (d: string, h: string, fresco = false) => {
    setCargando(true)
    setError('')
    try {
      const r = await fetch(`/api/sivra/pl-rango?desde=${d}&hasta=${h}${fresco ? '&fresco=1' : ''}`)
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setError(j?.error ?? 'Error cargando datos')
        return
      }
      setData(await r.json())
    } catch { setError('Error de red') }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { load(desde, hasta) }, [desde, hasta, load])

  // El estado vive en la URL (para compartir/volver), sin recargar la página.
  useEffect(() => {
    if (primeraCarga.current) { primeraCarga.current = false; return }
    const p = new URLSearchParams({ desde, hasta })
    if (piso) p.set('piso', piso)
    router.replace(`/sivra/resultado-pisos?${p.toString()}`, { scroll: false })
  }, [desde, hasta, piso, router])

  // ── Filtro por piso: presentación pura, misma fórmula que el servidor ──
  const mesesF = useMemo(() => filtrarMeses(data?.meses ?? [], piso), [data, piso])
  const mesesAntF = useMemo(() => filtrarMeses(data?.anterior?.meses ?? [], piso), [data, piso])
  const agregado = useMemo(() => agregarPisos(mesesF), [mesesF])
  const agregadoAnt = useMemo(
    () => (data?.anterior ? agregarPisos(mesesAntF) : null),
    [data, mesesAntF],
  )

  const tot = useMemo(() => totales(agregado), [agregado])
  const totAnt = useMemo(() => (agregadoAnt ? totales(agregadoAnt) : null), [agregadoAnt])

  const unMes = desde === hasta
  const nPisos = agregado.length
  const diasRango = useMemo(
    () => (data?.meses ?? []).reduce((s, m) => s + diasDelMes(m.mes), 0),
    [data],
  )

  const pisosSelector = data?.meses.length
    ? data.meses[data.meses.length - 1].pisos.map(p => ({ id: p.propertyId, nombre: p.nombre }))
    : []

  const tituloRango = unMes
    ? nombreMesLargo(desde)
    : `${nombreMesLargo(desde)} → ${nombreMesLargo(hasta)}`

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <style>{`@media (max-width:768px){.rp-kpis{grid-template-columns:1fr 1fr!important}.rp-sel{flex-direction:column;align-items:stretch!important}.rp-sel input,.rp-sel select{width:100%}}`}</style>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Rendimiento por piso</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'capitalize' }}>{tituloRango}</span>
      </div>

      <Selector
        desde={desde} hasta={hasta} piso={piso} pisos={pisosSelector}
        onRango={(d, h) => { setDesde(d); setHasta(h) }}
        onPiso={setPiso}
        onCsv={() => exportarCsv(mesesF, `resultado-pisos_${desde}_${hasta}.csv`)}
      />

      {error && <p style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}
      {cargando && !data && <p style={{ color: 'var(--muted)' }}>Calculando…</p>}

      {data && (
        <div style={{ opacity: cargando ? 0.55 : 1, transition: 'opacity .15s' }}>
          {/* ── KPIs del periodo, con Δ contra el mismo periodo del año anterior ── */}
          <div className="rp-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '18px 0 24px' }}>
            <Kpi label="Ingresos" valor={eur(tot.ingresos)} color="var(--primary)"
              delta={variacionPct(tot.ingresos, totAnt?.ingresos ?? null)} base={totAnt?.ingresos ?? null} />
            <Kpi label="Gastos" valor={eur(tot.gastos)} color="var(--muted)"
              delta={variacionPct(tot.gastos, totAnt?.gastos ?? null)} base={totAnt?.gastos ?? null} deltaMaloSiSube />
            <Kpi label="Resultado" valor={eur(tot.resultado)}
              color={tot.resultado >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'}
              delta={variacionPct(tot.resultado, totAnt && totAnt.resultado > 0 ? totAnt.resultado : null)}
              base={totAnt?.resultado ?? null} />
            <Kpi label="Margen" valor={tot.ingresos > 0 ? `${Math.round((tot.resultado / tot.ingresos) * 100)} %` : '—'}
              color={colorMargen(tot.ingresos > 0 ? Math.round((tot.resultado / tot.ingresos) * 100) : 0)} />
            <Kpi label="Precio medio/noche" valor={adrTexto(tot.ingresos, tot.noches, tot.nochesSinDato)} color="var(--text)"
              sub={tot.nochesSinDato > 0 ? `${tot.nochesSinDato} reserva(s) sin noches conocidas` : `${tot.noches} noches`} />
            <Kpi label="Ocupación" valor={ocupacionTexto(tot.noches, diasRango * nPisos)} color="var(--text)"
              sub="por mes de entrada" />
          </div>

          <GraficasRango meses={mesesF} mesesAnterior={data.anterior ? mesesAntF : null} agregado={agregado} pisoFiltrado={!!piso} />

          <PrevisionPanel piso={piso} />

          {/* En vista de UN mes se conserva el desglose de limpieza (es específico del mes). */}
          {unMes && data.meses.length === 1 && (
            <DesgloseLimpieza desglose={data.meses[0].desglose} onCambio={() => load(desde, hasta, true)} />
          )}

          <Canales data={data} piso={piso} totalNeto={tot.ingresos} />
          <Cancelaciones data={data} piso={piso} />

          {/* ── Tabla detallada (agregado del rango) ── */}
          <TablaPisos agregado={agregado} unMes={unMes} />

          <HeatmapEstacionalidad piso={piso} />

          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
            Ingresos y noches por mes de ENTRADA de la reserva; gastos por CAJA del mes (si un mes se
            pagan dos facturas, salen las dos). La lavandería compartida se reparte por huéspedes reales
            del mes (capacidad si el aforo no consta) y cada pago a Sique Brilla se desglosa con SU
            factura cuando está aportada. Los gastos sin asignar a piso (EMASESA, etc.) no están
            incluidos aún. La comparativa «vs año anterior» usa exactamente el mismo cálculo sobre el
            mismo rango desplazado un año.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Helpers de presentación ──────────────────────────────────────────────────

function filtrarMeses(meses: PLMensual[], piso: string): PLMensual[] {
  if (!piso) return meses
  return meses.map(m => ({ ...m, pisos: m.pisos.filter(p => p.propertyId === piso) }))
}

function totales(agregado: PLPiso[]) {
  return agregado.reduce(
    (a, p) => ({
      ingresos: Math.round((a.ingresos + p.ingresos) * 100) / 100,
      gastos: Math.round((a.gastos + p.gastos.total) * 100) / 100,
      resultado: Math.round((a.resultado + p.resultado) * 100) / 100,
      reservas: a.reservas + p.reservas,
      noches: a.noches + p.noches,
      nochesSinDato: a.nochesSinDato + p.nochesSinDato,
    }),
    { ingresos: 0, gastos: 0, resultado: 0, reservas: 0, noches: 0, nochesSinDato: 0 },
  )
}

function adrTexto(ingresos: number, noches: number, sinDato: number): string {
  const v = adr(ingresos, noches)
  if (v == null) return sinDato > 0 ? 'sin noches conocidas' : '—'
  return eur(v)
}

function ocupacionTexto(noches: number, disponibles: number): string {
  const v = ocupacionPct(noches, disponibles)
  return v == null ? '—' : `${v} %`
}

function Kpi({ label, valor, color, delta, base, sub, deltaMaloSiSube }: {
  label: string; valor: string; color: string
  delta?: number | null; base?: number | null; sub?: string; deltaMaloSiSube?: boolean
}) {
  const tieneDelta = delta != null
  const bueno = deltaMaloSiSube ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{valor}</div>
      {tieneDelta ? (
        <div style={{ fontSize: 12, marginTop: 4, color: bueno ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
          {delta! > 0 ? '▲' : delta! < 0 ? '▼' : '—'} {delta! > 0 ? '+' : ''}{delta}% vs año ant.
          {base != null && <span style={{ color: 'var(--muted)' }}> ({eur(base)})</span>}
        </div>
      ) : base != null && base !== 0 ? (
        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--muted)' }}>año ant.: {eur(base)}</div>
      ) : sub ? (
        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--muted)' }}>{sub}</div>
      ) : null}
    </div>
  )
}

function Selector({ desde, hasta, piso, pisos, onRango, onPiso, onCsv }: {
  desde: string; hasta: string; piso: string
  pisos: Array<{ id: string; nombre: string }>
  onRango: (d: string, h: string) => void
  onPiso: (p: string) => void
  onCsv: () => void
}) {
  const hoy = new Date()
  const mesActual = mesStr(hoy)
  const presets: Array<{ label: string; d: string; h: string }> = [
    { label: 'Mes pasado', ...mesPasado(hoy) },
    { label: 'Este mes', d: mesActual, h: mesActual },
    { label: `Año ${hoy.getFullYear()}`, d: `${hoy.getFullYear()}-01`, h: mesActual },
    { label: 'Últimos 12 meses', d: mesStr(new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)), h: mesActual },
  ]
  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
    fontSize: 14, background: 'var(--surface)', color: 'var(--text)', minHeight: 40,
  }
  return (
    <div className="rp-sel" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
      {presets.map(p => {
        const activo = p.d === desde && p.h === hasta
        return (
          <button key={p.label} onClick={() => onRango(p.d, p.h)} style={{
            ...inputStyle, cursor: 'pointer', minHeight: 40,
            background: activo ? 'var(--primary)' : 'var(--surface)',
            color: activo ? '#fff' : 'var(--text)',
            borderColor: activo ? 'var(--primary)' : 'var(--border)',
          }}>
            {p.label}
          </button>
        )
      })}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input type="month" value={desde} max={hasta} onChange={e => e.target.value && onRango(e.target.value, hasta)} style={inputStyle} aria-label="Desde" />
        <span style={{ color: 'var(--muted)' }}>→</span>
        <input type="month" value={hasta} min={desde} onChange={e => e.target.value && onRango(desde, e.target.value)} style={inputStyle} aria-label="Hasta" />
      </span>
      <select value={piso} onChange={e => onPiso(e.target.value)} style={inputStyle} aria-label="Piso">
        <option value="">Todos los pisos</option>
        {pisos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <button onClick={onCsv} style={{ ...inputStyle, cursor: 'pointer' }} title="Descargar el detalle mes a mes en CSV">
        ⬇️ CSV
      </button>
    </div>
  )
}

function mesPasado(hoy: Date): { d: string; h: string } {
  const m = mesStr(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1))
  return { d: m, h: m }
}

// ── Canales ──────────────────────────────────────────────────────────────────

function Canales({ data, piso, totalNeto }: { data: PLRango; piso: string; totalNeto: number }) {
  const filas = useMemo(() => {
    const porPortal = new Map<string, { neto: number; comision: number; reservas: number; sinBruto: number; tarifaPct: number | null }>()
    for (const c of data.canales) {
      if (piso && c.propertyId !== piso) continue
      const a = porPortal.get(c.portal) ?? { neto: 0, comision: 0, reservas: 0, sinBruto: 0, tarifaPct: c.tarifaPct }
      a.neto += c.neto; a.comision += c.comision; a.reservas += c.reservas; a.sinBruto += c.sinBruto
      porPortal.set(c.portal, a)
    }
    return [...porPortal.entries()]
      .map(([portal, v]) => ({ portal, ...v }))
      .sort((a, b) => b.neto - a.neto)
  }, [data, piso])

  if (filas.length === 0) return null
  const sinBrutoTotal = filas.reduce((s, f) => s + f.sinBruto, 0)
  const pendientes = hayTarifasPendientes(filas)

  return (
    <section style={{ ...card, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>🛎️ Canales del periodo</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {filas.map(f => {
          const pct = totalNeto > 0 ? Math.round((f.neto / totalNeto) * 100) : 0
          return (
            <div key={f.portal} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: PORTAL_COLORS[f.portal] ?? PORTAL_COLORS.OTRO, flex: '0 0 auto' }} />
              <span style={{ fontWeight: 600, minWidth: 90 }}>{PORTAL_LABELS[f.portal] ?? f.portal}</span>
              <div style={{ flex: '1 1 120px', height: 8, background: 'var(--surface-2, var(--border))', borderRadius: 4, overflow: 'hidden', minWidth: 80 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: PORTAL_COLORS[f.portal] ?? PORTAL_COLORS.OTRO }} />
              </div>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                {eur(f.neto)} <span style={{ color: 'var(--muted)' }}>({pct}% · {f.reservas} res.)</span>
              </span>
              <EtiquetaComision fila={f} />
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
        La comisión es la REAL medida (bruto − neto de cada reserva).
        {sinBrutoTotal > 0 && ` En ${sinBrutoTotal} reserva(s) el bruto no consta: su comisión NO está en estas cifras.`}
      </p>
      {pendientes.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--warning, #ca8a04)', margin: '6px 0 0' }}>
          ⚠️ {pendientes.map(p => PORTAL_LABELS[p] ?? p).join(', ')}: su tarifa está «pendiente de
          confirmar» en portal_rates, así que el ingreso mostrado va SIN descontar su comisión real
          (no es que salgan gratis). Con una factura suya delante se fija la tarifa y esto desaparece.
        </p>
      )}
    </section>
  )
}

function EtiquetaComision({ fila }: { fila: { portal: string; comision: number; sinBruto: number; tarifaPct: number | null } }) {
  const e = estadoComision(fila)
  const texto =
    e.tipo === 'medida' ? `comisión ${eur(e.importe)}`
    : e.tipo === 'sin_bruto' ? `comisión no consta (${e.reservas} res.)`
    : e.tipo === 'sin_comision' ? 'sin comisión'
    : '⚠️ comisión sin descontar (tarifa pendiente)'
  return (
    <span style={{ fontSize: 12, whiteSpace: 'nowrap', color: e.tipo === 'tarifa_pendiente' ? 'var(--warning, #ca8a04)' : 'var(--muted)' }}>
      {texto}
    </span>
  )
}

// ── Cancelaciones ────────────────────────────────────────────────────────────

function Cancelaciones({ data, piso }: { data: PLRango; piso: string }) {
  const c = data.cancelaciones
  const filas = piso ? c.filas.filter(f => f.propertyId === piso) : c.filas
  const tot = filas.reduce(
    (a, f) => ({ n: a.n + f.n, perdido: a.perdido + f.perdidoBruto, sinImporte: a.sinImporte + f.sinImporte, noches: a.noches + f.noches, sinNoches: a.sinNoches + f.sinNoches }),
    { n: 0, perdido: 0, sinImporte: 0, noches: 0, sinNoches: 0 },
  )
  // Sin cancelaciones Y el rango cubre el registro: eso sí es un «no hubo» afirmable.
  if (tot.n === 0 && !c.rangoAnteriorAlRegistro) return null
  return (
    <section style={{ ...card, marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>📉 Cancelaciones del periodo</h2>
      {tot.n > 0 ? (
        <p style={{ margin: 0, fontSize: 14 }}>
          {tot.n} reserva(s) canceladas · {eur(tot.perdido)} brutos perdidos
          {tot.sinImporte > 0 && <span style={{ color: 'var(--muted)' }}> (+{tot.sinImporte} sin importe conocido)</span>}
          {' · '}{tot.noches} noches
          {tot.sinNoches > 0 && <span style={{ color: 'var(--muted)' }}> (+{tot.sinNoches} sin noches calculables)</span>}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>Ninguna cancelación registrada en la parte del rango con registro.</p>
      )}
      {c.rangoAnteriorAlRegistro && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
          ⚠️ El registro de cancelaciones existe desde el {c.registroDesde.split('-').reverse().join('/')}: de lo
          anterior NO se sabe (las canceladas de entonces se borraron sin dejar rastro), no es que no hubiera.
        </p>
      )}
    </section>
  )
}

// ── Tabla detallada ──────────────────────────────────────────────────────────

function TablaPisos({ agregado, unMes }: { agregado: PLPiso[]; unMes: boolean }) {
  const tot = totales(agregado)
  const totGastos = agregado.reduce((a, p) => ({
    lavanderia: a.lavanderia + p.gastos.lavanderia,
    limpieza: a.limpieza + p.gastos.limpieza,
    alquiler: a.alquiler + p.gastos.alquiler,
    suministros: a.suministros + p.gastos.suministros,
    comunidad: a.comunidad + p.gastos.comunidad,
    otros: a.otros + p.gastos.otros,
  }), { lavanderia: 0, limpieza: 0, alquiler: 0, suministros: 0, comunidad: 0, otros: 0 })
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surface-2, var(--surface))', textAlign: 'right' }}>
            <Th left>Piso</Th>
            <Th>Reservas</Th>
            <Th>Noches</Th>
            <Th>Ingresos</Th>
            <Th>Lavandería</Th>
            <Th>Limpieza</Th>
            <Th>Alquiler</Th>
            <Th>Suministros</Th>
            <Th>Comunidad</Th>
            <Th>Otros</Th>
            <Th>Total gastos</Th>
            <Th>Resultado</Th>
            <Th>Margen</Th>
          </tr>
        </thead>
        <tbody>
          {agregado.map(p => (
            <tr key={p.propertyId} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                {p.nombre}
                <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>({p.maxHuespedes} plazas)</span>
              </td>
              <td style={tdR}>{p.reservas}</td>
              <td style={tdR} title={p.nochesSinDato > 0 ? `${p.nochesSinDato} reserva(s) sin noches conocidas` : undefined}>
                {p.noches}{p.nochesSinDato > 0 ? '⁺' : ''}
              </td>
              <td style={tdR}>{eur(p.ingresos)}</td>
              <CeldaGasto v={p.gastos.lavanderia} detalle={detalleLavanderia(p)} />
              <CeldaGasto v={p.gastos.limpieza} />
              <CeldaGasto v={p.gastos.alquiler} />
              <CeldaGasto v={p.gastos.suministros} />
              <CeldaGasto v={p.gastos.comunidad} />
              <CeldaGasto v={p.gastos.otros} />
              <td style={{ ...tdR, fontWeight: 600 }}>{eur(p.gastos.total)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: p.resultado >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>{eur(p.resultado)}</td>
              <td style={{ ...tdR, fontWeight: 700, color: colorMargen(p.margen) }}>{p.ingresos > 0 ? `${p.margen} %` : '—'}</td>
            </tr>
          ))}
          {agregado.length > 1 && (
            <tr style={{ background: 'var(--surface-2, var(--surface))', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
              <td style={{ padding: '10px 8px' }}>TOTAL</td>
              <td style={tdR}>{tot.reservas}</td>
              <td style={tdR}>{tot.noches}{tot.nochesSinDato > 0 ? '⁺' : ''}</td>
              <td style={tdR}>{eur(tot.ingresos)}</td>
              <td style={tdR}>{totGastos.lavanderia > 0 ? eur(totGastos.lavanderia) : '—'}</td>
              <td style={tdR}>{totGastos.limpieza > 0 ? eur(totGastos.limpieza) : '—'}</td>
              <td style={tdR}>{totGastos.alquiler > 0 ? eur(totGastos.alquiler) : '—'}</td>
              <td style={tdR}>{totGastos.suministros > 0 ? eur(totGastos.suministros) : '—'}</td>
              <td style={tdR}>{totGastos.comunidad > 0 ? eur(totGastos.comunidad) : '—'}</td>
              <td style={tdR}>{totGastos.otros > 0 ? eur(totGastos.otros) : '—'}</td>
              <td style={tdR}>{eur(tot.gastos)}</td>
              <td style={{ ...tdR, color: tot.resultado >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>{eur(tot.resultado)}</td>
              <td style={{ ...tdR, color: colorMargen(tot.ingresos > 0 ? Math.round((tot.resultado / tot.ingresos) * 100) : 0) }}>
                {tot.ingresos > 0 ? `${Math.round((tot.resultado / tot.ingresos) * 100)} %` : '—'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!unMes && (
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>
          Cifras agregadas del rango. Para el desglose de limpieza de un mes concreto, selecciona ese mes.
        </p>
      )}
    </div>
  )
}

function detalleLavanderia(p: PLPiso): string | undefined {
  const d = p.gastos.lavanderiaDetalle
  if (!d || p.gastos.lavanderia <= 0) return undefined
  const partes: string[] = []
  if (d.giraldillo > 0) partes.push(`El Giraldillo: ${eur(d.giraldillo)}`)
  if (d.siqueBrilla > 0) partes.push(`Incluida en factura de Sique Brilla: ${eur(d.siqueBrilla)}`)
  const resto = p.gastos.lavanderia - d.giraldillo - d.siqueBrilla
  if (resto > 0.01) partes.push(`Facturas del piso: ${eur(resto)}`)
  return partes.join(' · ')
}

function CeldaGasto({ v, detalle }: { v: number; detalle?: string }) {
  return (
    <td style={{ ...tdR, color: v > 0 ? 'inherit' : 'var(--muted)' }} title={detalle}>
      {v > 0 ? eur(v) : '—'}
    </td>
  )
}

function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return (
    <th style={{ padding: '8px 8px', fontWeight: 600, fontSize: 12, textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
      {children}
    </th>
  )
}

const tdR: React.CSSProperties = { padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }

// ── Export CSV (formato Excel es-ES: separador ';', decimales con coma) ─────

function exportarCsv(meses: PLMensual[], nombre: string) {
  const num = (n: number) => n.toFixed(2).replace('.', ',')
  const filas = [
    ['Mes', 'Piso', 'Reservas', 'Noches', 'Ingresos', 'Lavandería', 'Limpieza', 'Alquiler', 'Suministros', 'Comunidad', 'Otros', 'Total gastos', 'Resultado', 'Margen %'].join(';'),
  ]
  for (const m of meses) {
    for (const p of m.pisos) {
      filas.push([
        m.mes, p.nombre, p.reservas, p.noches, num(p.ingresos),
        num(p.gastos.lavanderia), num(p.gastos.limpieza), num(p.gastos.alquiler),
        num(p.gastos.suministros), num(p.gastos.comunidad), num(p.gastos.otros),
        num(p.gastos.total), num(p.resultado), p.ingresos > 0 ? p.margen : '',
      ].join(';'))
    }
  }
  // BOM para que Excel abra el UTF-8 con tildes bien.
  const blob = new Blob(['﻿' + filas.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
