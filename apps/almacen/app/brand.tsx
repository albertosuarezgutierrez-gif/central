// Marca Joaquín Jaén. El logo vive en apps/almacen/public/logo.svg (monograma JJ en
// oro). Para usar el arte corporativo EXACTO, sustituir ese fichero por el SVG/PNG
// oficial manteniendo el nombre (logo.svg) — no hay que tocar este componente.

export function Brand({ tagline = 'Almacén' }: { tagline?: string }) {
  return (
    <span className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Joaquín Jaén" className="brand-logo" />
      <span className="brand-name">
        <span className="top">Joaquín Jaén</span>
        <span className="bottom">{tagline}</span>
      </span>
    </span>
  )
}
