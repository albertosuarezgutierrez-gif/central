'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, Wallet } from 'lucide-react'
import { colorImporte, cardStyle, CardHeader, KpiCard } from '@/components/ui'
import { fmtEur } from '@/lib/financiero'
import BenchmarkPisos from './BenchmarkPisos'
import FugasRecurrentes from './FugasRecurrentes'

type Resp = {
  pisos?: { propertyId: string; nombre: string; reservas: number; ingresos: number; gastosTotal: number; resultado: number; margen: number }[] | null
  tesoreria: null | {
    proyecciones: { dias: number; proyectado: number; entradas: number; salidas: number }[]
    recurrentes: { clave: string; concepto: string; intervaloDias: number; ocurrencias: number; importeMedio: number }[]
    hayRecurrentes: boolean
  }
}

const aviso: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '0 0 24px' }

/**
 * Benchmark de pisos + previsión de tesorería + fugas, dentro del plegable
 * «Análisis y herramientas IA» de /banca. Se monta al abrir el plegable y SOLO
 * entonces pide los datos: `getTesoreria` recorre todo el histórico y antes se
 * calculaba en cada visita aunque nadie abriera esto.
 */
export default function AnalisisPerezoso({ mes, esMesUnico, periodoLabel }: {
  mes: string; esMesUnico: boolean; periodoLabel: string
}) {
  const [d, setD] = useState<Resp | 'cargando' | 'error'>('cargando')
  useEffect(() => {
    let vivo = true
    fetch(`/api/banca/analisis?mes=${encodeURIComponent(mes)}&unico=${esMesUnico ? 1 : 0}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Resp) => { if (vivo) setD(j) })
      .catch(() => { if (vivo) setD('error') })
    return () => { vivo = false }
  }, [mes, esMesUnico])

  if (d === 'cargando') return <p style={aviso}>Calculando previsión de tesorería…</p>
  if (d === 'error') return <p style={aviso}>No se ha podido cargar la previsión de tesorería ni el comparativo de pisos.</p>
  const tes = d.tesoreria

  return (
    <>
      {d.pisos === null && <p style={aviso}>No se ha podido leer el resultado de los pisos del mes.</p>}
      {d.pisos && d.pisos.length >= 2 && <BenchmarkPisos mes={mes} periodoLabel={periodoLabel} pisos={d.pisos} />}

      {tes === null && <p style={aviso}>No se ha podido calcular la previsión de tesorería.</p>}
      {tes && tes.hayRecurrentes && (
        <section style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TrendingUp size={17} strokeWidth={1.75} aria-hidden style={{ color: 'var(--muted)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Previsión de tesorería</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            {tes.proyecciones.map(p => (
              <KpiCard
                key={p.dias}
                icono={<Wallet size={18} strokeWidth={1.75} />}
                label={`Saldo proyectado · ${p.dias} días`}
                valor={fmtEur(p.proyectado)}
                color={colorImporte(p.proyectado)}
                sub={`+${fmtEur(p.entradas)} entran · −${fmtEur(p.salidas)} salen`}
              />
            ))}
          </div>
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 0' }}>
              <CardHeader title="Movimientos recurrentes detectados" />
            </div>
            {tes.recurrentes.map((r, i) => (
              <div key={r.clave + i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.concepto}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>cada ~{r.intervaloDias}d · ×{r.ocurrencias}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: colorImporte(r.importeMedio), flexShrink: 0, width: '92px', textAlign: 'right' }}>{fmtEur(r.importeMedio)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      {tes && tes.hayRecurrentes && <FugasRecurrentes periodoLabel={periodoLabel} />}
    </>
  )
}
