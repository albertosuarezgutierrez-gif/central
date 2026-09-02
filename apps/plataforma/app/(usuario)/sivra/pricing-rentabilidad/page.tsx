'use client'

import { useEffect, useState } from 'react'
import { eur } from '@/lib/dinero'

// Estudio «Motor vs PriceLabs» — la pregunta de Alberto (25/08/2026): ¿el motor propio
// renta frente a lo que hacía PriceLabs? Tres piezas honestas, cada una con su estado:
// backtest lista-vs-lista, ventas por cohorte de reserva y la serie de coste de PL.
// La métrica PRERREGISTRADA del veredicto es RevPAR neto por piso al cierre de sept-nov.

const C = {
  ink: '#1A2535', soft: '#6B7F96', line: '#E8EDF3',
  bg: '#F6F8FB', card: '#FFFFFF', warn: '#C2410C', ok: 'var(--positive)', bad: 'var(--negative)',
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const NOMBRE: Record<string, string> = {
  prop_busto_reform: 'Busto Reform',
  prop_luxury_busto: 'Luxury Busto',
  prop_duplex_center: 'Dúplex Center',
  prop_house_sevillana: 'House Sevillana',
}

type Backtest = {
  property_id: string
  estado: 'completa' | 'parcial' | 'sin_datos' | 'sin_referencia'
  noches_vendidas: number
  noches_comparables: number
  noches_sin_precio_motor: number
  delta_eur: number | null
  delta_pct: number | null
}
type Mercado = {
  property_id: string
  estado: 'completa' | 'parcial' | 'sin_datos'
  noches_vendidas: number
  con_precio_motor: number
  noches_comparables: number
  delta_eur: number | null
  delta_pct: number | null
}
type Cohorte = { property_id: string; mes: string; reservas: number; noches: number; bruto: number | null; neto: number | null }
type Celda = { bruto: number; noches: number; reservas: number }
type MesComparado = {
  property_id: string; mesNum: number; mes: string
  regimen: 'cerrado' | 'en_curso' | 'cartera'
  atribucion: 'no' | 'parcial' | 'si'
  actual: Celda; previo: Celda; deltaEur: number; deltaPct: number | null
}
type Totales = { actual: Celda; previo: Celda; deltaEur: number; deltaPct: number | null }
type Anual = {
  anio: number; corte_actual: string; corte_previo: string
  serie: MesComparado[]; total: Totales; total_consumido: Totales; total_cartera: Totales
}
type Data = {
  backtest: Backtest[]
  mercado: Mercado[]
  cohorte: Cohorte[]
  hueco_2025: { reparado: boolean; meses_vacios: string[] }
  gastos_pricelabs: { fecha: string; total: number }[]
  referencia_pl: { caduca: string; dias_restantes: number }
  go_live: Record<string, string>
  anual: Anual
  nota: string
}

const ESTADO_TXT: Record<Backtest['estado'], { txt: string; color: string }> = {
  completa: { txt: 'cobertura completa', color: C.ok },
  parcial: { txt: 'cobertura parcial', color: C.warn },
  sin_datos: { txt: 'sin precio del motor aplicado — pendiente', color: C.warn },
  sin_referencia: { txt: 'sin curva PL genuina (no comparable)', color: C.soft },
}

export default function PricingRentabilidadPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sivra/pricing/rentabilidad')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <div style={{ padding: 20, color: C.bad }}>No se pudo cargar el estudio: {error}</div>
  if (!data) return <div style={{ padding: 20, color: C.soft }}>Cargando estudio…</div>

  // Cohorte agrupada por mes (columnas = pisos) para la tabla.
  const meses = [...new Set(data.cohorte.map((c) => c.mes))].sort()
  const pisos = Object.keys(NOMBRE)
  const celda = (mes: string, pid: string) => data.cohorte.find((c) => c.mes === mes && c.property_id === pid)

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 16 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: C.ink, margin: '0 0 4px' }
  const sub: React.CSSProperties = { fontSize: 12, color: C.soft, margin: '0 0 12px' }
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: C.soft, textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 8px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', fontSize: 13, color: C.ink, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }

  return (
    <div style={{ padding: '16px', maxWidth: 1000, margin: '0 auto', background: C.bg, minHeight: '100vh' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink, margin: '0 0 4px' }}>Motor vs PriceLabs</h1>
      <p style={{ ...sub, marginBottom: 16 }}>
        Veredicto prerregistrado: <b>RevPAR neto por piso al cierre de sept-nov 2026</b>. Hasta entonces, esto
        mide lo medible sin engañarse. {data.nota}
      </p>

      {/* Caducidad del contrafactual */}
      <div style={{ ...card, borderLeft: `4px solid ${data.referencia_pl.dias_restantes < 30 ? C.bad : C.warn}` }}>
        <div style={{ fontSize: 13, color: C.ink }}>
          ⏳ La curva PriceLabs congelada (el único contrafactual) caduca el <b>{data.referencia_pl.caduca}</b> —
          quedan <b>{data.referencia_pl.dias_restantes} días</b>. Después, sin espejo de PL no habrá contra qué comparar.
        </div>
      </div>

      {/* 1 · Backtest */}
      <div style={card}>
        <h2 style={h2}>1 · Backtest lista-vs-lista (noches ya vendidas bajo el motor)</h2>
        <p style={sub}>
          Precio de lista del motor al reservarse vs el que pedía la curva PL para esa noche. Negativo = el motor
          pidió menos. No dice cuántas noches habría vendido PL a su precio.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>Piso</th><th style={th}>Vendidas</th><th style={th}>Comparables</th>
              <th style={th}>Δ € (motor − PL)</th><th style={th}>Δ %</th><th style={th}>Estado</th>
            </tr></thead>
            <tbody>
              {data.backtest.map((b) => (
                <tr key={b.property_id}>
                  <td style={td}>{NOMBRE[b.property_id] ?? b.property_id}</td>
                  <td style={td}>{b.noches_vendidas}</td>
                  <td style={td}>{b.estado === 'sin_referencia' ? '—' : b.noches_comparables}</td>
                  <td style={{ ...td, color: b.delta_eur == null ? C.soft : b.delta_eur < 0 ? C.warn : C.ok }}>
                    {b.delta_eur == null ? 'sin dato' : eur(b.delta_eur)}
                  </td>
                  <td style={td}>{b.delta_pct == null ? '—' : `${b.delta_pct.toFixed(1)}%`}</td>
                  <td style={{ ...td, color: ESTADO_TXT[b.estado].color, fontSize: 12 }}>
                    {ESTADO_TXT[b.estado].txt}
                    {b.noches_sin_precio_motor > 0 ? ` (${b.noches_sin_precio_motor} noches sin precio motor)` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1-bis · Motor vs mercado real */}
      <div style={card}>
        <h2 style={h2}>1-bis · Motor vs mercado real (Booking) — no caduca</h2>
        <p style={sub}>
          Las mismas noches vendidas, contra la <b>mediana de los comparables fiables de Booking</b> de esa noche
          (medidos a ±10 días de la reserva, normalizados por aforo, ≥5 comps o no se juzga). Positivo = vendimos
          por encima de la mediana de la competencia. El corpus fiable nació el 06/08/2026: la cobertura crece a
          diario con la rutina de mercado, y este bloque releva a PriceLabs cuando su curva caduque.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>Piso</th><th style={th}>Vendidas</th><th style={th}>Con mercado</th>
              <th style={th}>Δ € (motor − p50)</th><th style={th}>Δ %</th><th style={th}>Estado</th>
            </tr></thead>
            <tbody>
              {data.mercado.map((m) => (
                <tr key={m.property_id}>
                  <td style={td}>{NOMBRE[m.property_id] ?? m.property_id}</td>
                  <td style={td}>{m.noches_vendidas}</td>
                  <td style={td}>{m.noches_comparables}</td>
                  <td style={{ ...td, color: m.delta_eur == null ? C.soft : C.ink }}>
                    {m.delta_eur == null ? 'sin dato' : eur(m.delta_eur)}
                  </td>
                  <td style={td}>{m.delta_pct == null ? '—' : `${m.delta_pct.toFixed(1)}%`}</td>
                  <td style={{ ...td, color: m.estado === 'sin_datos' ? C.warn : m.estado === 'parcial' ? C.warn : C.ok, fontSize: 12 }}>
                    {m.estado === 'sin_datos'
                      ? 'sin comps fiables cerca de la reserva — pendiente'
                      : m.estado === 'parcial'
                        ? `cobertura parcial (${m.noches_comparables}/${m.noches_vendidas} noches)`
                        : 'cobertura completa'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2 · Cohorte */}
      <div style={card}>
        <h2 style={h2}>2 · Ventas por mes de RESERVA bajo el motor</h2>
        <p style={sub}>
          Cohorte de venta desde el go-live de cada piso ({pisos.map((p) => `${NOMBRE[p]} ${data.go_live[p]?.slice(5)}`).join(' · ')}).
          Con N pequeño un mes no demuestra nada: está para acumular, no para leerlo antes de tiempo.
        </p>
        {!data.hueco_2025.reparado && (
          <p style={{ ...sub, color: C.warn }}>
            ⚠️ Comparar contra 2025 sigue BLOQUEADO: {data.hueco_2025.meses_vacios.join(', ')} sin una sola
            entrada en la base (hueco de importación, no de mercado). Se desbloquea al repararse el backfill.
          </p>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={th}>Mes</th>
              {pisos.map((p) => <th key={p} style={th}>{NOMBRE[p]}</th>)}
            </tr></thead>
            <tbody>
              {meses.map((mes) => (
                <tr key={mes}>
                  <td style={{ ...td, fontWeight: 600 }}>{mes}</td>
                  {pisos.map((p) => {
                    const c = celda(mes, p)
                    const enVivo = data.go_live[p] && mes >= data.go_live[p].slice(0, 7)
                    return (
                      <td key={p} style={{ ...td, color: !enVivo ? C.soft : C.ink }}>
                        {!enVivo ? 'aún PL' : c ? <>{c.noches} n · {eur(c.neto ?? 0)}</> : '0 reservas'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4 · Facturación mes a mes vs el año anterior */}
      <div style={card}>
        <h2 style={h2}>
          Facturación mes a mes · {data.anual.anio} vs {data.anual.anio - 1}
        </h2>
        <p style={sub}>
          Comparación JUSTA en los tres tramos: los meses ya pasados comparan estancias consumidas;
          el mes en curso compara lo que va de mes contra lo que iba a la misma altura el año pasado;
          los meses futuros comparan <b>cartera contra cartera</b> (lo reservado a {data.anual.corte_actual}{' '}
          contra lo que había a {data.anual.corte_previo}) — el ritmo de venta. La franja marca desde
          cuándo manda el motor en cada piso.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {([
            ['Ya consumido', data.anual.total_consumido],
            ['En cartera (resto del año)', data.anual.total_cartera],
          ] as const).map(([rotulo, t]) => (
            <div key={rotulo} style={{ flex: '1 1 220px', minWidth: 200, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, color: C.soft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{rotulo}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, marginTop: 4 }}>{eur(t.actual.bruto)}</div>
              <div style={{ fontSize: 12, color: C.soft }}>
                {data.anual.anio - 1}: {eur(t.previo.bruto)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: t.deltaEur >= 0 ? C.ok : C.warn }}>
                {t.deltaEur >= 0 ? '+' : ''}{eur(t.deltaEur)}
                {t.deltaPct != null && <> ({t.deltaPct >= 0 ? '+' : ''}{t.deltaPct}%)</>}
              </div>
              <div style={{ fontSize: 11, color: C.soft, marginTop: 6 }}>
                {t.actual.noches} noches vs {t.previo.noches}
                {t.actual.noches > 0 && t.previo.noches > 0 && (
                  <> · {eur(Math.round(t.actual.bruto / t.actual.noches))}/noche vs{' '}
                    {eur(Math.round(t.previo.bruto / t.previo.noches))}</>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
            <thead><tr>
              <th style={th}>Mes</th><th style={th}>{data.anual.anio - 1}</th><th style={th}>{data.anual.anio}</th>
              <th style={th}>Δ</th><th style={th}>Noches</th><th style={th}>Motor</th>
            </tr></thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const filas = data.anual.serie.filter((s) => s.mesNum === m)
                const a = filas.reduce((x, f) => x + f.actual.bruto, 0)
                const p = filas.reduce((x, f) => x + f.previo.bruto, 0)
                const nA = filas.reduce((x, f) => x + f.actual.noches, 0)
                const nP = filas.reduce((x, f) => x + f.previo.noches, 0)
                const pct = p > 0 ? Math.round(((a - p) / p) * 1000) / 10 : null
                const reg = filas[0]?.regimen ?? 'cartera'
                const conMotor = filas.filter((f) => f.atribucion === 'si').length
                const parcial = filas.filter((f) => f.atribucion === 'parcial').length
                return (
                  <tr key={m} style={reg === 'cartera' ? { background: '#FCFDFF' } : undefined}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {MESES[m - 1]}
                      {reg === 'en_curso' && <span style={{ color: C.soft, fontWeight: 400 }}> · en curso</span>}
                      {reg === 'cartera' && <span style={{ color: C.soft, fontWeight: 400 }}> · cartera</span>}
                    </td>
                    <td style={{ ...td, color: C.soft }}>{p > 0 ? eur(p) : '—'}</td>
                    <td style={td}>{a > 0 ? eur(a) : '—'}</td>
                    <td style={{ ...td, color: a - p >= 0 ? C.ok : C.warn }}>
                      {p === 0 && a === 0 ? '—' : <>{a - p >= 0 ? '+' : ''}{eur(a - p)}{pct != null && <> ({pct >= 0 ? '+' : ''}{pct}%)</>}</>}
                    </td>
                    <td style={{ ...td, color: C.soft }}>{nA} vs {nP}</td>
                    <td style={{ ...td, fontSize: 12, color: conMotor === 4 ? C.ok : conMotor + parcial > 0 ? C.warn : C.soft }}>
                      {conMotor === 4 ? 'los 4 pisos' : conMotor + parcial === 0 ? '—' : `${conMotor} pisos${parcial ? ` (+${parcial} a medias)` : ''}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p style={{ ...sub, marginTop: 12, marginBottom: 0 }}>
          ⚠️ <b>La cartera de este año está algo inflada y no se puede corregir.</b> Una reserva cancelada
          se borra del histórico, así que la cifra del año pasado es «lo que sobrevivió» y la de este año
          incluye reservas que aún pueden caerse. No hay histórico de cancelaciones anterior al 12/08/2026.
          <br />
          ⚠️ <b>Que un mes vaya mejor no demuestra que sea el motor.</b> La columna «Motor» solo dice si
          mandaba, no que la mejora sea suya: también cambian el mercado, los eventos y la reserva directa.
        </p>
      </div>

      {/* 3 · Coste */}
      <div style={card}>
        <h2 style={h2}>3 · Coste de PriceLabs (serie real de `gastos`)</h2>
        <p style={sub}>Lo único ya cerrado del estudio: la cuota que dejó de pagarse. Sin extrapolar.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 260 }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Cargo</th></tr></thead>
            <tbody>
              {data.gastos_pricelabs.map((g) => (
                <tr key={g.fecha}>
                  <td style={td}>{g.fecha}</td>
                  <td style={td}>{eur(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
