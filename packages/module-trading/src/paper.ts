import type { PaperPosicion, PaperOrden } from './types.ts'

// Nº de acciones para arriesgar `riesgoPct` del NAV si salta el stop.
export function dimensionar(nav: number, entrada: number, stop: number, riesgoPct = 0.01): number {
  const distancia = entrada - stop
  if (distancia <= 0) return 0
  return Math.floor((nav * riesgoPct) / distancia)
}

// Abre una posición larga con stop a 2*ATR bajo la entrada.
export function abrir(simbolo: string, cantidad: number, entrada: number, atr: number, fecha: string): PaperPosicion {
  return { simbolo, cantidad, precioEntrada: entrada, stop: entrada - 2 * atr, abiertaEn: fecha }
}

export function aplicarStop(pos: PaperPosicion, precio: number): boolean {
  return precio <= pos.stop
}

export function cerrar(pos: PaperPosicion, precio: number, fecha: string, motivo: string): PaperOrden {
  return { simbolo: pos.simbolo, lado: 'SELL', cantidad: pos.cantidad, precio, fecha, motivo }
}

export function pnlPosicion(pos: PaperPosicion, precio: number): number {
  return (precio - pos.precioEntrada) * pos.cantidad
}
