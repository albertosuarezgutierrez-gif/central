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

// No abrir un largo justo ANTES de resultados: el gap de earnings puede saltarse el stop de golpe
// (la lección de ISRG/IBM, que se desplomaron el día del anuncio). Veta la entrada si el próximo
// earnings cae dentro de `dias` (default 3). Sin fecha de earnings, no veta (degrada).
export function earningsInminente(proximoEarnings: string | undefined, hoy: string, dias = 3): boolean {
  if (!proximoEarnings) return false
  const d = (new Date(proximoEarnings).getTime() - new Date(hoy).getTime()) / 86_400_000
  return d >= 0 && d <= dias
}
