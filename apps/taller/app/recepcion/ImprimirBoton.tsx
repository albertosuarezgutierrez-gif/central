'use client'
export function ImprimirBoton() {
  return <button type="button" className="btn no-imprimir" onClick={() => window.print()}>Imprimir resguardo</button>
}
