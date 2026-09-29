import { logoCompania, productoRelevante } from '@/lib/logo-compania'

/** Celda «Aseguradora» de las tablas de precios: el LOGO (el nombre solo si no tenemos logo) y,
 *  debajo, el producto cuando dice algo más que el ramo. Con el logo el nombre sobraba (28/09/2026). */
export function CeldaCompania({ compania, producto }: { compania: string | null | undefined; producto: string | null | undefined }) {
  const logo = logoCompania(compania)
  const prod = productoRelevante(compania, producto)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt={compania ?? ''} title={compania ?? undefined} style={{ height: Math.round(18 * logo.escala), maxWidth: 88, objectFit: 'contain', objectPosition: 'left center' }} />
      ) : (
        <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{compania ?? '—'}</span>
      )}
      {prod && <span style={{ color: 'var(--muted)', fontSize: 11, overflowWrap: 'anywhere' }}>{prod}</span>}
    </div>
  )
}

/** La compañía EN LÍNEA dentro de una frase («Mejor prima 280,50€ [logo]»): el logo pequeño y, si no
 *  tenemos logo, el nombre. El nombre va siempre en `alt`/`title` (29/09/2026). */
export function LogoCompaniaEnLinea({ compania, alto = 16 }: { compania: string | null | undefined; alto?: number }) {
  if (!compania) return null
  const logo = logoCompania(compania)
  if (!logo) return <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{compania}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo.src} alt={compania} title={compania} style={{ height: Math.round(alto * logo.escala), maxWidth: 80, objectFit: 'contain', verticalAlign: 'middle', display: 'inline-block' }} />
  )
}
