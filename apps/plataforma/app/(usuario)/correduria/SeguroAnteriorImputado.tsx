'use client'

// El seguro anterior IMPUTADO a un vehículo nuevo (03/10/2026, Alberto: «el vehículo es nuevo, el
// historial es del conductor»). asegura propone qué póliza de motor del cliente se declara (regla:
// turismo antes que moto; luego la de efecto más antiguo sin siniestros conocidos) y aquí el
// corredor la ve, elige otra o la apaga. Si el bonus va SUPUESTO, se avisa: el precio queda
// condicionado a SINCO/certificado y no se emite sin verificarlo.

import { AlertTriangle } from 'lucide-react'
import { ConIcono } from './iconos'
import { describirCandidata, elegibles, type SeguroAnteriorImputado } from '@/lib/correduria/seguro-anterior-imputado'

/** Valor del selector: id de la candidata, o `NINGUNO` = no declarar seguro anterior (de calle). */
export const NINGUNO = 'ninguno'

/** Lo que viaja a la cotización según lo elegido. Sin cambios respecto a la propuesta, nada: decide asegura. */
export function eleccionParaCotizar(s: SeguroAnteriorImputado | null, valor: string): { seguroAnteriorId?: string; sinSeguroAnterior?: boolean } {
  if (!s) return {}
  if (valor === NINGUNO) return { sinSeguroAnterior: true }
  if (valor && valor !== s.elegida?.id) return { seguroAnteriorId: valor }
  return {}
}

export function PanelSeguroImputado({ s, valor, onCambio }: { s: SeguroAnteriorImputado; valor: string; onCambio: (v: string) => void }) {
  const opciones = elegibles(s)
  const elegida = opciones.find((c) => c.id === valor) ?? null
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8, minWidth: 0, fontSize: 13 }}>
      <p style={{ margin: 0 }}>
        <strong>Seguro anterior que se declara:</strong>{' '}
        {valor === NINGUNO ? 'ninguno (de calle: precio estimado, sin bonus)' : elegida ? describirCandidata(elegida) : '—'}
      </p>
      {s.porque && valor === (s.elegida?.id ?? '') && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>Por qué: {s.porque}</p>}
      {s.estado === 'no_disponible' && <p style={{ margin: 0, color: 'var(--negative)', fontSize: 12 }}>{s.porque}</p>}
      {opciones.length > 0 && (
        <label style={{ display: 'grid', gap: 4 }}>
          Cambiar la póliza que se declara
          <select value={valor} onChange={(e) => onCambio(e.target.value)} style={{ minHeight: 44, maxWidth: '100%' }}>
            {opciones.map((c) => (
              <option key={c.id} value={c.id}>
                {describirCandidata(c)}{c.id === s.elegida?.id ? ' (propuesta)' : ''}
              </option>
            ))}
            <option value={NINGUNO}>No declarar seguro anterior</option>
          </select>
        </label>
      )}
      {s.avisos.map((a) => (
        <p key={a} style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{a}</p>
      ))}
      {s.bonusSupuesto && valor !== NINGUNO && <AvisoBonusSupuesto condicion={s.condicion} />}
    </div>
  )
}

export function AvisoBonusSupuesto({ condicion }: { condicion: string | null }) {
  return (
    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--negative)' }}>
      <ConIcono i={AlertTriangle}>
        {condicion ?? 'Bonus supuesto: precio condicionado a verificación SINCO o certificado de siniestralidad antes de emitir.'}
      </ConIcono>
    </p>
  )
}
