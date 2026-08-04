'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useTransition } from 'react'
import { eur } from '@/lib/dinero'
import { importesDe } from '@/lib/fiscal-deducciones'

function fmt(n: number) {
  return eur(n)
}
function fmtMes(mes: string) {
  const [, m] = mes.split('-')
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return names[(parseInt(m) - 1)] ?? mes
}

// Los tramos NO se hardcodean aquí: fuente única = IMPORTES_POR_ANIO[year] (fiscal-deducciones.ts,
// módulo puro importable en cliente; lo vigila la skill `fiscal-novedades`). El simulador recalcula en
// vivo, por eso el cálculo sigue en cliente pero parametrizado por los tramos del año.
type TramoRaw = { desde: number; hasta: number | null; tipo: number }

function calcularTramos(base: number, tramos: TramoRaw[]) {
  const basePos = Math.max(0, base)
  const tramosIRPF = tramos.map(t => {
    const hasta = t.hasta ?? Infinity
    const aplicado = Math.max(0, Math.min(basePos, hasta) - t.desde)
    return { ...t, importe: aplicado * t.tipo }
  })
  const cuotaTotal = tramosIRPF.reduce((s, t) => s + t.importe, 0)
  const tramoIdx = tramos.findLastIndex(t => basePos >= t.desde)
  const tramoActual = tramos[tramoIdx] ?? tramos[0]
  const siguiente = tramos.find(t => t.desde > basePos)
  return {
    tramosIRPF,
    tramoActual,
    cuotaTotal,
    tipoEfectivo: basePos > 0 ? cuotaTotal / basePos : 0,
    margenHastaProximoTramo: siguiente ? siguiente.desde - basePos : null,
  }
}

type ProyeccionData = {
  baseReal: number
  baseProyectada: number
  ingresosFuturos: number
  reservasFuturas: { mes: string; totalNeto: number; numReservas: number }[]
  tramoActual: { desde: number; hasta: number | null; tipo: number }
  tramosIRPF: { desde: number; hasta: number | null; tipo: number; importe: number }[]
  margenHastaProximoTramo: number | null
  retencionesAcumuladas: number
  year: number
  patrones?: Array<{
    concepto: string
    etiqueta: string
    destino: string
    tipo: 'ingreso' | 'gasto'
    importeMedioMensual: number
    mesesDetectado: number
    proyectable: boolean
  }>
  ingresosRecurrentesProyectados?: number
  gastosDeduciblesProyectados?: number
  mesesRestantes?: number
}

