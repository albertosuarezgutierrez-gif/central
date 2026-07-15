// Marca Joaquín Jaén — usa el logo corporativo oficial (apps/almacen/public/logo.svg,
// el lockup vectorial que subió Alberto, recoloreado a oro para fondo claro). En la
// cabecera se acompaña de la etiqueta "Almacén" para identificar la app.

export function Brand() {
  return (
    <span className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Joaquín Jaén" className="brand-logo" />
      <span className="brand-tag">Almacén</span>
    </span>
  )
}
