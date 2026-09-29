// Las compañías que NO dieron precio, en TODAS las parrillas del corredor (29/09/2026).
// Sin esta lista, «5 precios» se lee como «esto es el mercado entero». Y no es lo mismo «la compañía
// no asegura este riesgo» que «falló el envío»: lo primero es una respuesta, lo segundo un hueco.
// Abierta a propósito: son pocas filas y es justo lo que el corredor tiene que ver.

import { Badge } from '@/components/ui'
import { tipoFallo, titularFallo, type TipoFallo } from '@/lib/correduria/parrilla-coherencia'

type FalloParrilla = {
  compania?: string | null
  producto?: string | null
  motivo?: string | null
  tambienDioPrecio?: boolean
}

const ORDEN: readonly TipoFallo[] = ['tecnico', 'rechazo', 'otro']

export function FallosTarificacion({ fallos }: { fallos: readonly FalloParrilla[] }) {
  if (fallos.length === 0) return null
  const grupos = ORDEN.map((t) => ({ t, xs: fallos.filter((f) => tipoFallo(f.motivo) === t) })).filter((g) => g.xs.length > 0)
  return (
    <div style={{ marginTop: 8, fontSize: 13, minWidth: 0 }}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
        {fallos.length} {fallos.length === 1 ? 'producto' : 'productos'} sin precio
      </p>
      {grupos.map((g) => (
        <div key={g.t} style={{ borderLeft: `3px solid ${g.t === 'tecnico' ? 'var(--warning)' : 'var(--border)'}`, paddingLeft: 10, margin: '6px 0' }}>
          <p style={{ margin: 0, fontSize: 12, color: g.t === 'tecnico' ? 'var(--warning)' : 'var(--muted)', fontWeight: g.t === 'tecnico' ? 600 : 400 }}>
            {titularFallo(g.t)}
          </p>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {g.xs.map((f, i) => (
              <li key={`${f.compania}-${i}`} style={{ overflowWrap: 'anywhere' }}>
                <strong>{f.compania ?? '—'}</strong>
                {f.producto ? ` · ${f.producto}` : ''}: {f.motivo ?? 'sin motivo declarado'}
                {f.tambienDioPrecio && <> <Badge tono="positivo">esta compañía sí dio otro precio</Badge></>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
