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

// No abrir un largo por DEBAJO de la media de 50 sesiones. Comprar "barato" en un valor que baja de
// forma persistente (la reversión sobre UEC, −41% en el backtest) es el patrón que más pierde: cerca
// de mínimos también es un cuchillo cayendo. Solo largos si el precio está sobre su SMA50 (tendencia
// de fondo no bajista). Sin SMA50 (serie corta) NO veta (degrada). Es el gate que, junto al suelo de
// ADX del momentum, llevó el backtest de −52% a breakeven.
export function bajoTendencia(precio: number, sma50: number | null | undefined): boolean {
  if (sma50 == null) return false
  return precio <= sma50
}

// Barrera de SELECCIÓN (Fase B): no abrir un largo en un nombre cuyo score de factores
// (value+quality+momentum, de `rankearFactores`) esté por debajo del mínimo. La selección FILTRA al
// timing técnico: aunque el gráfico dé señal alcista, si la empresa es fundamentalmente floja vs sus
// pares (score bajo), no se compra. `score` es el z-score compuesto (0 ≈ media del universo). Sin score
// o sin umbral, NO veta (degrada — mantiene el comportamiento anterior cuando el agente no aporta factores).
export function factorFlojo(score: number | null | undefined, minimo: number | null | undefined): boolean {
  if (score == null || minimo == null) return false
  return score < minimo
}

// No abrir un largo justo ANTES de resultados: el gap de earnings puede saltarse el stop de golpe
// (la lección de ISRG/IBM, que se desplomaron el día del anuncio). Veta la entrada si el próximo
// earnings cae dentro de `dias` (default 3). Sin fecha de earnings, no veta (degrada).
export function earningsInminente(proximoEarnings: string | undefined, hoy: string, dias = 3): boolean {
  if (!proximoEarnings) return false
  const d = (new Date(proximoEarnings).getTime() - new Date(hoy).getTime()) / 86_400_000
  return d >= 0 && d <= dias
}
