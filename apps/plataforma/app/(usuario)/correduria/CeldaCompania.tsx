import { Badge } from '@/components/ui'
import { logoCompania, nombreProductoSinCia } from '@/lib/logo-compania'

/** Celda «Aseguradora» de las tablas de precios: logo (o iniciales si no lo hay),
 *  nombre de la compañía y, debajo, el producto sin repetir la compañía. */
export function CeldaCompania({ compania, producto }: { compania: string | null | undefined; producto: string | null | undefined }) {
  const logo = logoCompania(compania)
  const prod = nombreProductoSinCia(compania, producto)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt="" style={{ height: Math.round(18 * logo.escala), maxWidth: 52, objectFit: 'contain', flexShrink: 0 }} />
      ) : (
        <Badge tono="neutral">{(compania ?? '—').slice(0, 2).toUpperCase()}</Badge>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{compania ?? '—'}</div>
        {prod && <div style={{ color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{prod}</div>}
      </div>
    </div>
  )
}
