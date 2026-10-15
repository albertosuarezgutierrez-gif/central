'use client'

// «Precio con supuestos» (15/10/2026): etiqueta breve junto a un precio de Avant2 que se pidió con algún dato SUPUESTO
// (km por defecto, compra = matriculación, garaje por defecto, años topados…). Pulsarla despliega la lista (en móvil no
// hay «hover»); el `title` la da también al pasar el ratón. La lógica (tres estados) vive en `marcaSupuestos`.

import { Badge } from '@/components/ui'
import { marcaSupuestos } from './parrilla-precios'

export default function MarcaSupuestos({ supuestos }: { supuestos: readonly { texto: string }[] | null | undefined }) {
  const m = marcaSupuestos(supuestos)
  if (!m) return null
  return (
    <details style={{ minWidth: 0, maxWidth: '100%' }}>
      <summary
        title={m.detalle.join('\n')}
        style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, cursor: 'pointer', listStyle: 'none' }}
      >
        <Badge tono={m.tono}>{m.etiqueta}</Badge>
      </summary>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
        {m.detalle.map((d, i) => <li key={i}>{d}</li>)}
      </ul>
    </details>
  )
}
