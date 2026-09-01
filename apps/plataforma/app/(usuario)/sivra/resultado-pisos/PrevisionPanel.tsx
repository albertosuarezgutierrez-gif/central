'use client'
// 🔮 Previsión por piso (mes en curso + 2) + seguimiento de si las previsiones se cumplen.
//
// Decisión de Alberto (30/08/2026): CONFIRMADO (reservas ya en el calendario) y ESTIMADO (lo que
// faltaría para repetir el mismo mes del año anterior) SIEMPRE por separado — nunca un solo número
// que mezcle lo medido con lo previsto. El seguimiento contrasta la previsión guardada antes de
// empezar cada mes contra lo que de verdad entró: es lo que dirá si esto vale como previsión de
// tesorería. Independiente del rango elegido arriba (la previsión siempre mira hacia delante).
import { useState, useEffect } from 'react'
import { eur } from '@/lib/dinero'
import type { PrevisionData, PrevisionMesPiso } from '@/lib/sivra/prevision-pisos'
import { card, nombreMesLargo } from './compartido'

export default function PrevisionPanel({ piso }: { piso: string }) {
  const [data, setData] = useState<PrevisionData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    fetch('/api/sivra/prevision')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP')))
      .then(j => { if (vivo) setData(j) })
      .catch(() => { if (vivo) setError('No se ha podido cargar la previsión.') })
    return () => { vivo = false }
  }, [])

  if (error) {
    return (
      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🔮 Previsión</h2>
        <p style={{ color: 'var(--danger, #dc2626)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>
      </section>
    )
  }
  if (!data) {
    return (
      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🔮 Previsión</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0 0' }}>Calculando…</p>
      </section>
    )
  }

  const filas = piso ? data.filas.filter(f => f.propertyId === piso) : data.filas
  const seguimiento = piso ? data.seguimiento.filter(s => s.propertyId === piso) : data.seguimiento

  return (
    <section style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🔮 Previsión (mes en curso + 2)</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {data.ultimoSnapshot
            ? `foto diaria guardada — última: ${fechaCorta(data.ultimoSnapshot)}`
            : 'la foto diaria aún no ha corrido: el seguimiento empezará a llenarse mañana'}
        </span>
      </div>

      {data.meses.map(mes => {
        const delMes = filas.filter(f => f.mes === mes)
        if (delMes.length === 0) return null
        return (
          <div key={mes} style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px', textTransform: 'capitalize' }}>{nombreMesLargo(mes)}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                    <th style={{ ...th, textAlign: 'left' }}>Piso</th>
                    <th style={th}>✅ Confirmado</th>
                    <th style={th}>➕ Estimado adicional</th>
                    <th style={th}>Gastos previstos</th>
                    <th style={th}>Resultado previsto</th>
                    <th style={{ ...th, textAlign: 'left' }}>🏁 Ritmo vs año pasado</th>
                  </tr>
                </thead>
                <tbody>
                  {delMes.map(f => <FilaPrevision key={f.propertyId} f={f} />)}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
        ✅ Confirmado = reservas YA en el calendario (medido). ➕ Estimado = lo que faltaría por vender
        para repetir el MISMO mes del año pasado (es una previsión, no dinero). Gastos previstos = media
        de los últimos 3 meses cerrados del piso. «Sin base» = ese mes del año pasado no tuvo ingresos
        registrados: no hay con qué estimar (que no es lo mismo que estimar 0€).
      </p>

      <Seguimiento seguimiento={seguimiento} haySnapshots={data.ultimoSnapshot != null} />
    </section>
  )
}

function FilaPrevision({ f }: { f: PrevisionMesPiso }) {
  const resultadoPrevisto = (() => {
    if (f.gastosPrevistos == null) return '—'
    const suelo = f.confirmado - f.gastosPrevistos
    if (f.estimado == null) return `≥ ${eur(suelo)} (solo confirmado)`
    const techo = f.confirmado + f.estimado - f.gastosPrevistos
    if (f.estimado === 0) return eur(suelo)
    return `${eur(suelo)} → ${eur(techo)}`
  })()
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{f.nombre}</td>
      <td style={td}>
        {eur(f.confirmado)}
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.reservas} res. · {f.noches} noches</div>
      </td>
      <td style={td}>
        {f.estimado == null
          ? <span style={{ color: 'var(--muted)' }}>sin base del año pasado</span>
          : `~${eur(f.estimado)}`}
        {f.baseAnterior != null && (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>año pasado: {eur(f.baseAnterior)}</div>
        )}
      </td>
      <td style={td}>
        {f.gastosPrevistos == null
          ? <span style={{ color: 'var(--muted)' }}>sin datos</span>
          : `~${eur(f.gastosPrevistos)}`}
      </td>
      <td style={{ ...td, fontWeight: 600 }}>{resultadoPrevisto}</td>
      <td style={{ ...td, textAlign: 'left', fontSize: 12 }}><Ritmo f={f} /></td>
    </tr>
  )
}

function Ritmo({ f }: { f: PrevisionMesPiso }) {
  const p = f.pace
  if (p.deltaPct == null) {
    if (p.anteriorMismaAltura == null && p.sinFechaReserva > 0) {
      return <span style={{ color: 'var(--muted)' }}>no medible: {eur(p.sinFechaReserva)} del año pasado sin fecha de reserva conocida</span>
    }
    return <span style={{ color: 'var(--muted)' }}>sin base a esta altura del año pasado</span>
  }
  const bueno = p.deltaPct >= 0
  return (
    <span>
      <span style={{ color: bueno ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)', fontWeight: 600 }}>
        {bueno ? '▲' : '▼'} {p.deltaPct > 0 ? '+' : ''}{p.deltaPct}%
      </span>{' '}
      <span style={{ color: 'var(--muted)' }}>
        (a esta altura del año pasado: {eur(p.anteriorMismaAltura!)}
        {p.sinFechaReserva > 0 ? ` · +${eur(p.sinFechaReserva)} sin fecha` : ''})
      </span>
    </span>
  )
}

function Seguimiento({ seguimiento, haySnapshots }: { seguimiento: PrevisionData['seguimiento']; haySnapshots: boolean }) {
  return (
    <div style={{ marginTop: 16, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>🎯 ¿Se cumplen las previsiones?</h3>
      {seguimiento.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          Sin veredictos todavía: la foto diaria de previsiones arranca el 30/08/2026
          {haySnapshots ? ' y el primer mes fotografiado aún no ha cerrado' : ''}. Cuando cierre el
          primer mes con foto previa, aquí saldrá previsto vs real — si acierta, esto sirve de
          previsión de tesorería.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                <th style={{ ...th, textAlign: 'left' }}>Mes</th>
                <th style={{ ...th, textAlign: 'left' }}>Piso</th>
                <th style={th}>Previsto (antes de empezar)</th>
                <th style={th}>Real</th>
                <th style={th}>Desvío</th>
              </tr>
            </thead>
            <tbody>
              {seguimiento.map(s => (
                <tr key={`${s.mes}|${s.propertyId}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, textAlign: 'left', textTransform: 'capitalize' }}>{nombreMesLargo(s.mes)}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{s.nombre}</td>
                  <td style={td}>
                    {s.previstoTotal != null ? eur(s.previstoTotal) : <span style={{ color: 'var(--muted)' }}>solo confirmado: {eur(s.confirmadoEntonces)}</span>}
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>foto del {fechaCorta(s.previstoEl)}</div>
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{eur(s.realIngresos)}</td>
                  <td style={td}>
                    {s.desvioPct == null
                      ? <span style={{ color: 'var(--muted)' }}>— (previsión incompleta)</span>
                      : <span style={{ fontWeight: 600, color: Math.abs(s.desvioPct) <= 10 ? 'var(--success, #16a34a)' : 'var(--warning, #ca8a04)' }}>
                          {s.desvioPct > 0 ? '+' : ''}{s.desvioPct}%
                        </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>
            Se juzga la última foto ANTERIOR al día 1 del mes (previsión de ingresos = confirmado +
            estimado de aquel día) contra el ingreso real del mes cerrado.
          </p>
        </div>
      )}
    </div>
  )
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top' }
