import type { PaperPosicion } from './types.ts'

// Ninguna posición nueva puede pesar más de `maxPct` del NAV (default 20%).
export function superaConcentracion(valorNuevaPos: number, nav: number, maxPct = 0.2): boolean {
  if (nav <= 0) return true
  return valorNuevaPos / nav > maxPct
}

// Prohibido añadir a un nombre que ya está en pérdida (promediar a la baja).
export function esPromediarPerdedor(pos: PaperPosicion, precioActual: number): boolean {
  return precioActual < pos.precioEntrada
}

// Límite de operaciones por nombre en la ventana de estudio.
export function superaLimiteOps(opsDelNombre: number, maxOps = 5): boolean {
  return opsDelNombre >= maxOps
}
