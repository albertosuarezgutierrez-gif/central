'use client'

/** «Descargar PDF»: abre el diálogo de impresión del navegador (Guardar como PDF). Sin dependencias. */
export function ImprimirResumen() {
  return (
    <button type="button" className="boton" style={{ width: 'auto', minHeight: 44 }} onClick={() => window.print()}>
      Descargar PDF
    </button>
  )
}