export default function ProyeccionClient({ year: initYear }: { year: number }) {
  const router = useRouter()
  const [year, setYear] = useState(initYear)
  const [isPending, startTransition] = useTransition()
  const [data, setData] = useState<ProyeccionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Simulador
  const [ingresoExtra, setIngresoExtra] = useState(0)

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear + 1].filter(y => y >= 2024)

  useEffect(() => {
    setLoading(true); setError('')
    fetch(`/api/finanzas/proyeccion?year=${year}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar proyección'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [year])

  function navegarAnio(y: number) {
    setYear(y)
    startTransition(() => router.push(`/finanzas/proyeccion?year=${y}`, { scroll: false }))
  }

  // Base proyectada + simulador. Tramos del año en curso (fuente única IMPORTES_POR_ANIO).
  const tramosAnio = importesDe(year).tramos
  const baseProyectada = data ? data.baseProyectada + ingresoExtra : 0
  const calculo = data ? calcularTramos(baseProyectada, tramosAnio) : null
  const calculoSinExtra = data ? calcularTramos(data.baseProyectada, tramosAnio) : null

  const diferenciaCuota = calculo && calculoSinExtra
    ? calculo.cuotaTotal - calculoSinExtra.cuotaTotal
    : 0

  const resultadoFinal = calculo ? calculo.cuotaTotal - (data?.retencionesAcumuladas ?? 0) : 0

  // Alerta de cruce de tramo
  const cruzaTramo = calculo && calculoSinExtra
    ? calculo.tramoActual.tipo > calculoSinExtra.tramoActual.tipo
    : false

  const patronesIngreso = data?.patrones?.filter(p => p.tipo === 'ingreso' && p.proyectable) ?? []
  const patronesGasto = data?.patrones?.filter(p => p.tipo === 'gasto' && p.proyectable) ?? []
  const mesesRestantes = data?.mesesRestantes ?? 0
  const hayPatrones = (data?.patrones?.length ?? 0) > 0

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <style>{`
        @media (max-width: 768px) {
          .proyec-cols { grid-template-columns: 1fr !important; }
          .proyec-kpis { grid-template-columns: 1fr 1fr !important; }
          .patrones-cols { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) { .proyec-kpis { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, flex: 1 }}>📈 Proyección fiscal</h1>
        <div style={{ display: 'flex', gap: '4px' }}>
          {years.map(y => (
            <button key={y} onClick={() => navegarAnio(y)} style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', border: '1px solid var(--border)',
              background: year === y ? 'var(--primary)' : 'var(--surface)', color: year === y ? '#fff' : 'var(--text)', fontWeight: year === y ? 700 : 400,
            }}>{y}</button>
          ))}
        </div>
        {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>Calculando proyección…</div>
      ) : error ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#e53e3e' }}>{error}</div>
      ) : data && calculo ? (
        <>
          {/* KPIs */}
          <div className="proyec-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Base real acumulada', value: data.baseReal, color: 'var(--primary)', sub: 'Datos bancarios confirmados' },
              { label: 'Ingresos futuros (reservas)', value: data.ingresosFuturos, color: '#805ad5', sub: `${data.reservasFuturas.length} meses con reservas` },
              { label: 'Base proyectada a cierre', value: baseProyectada, color: '#e53e3e', sub: `Tramo: ${(calculo.tramoActual.tipo * 100).toFixed(0)}%` },
              { label: 'Resultado estimado', value: resultadoFinal, color: resultadoFinal <= 0 ? 'var(--primary)' : '#e53e3e', sub: resultadoFinal <= 0 ? 'A devolver' : 'A pagar' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                {k.sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Alerta de tramo */}
          {calculo.margenHastaProximoTramo !== null && calculo.margenHastaProximoTramo < 8000 && (
            <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#742a2a' }}>Cerca del siguiente tramo</div>
                <div style={{ fontSize: '12px', color: '#742a2a' }}>
                  Te quedan <strong>{fmt(calculo.margenHastaProximoTramo)}</strong> para entrar al {tramosAnio.find(t => t.desde > baseProyectada) ? `${(tramosAnio.find(t => t.desde > baseProyectada)!.tipo * 100).toFixed(0)}%` : 'siguiente tramo'}.
                  Considera aplazar ingresos al año siguiente.
                </div>
              </div>
            </div>
          )}

          <div className="proyec-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Reservas futuras */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>🏨 Reservas futuras confirmadas</div>
              {data.reservasFuturas.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin reservas futuras para este año.</p>
              ) : (
                <>
                  {data.reservasFuturas.map(r => (
                    <div key={r.mes} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600 }}>{fmtMes(r.mes)}</span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{r.numReservas} reservas</span>
                      <span style={{ fontWeight: 700, color: '#805ad5' }}>{fmt(r.totalNeto)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px', paddingTop: '8px' }}>
                    <span>Total futuro</span>
                    <span style={{ color: '#805ad5' }}>{fmt(data.ingresosFuturos)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Simulador */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>🎚️ Simulador ¿qué pasa si…?</div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Ingreso adicional hipotético</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                  type="number"
                  value={ingresoExtra || ''}
                  onChange={e => setIngresoExtra(Number(e.target.value) || 0)}
                  placeholder="Ej: 10000"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '14px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>€</span>
                {ingresoExtra > 0 && (
                  <button onClick={() => setIngresoExtra(0)} style={{ fontSize: '12px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                )}
              </div>

              {/* Resultado en tiempo real */}
              <div style={{ background: 'var(--primary-light)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--muted)' }}>Base sin extra</span>
                    <span style={{ fontWeight: 600 }}>{fmt(data.baseProyectada)}</span>
                  </div>
                  {ingresoExtra > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--muted)' }}>+ Ingreso extra</span>
                      <span style={{ fontWeight: 600, color: '#805ad5' }}>+{fmt(ingresoExtra)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
                    <span style={{ fontWeight: 600 }}>Base proyectada</span>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{fmt(baseProyectada)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted)' }}>Cuota estimada</span>
                  <span style={{ fontWeight: 700, color: '#e53e3e' }}>{fmt(calculo.cuotaTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted)' }}>Tipo efectivo</span>
                  <span style={{ fontWeight: 600 }}>{(calculo.tipoEfectivo * 100).toFixed(1)}%</span>
                </div>
                {ingresoExtra > 0 && (
                  <div style={{ marginTop: '8px', padding: '8px 10px', background: cruzaTramo ? '#fff5f5' : '#c6f6d5', borderRadius: '6px', fontSize: '12px', color: cruzaTramo ? '#742a2a' : '#22543d', fontWeight: 600 }}>
                    {cruzaTramo
                      ? `⚠️ Este ingreso te sube al ${(calculo.tramoActual.tipo * 100).toFixed(0)}% (+${fmt(diferenciaCuota)} de IRPF extra)`
                      : `✓ Sin cambio de tramo · +${fmt(diferenciaCuota)} de IRPF`}
                  </div>
                )}
              </div>

              {/* Tramo actual */}
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                Tramo marginal actual: <strong style={{ color: 'var(--text)' }}>{(calculo.tramoActual.tipo * 100).toFixed(0)}%</strong>
                {' '}({fmt(calculo.tramoActual.desde)}–{calculo.tramoActual.hasta ? fmt(calculo.tramoActual.hasta) : '∞'})
                {calculo.margenHastaProximoTramo !== null && (
                  <span style={{ marginLeft: '8px' }}>· {fmt(calculo.margenHastaProximoTramo)} para el siguiente</span>
                )}
              </div>
            </div>
          </div>

          {/* Patrones recurrentes detectados por IA */}
          {hayPatrones && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '16px' }}>
                🔄 Patrones detectados · proyección {mesesRestantes} meses restantes
              </div>

              <div className="patrones-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Ingresos recurrentes */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#276749', marginBottom: '8px' }}>
                    Ingresos proyectados
                    <span style={{ marginLeft: '8px', color: '#22543d', background: '#c6f6d5', borderRadius: '4px', padding: '2px 6px' }}>
                      +{fmt(data.ingresosRecurrentesProyectados ?? 0)}
                    </span>
                  </div>
                  {patronesIngreso.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin patrones de ingreso detectados.</p>
                  ) : patronesIngreso.map(p => (
                    <div key={p.concepto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.etiqueta}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmt(p.importeMedioMensual)}/mes × {mesesRestantes}</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#276749', whiteSpace: 'nowrap' }}>+{fmt(p.importeMedioMensual * mesesRestantes)}</span>
                    </div>
                  ))}
                </div>

                {/* Gastos deducibles recurrentes */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#9b2c2c', marginBottom: '8px' }}>
                    Gastos proyectados
                    <span style={{ marginLeft: '8px', color: '#742a2a', background: '#fed7d7', borderRadius: '4px', padding: '2px 6px' }}>
                      -{fmt(data.gastosDeduciblesProyectados ?? 0)}
                    </span>
                  </div>
                  {patronesGasto.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin patrones de gasto detectados.</p>
                  ) : patronesGasto.map(p => (
                    <div key={p.concepto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.etiqueta}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmt(p.importeMedioMensual)}/mes × {mesesRestantes}</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#9b2c2c', whiteSpace: 'nowrap' }}>-{fmt(p.importeMedioMensual * mesesRestantes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </main>
  )
}
