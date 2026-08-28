import type { PaperPosicion, PaperOrden } from './types.ts'

// Nº de acciones para que una caída hasta `stop` cueste `riesgoPct` del NAV. Es lo ÚNICO para lo que
// se usa esa distancia: desde H9 el paper no vende por stop (ver `venceVentana` más abajo), pero sigue
// haciendo falta un criterio de TAMAÑO, y «arriesgo el 1% si el valor cae 2·ATR» lo es.
export function dimensionar(nav: number, entrada: number, stop: number, riesgoPct = 0.01): number {
  const distancia = entrada - stop
  if (distancia <= 0) return 0
  return Math.floor((nav * riesgoPct) / distancia)
}

// Abre una posición larga. La distancia de 2·ATR se calcula y se guarda, pero NO es una orden de venta:
// es el ancla con la que `dimensionar` decide cuántas acciones caben (ver la nota en `PaperPosicion`).
export function abrir(simbolo: string, cantidad: number, entrada: number, atr: number, fecha: string, horizonteDias?: number | null): PaperPosicion {
  return { simbolo, cantidad, precioEntrada: entrada, stop: entrada - 2 * atr, abiertaEn: fecha, horizonteDias: horizonteDias ?? null }
}

// ÚNICA salida del paper: por TIEMPO, al vencer la ventana declarada de la tesis que abrió la posición.
//
// Es lo que H9 dejó firmado —«No se ponen stops»— y lo que el panel /trading lleva prometiendo desde
// entonces («la salida es por TIEMPO al vencer la ventana de cada tesis»). Hasta el 28/08/2026 el código
// hacía lo contrario: evaluaba un stop a 2·ATR cada noche y no vendía nunca por tiempo. Daño real cero
// (11 BUY y 0 SELL, ningún stop llegó a saltar), pero la pantalla decía algo que no era verdad.
//
// 🚨 `horizonteDias` NULL = no se sabe la ventana de esa posición → NO se cierra. Cerrar «por si acaso»
// inventaría una venta con una fecha que nadie declaró; dejarla abierta es el estado conservador, y el
// consumidor la cuenta y la canta para que el hueco se vea.
export function venceVentana(pos: PaperPosicion, hoy: string): boolean {
  if (pos.horizonteDias == null || !(pos.horizonteDias > 0)) return false
  const dias = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${pos.abiertaEn}T00:00:00Z`)) / 86_400_000)
  return dias >= pos.horizonteDias
}

export function cerrar(pos: PaperPosicion, precio: number, fecha: string, motivo: string): PaperOrden {
  return { simbolo: pos.simbolo, lado: 'SELL', cantidad: pos.cantidad, precio, fecha, motivo }
}

export function pnlPosicion(pos: PaperPosicion, precio: number): number {
  return (precio - pos.precioEntrada) * pos.cantidad
}
