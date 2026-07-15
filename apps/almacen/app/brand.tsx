// Marca Joaquín Jaén. El monograma se dibuja por CSS (pastilla + "JJ" serif) como
// aproximación fiel al logo corporativo. Cuando se añada el asset real, sustituir
// el <span className="brand-mark">JJ</span> por:
//   <img src="/logo.svg" alt="Joaquín Jaén" className="brand-mark" style={{ border: 0 }} />
// (dejando el fichero en apps/almacen/public/logo.svg).

export function Brand({ tagline = 'Almacén' }: { tagline?: string }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden>
        JJ
      </span>
      <span className="brand-name">
        <span className="top">Joaquín Jaén</span>
        <span className="bottom">{tagline}</span>
      </span>
    </span>
  )
}
