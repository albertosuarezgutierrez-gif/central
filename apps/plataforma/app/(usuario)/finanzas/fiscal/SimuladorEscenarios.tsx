'use client'
// 4. ¿Qué cambia si hago X? Interruptores de palancas; el cálculo es el del motor (misma `declarar` que el servidor).
// Es una SIMULACIÓN: no escribe nada.
import { Badge, btnStyle } from '@/components/ui'
import type { Activas, PalancaSimulable } from '@/lib/fiscal-panel'
import { dinero, subBloque, tarjeta, tituloBloque } from './estilosPanel'
import { eur } from '@/lib/dinero'

export type FilaPalanca = {
  id: PalancaSimulable
  nombre: string
  /** € movidos (aportación, donativo, compras). */
  importe: number
  /** Baja de cuota para la modalidad elegida; null = sin dato. */
  ahorro: number | null
  riesgo: 'nulo' | 'bajo' | 'medio' | 'alto'
  /** false = no aplica; null = sin dato del límite legal. */
  elegible: boolean | null
  motivo: string
}
export type ResultadoSim = { baseLiquidable: number | null; margen: number | null; cuotaSin: number | null; cuotaCon: number | null; ahorro: number | null }

const RIESGO = { nulo: 'Sin riesgo', bajo: 'Riesgo bajo', medio: 'Riesgo medio', alto: 'Riesgo alto' } as const

export default function SimuladorEscenarios({ filas, activas, onToggle, onReset, resultado, etiquetaSel }: {
  filas: FilaPalanca[]; activas: Activas; onToggle: (id: PalancaSimulable) => void; onReset: () => void; resultado: ResultadoSim; etiquetaSel: string
}) {
  const alguna = Object.values(activas).some(Boolean)
  const r = resultado
  const lectura = !alguna
    ? 'Ninguna palanca activa.'
    : r.baseLiquidable == null
      ? 'Sin dato: no se puede calcular el resultado con estas palancas.'
      : `Base liquidable ${eur(r.baseLiquidable)}${r.margen == null ? '' : r.margen >= 0 ? `, margen ${eur(r.margen)}` : `, pasas por ${eur(-r.margen)}`}. Cuota ${dinero(r.cuotaCon)}${r.ahorro == null ? '' : `, ${r.ahorro >= 0 ? 'baja' : 'sube'} ${eur(Math.abs(r.ahorro))}`}.`
  return (
    <section style={tarjeta} aria-labelledby="t-simulador">
      <h2 id="t-simulador" style={tituloBloque}>¿Qué cambia si hago…? <span style={{ fontWeight: 500, color: 'var(--muted)' }}>({etiquetaSel}, cierre estimado)</span></h2>
      <p style={subBloque}>Simulación: no cambia tus datos. Importes por defecto = límite legal (planes) o 250€ por persona (donativos).</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {filas.map(f => {
          const on = !!activas[f.id]
          const bloqueada = f.elegible === false || f.elegible === null
          return (
            <li key={f.id}>
              <button type="button" role="switch" aria-checked={on} disabled={bloqueada} onClick={() => onToggle(f.id)}
                style={{ width: '100%', minHeight: 44, textAlign: 'left', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 8, cursor: bloqueada ? 'not-allowed' : 'pointer', opacity: bloqueada ? 0.65 : 1, background: on ? 'var(--primary-light)' : 'var(--surface)', color: 'var(--text)', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}` }}>
                <span aria-hidden style={{ width: 36, height: 20, borderRadius: 999, background: on ? 'var(--primary)' : 'var(--muted)', position: 'relative', flex: '0 0 auto' }}>
                  <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: 'var(--surface)' }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{f.nombre} {on ? '· activada' : ''}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                    {bloqueada ? (f.elegible === null ? `Sin dato del límite · ${f.motivo}` : `No aplica · ${f.motivo}`) : `${eur(f.importe)} · ${RIESGO[f.riesgo]}`}
                  </span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: f.ahorro != null && f.ahorro > 0 ? 'var(--positive)' : 'var(--muted)' }}>
                  {bloqueada ? '—' : f.ahorro == null ? 'sin dato' : `−${eur(f.ahorro)}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, background: 'var(--primary-light)' }}>
        <div aria-live="polite" role="status" style={{ flex: '1 1 220px', fontSize: 13, fontWeight: 600 }}>
          <strong>Resultado: </strong>{lectura} {alguna && <Badge tono="info">simulado</Badge>}
        </div>
        <button type="button" onClick={onReset} disabled={!alguna} style={{ ...btnStyle('secundario'), opacity: alguna ? 1 : 0.5 }}>Restablecer</button>
      </div>
    </section>
  )
}
