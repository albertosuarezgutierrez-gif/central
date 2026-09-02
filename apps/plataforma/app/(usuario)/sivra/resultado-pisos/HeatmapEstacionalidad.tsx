'use client'
// 🗓️ Estacionalidad: margen piso × mes de los últimos 24 meses.
// PEREZOSO de verdad (regla de rendimiento del CLAUDE.md): el fetch —y el DOM de la cuadrícula—
// solo existen tras abrir el <details>. Escala de color DIVERGENTE (rojo ← 0 → verde) porque el
// margen es una polaridad; un mes sin ingresos se pinta neutro con «—» (no hay margen que juzgar,
// que no es lo mismo que margen 0).
import { useState } from 'react'
import { eur } from '@/lib/dinero'
import { etiquetaMes, nombreMesLargo } from './compartido'

interface CeldaPiso { propertyId: string; nombre: string; ingresos: number; resultado: number; margen: number }
interface MesHeatmap { mes: string; pisos: CeldaPiso[] }

export default function HeatmapEstacionalidad({ piso }: { piso: string }) {
  const [data, setData] = useState<MesHeatmap[] | null>(null)
  const [estado, setEstado] = useState<'cerrado' | 'cargando' | 'ok' | 'error'>('cerrado')

  async function abrir(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || data || estado === 'cargando') return
    setEstado('cargando')
    try {
      const r = await fetch('/api/sivra/pl-heatmap')
      if (!r.ok) throw new Error('HTTP')
      const j = await r.json()
      setData(j.meses)
      setEstado('ok')
    } catch {
      setEstado('error')
    }
  }

  const pisosIds: Array<{ id: string; nombre: string }> = []
  if (data) {
    for (const m of data) for (const p of m.pisos) {
      if (!pisosIds.some(x => x.id === p.propertyId)) pisosIds.push({ id: p.propertyId, nombre: p.nombre })
    }
    pisosIds.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }
  const filas = piso ? pisosIds.filter(p => p.id === piso) : pisosIds

  return (
    <details onToggle={abrir} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '10px 14px', marginBottom: 16 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15, minHeight: 28 }}>
        🗓️ Estacionalidad (margen por piso y mes, últimos 24 meses)
      </summary>
      {estado === 'cargando' && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Calculando los 24 meses… (la primera vez tarda unos segundos)</p>}
      {estado === 'error' && <p style={{ color: 'var(--negative)', fontSize: 13 }}>No se ha podido calcular el heatmap.</p>}
      {data && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '2px 6px', fontSize: 12, color: 'var(--muted)' }}>Piso</th>
                {data.map(m => (
                  <th key={m.mes} style={{ padding: '2px 4px', fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {etiquetaMes(m.mes)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.id}>
                  <td style={{ padding: '2px 6px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{f.nombre}</td>
                  {data.map(m => {
                    const c = m.pisos.find(p => p.propertyId === f.id)
                    return <Celda key={m.mes} mes={m.mes} celda={c ?? null} />
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 0' }}>
            Color = margen del mes (🟥 negativo · neutro 0 · 🟩 positivo, saturación según magnitud).
            «—» = mes sin ingresos (no hay margen que juzgar). Toca una celda para ver las cifras.
          </p>
        </div>
      )}
    </details>
  )
}

function Celda({ mes, celda }: { mes: string; celda: CeldaPiso | null }) {
  const sinDato = !celda || celda.ingresos <= 0
  const margen = celda?.margen ?? 0
  // Escala divergente con tope en |60|% de margen; alpha ≤ .4 para que el texto siga legible.
  const alpha = Math.min(Math.abs(margen), 60) / 60 * 0.4
  const fondo = sinDato
    ? 'var(--surface-2, var(--border))'
    : margen >= 0 ? `rgba(22, 163, 74, ${alpha})` : `rgba(220, 38, 38, ${alpha})`
  const titulo = sinDato
    ? `${nombreMesLargo(mes)}: sin ingresos`
    : `${nombreMesLargo(mes)}: ingresos ${eur(celda!.ingresos)} · resultado ${eur(celda!.resultado)} · margen ${margen}%`
  return (
    <td title={titulo} style={{
      padding: '4px 4px', textAlign: 'center', minWidth: 34, borderRadius: 4,
      background: fondo, color: sinDato ? 'var(--muted)' : 'var(--text)', cursor: 'default',
    }}>
      {sinDato ? '—' : `${margen}`}
    </td>
  )
}
