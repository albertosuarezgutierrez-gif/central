'use client'
// 5. Qué puedo hacer antes del 31/12: acciones priorizadas por ahorro (reglas del motor; sin IA en esta fase).
import { useState } from 'react'
import { Badge, btnStyle } from '@/components/ui'
import type { Accion, PalancaSimulable } from '@/lib/fiscal-panel'
import { PALANCAS_SIMULABLES } from '@/lib/fiscal-panel'
import { subBloque, tarjeta, tituloBloque } from './estilosPanel'
import { eur } from '@/lib/dinero'

const RIESGO = { nulo: 'Sin riesgo', bajo: 'Riesgo bajo', medio: 'Riesgo medio', alto: 'Riesgo alto' } as const
const VISIBLES = 5

export default function ListaAcciones({ acciones, activas, onAnadir }: { acciones: Accion[]; activas: Partial<Record<PalancaSimulable, boolean>>; onAnadir: (id: PalancaSimulable) => void }) {
  const [todas, setTodas] = useState(false)
  const lista = todas ? acciones : acciones.slice(0, VISIBLES)
  return (
    <section style={tarjeta} aria-labelledby="t-acciones">
      <h2 id="t-acciones" style={tituloBloque}>Qué puedo hacer antes del 31/12</h2>
      <p style={subBloque}>Ordenadas por ahorro de cuota. Cálculo orientativo del motor: confírmalo con la gestoría antes de mover dinero.</p>
      {acciones.length === 0 ? (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>Ninguna palanca baja la cuota con los datos actuales.</div>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {lista.map((a, i) => {
            const simulable = (PALANCAS_SIMULABLES as string[]).includes(a.id)
            const on = simulable && !!activas[a.id as PalancaSimulable]
            return (
              <li key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}. {a.titulo}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: a.verde ? 'var(--positive)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {a.ahorro == null ? 'ahorro sin dato' : `−${eur(a.ahorro)} de cuota`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                  <Badge tono={a.riesgo === 'nulo' || a.riesgo === 'bajo' ? 'neutral' : 'aviso'}>{RIESGO[a.riesgo]}</Badge>
                  <Badge tono="info">{a.diasRestantes == null ? a.plazo : `${a.plazo} · quedan ${a.diasRestantes} días`}</Badge>
                  <Badge tono={a.verde ? 'positivo' : 'neutral'}>
                    {a.ahorroPorEuro == null ? (a.id === 'individual' ? 'Sin coste de caja' : 'Compensa: sin dato') : a.verde ? 'Ahorras más de lo que mueves' : `Ahorras ${eur(a.ahorroPorEuro * 100)} por cada 100€ movidos`}
                  </Badge>
                  <Badge tono="neutral">Regla del motor</Badge>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.motivo}</div>
                {simulable && (
                  <div><button type="button" onClick={() => onAnadir(a.id as PalancaSimulable)} aria-pressed={on} style={btnStyle(on ? 'primario' : 'secundario', 'sm')}>{on ? 'En el simulador' : 'Añadir al simulador'}</button></div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {acciones.length > VISIBLES && (
        <button type="button" onClick={() => setTodas(v => !v)} style={{ ...btnStyle('sutil'), marginTop: 8 }}>{todas ? 'Ver menos' : `Ver ${acciones.length - VISIBLES} más`}</button>
      )}
    </section>
  )
}
