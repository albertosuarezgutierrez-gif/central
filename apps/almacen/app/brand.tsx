// Marca Joaquín Jaén — logotipo oficial (apps/almacen/public/logo-jj.png, el lockup
// que envió Alberto: monograma oro + CATERING + JOAQUÍN JAÉN en verde). En la cabecera
// se acompaña de la etiqueta "Almacén" para identificar la app.

export function Brand() {
  return (
    <span className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-jj.png" alt="Joaquín Jaén · Catering" className="brand-logo" />
      <span className="brand-tag">Almacén</span>
    </span>
  )
}
