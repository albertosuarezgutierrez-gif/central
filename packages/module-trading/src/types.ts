// Dominio del módulo de trading. Todo puro y serializable (JSON) para viajar entre la sesión
// Claude, los endpoints y la BD.

export type Vela = {
  fecha: string        // ISO yyyy-mm-dd
  apertura: number
  alto: number
  bajo: number
  cierre: number
  volumen: number
}

export type Direccion = 'alcista' | 'bajista' | 'neutral'
export type Regimen = 'tendencia_alcista' | 'tendencia_bajista' | 'lateral'
export type Estrategia = 'momentum' | 'reversion' | 'valor' | 'catalizador'

export type Indicadores = {
  sma20: number | null
  sma50: number | null
  ema12: number | null
  ema26: number | null
  rsi14: number | null
  macd: number | null
  macdSignal: number | null
  atr14: number | null
}

// Fundamentales mínimos (de FMP); todo opcional porque en técnico-solo no están.
export type Fundamentales = {
  per?: number
  deudaEbitda?: number
  margenNeto?: number
  proximoEarnings?: string   // ISO date
}

export type Senal = {
  estrategia: Estrategia
  direccion: Direccion
  confianza: number          // 0..100
  rationale: string
}

export type Tesis = {
  simbolo: string
  fecha: string              // ISO date de la pasada
  estrategia: Estrategia
  direccion: Direccion
  confianza: number
  horizonteDias: number
  precioRef: number
  indicadores: Indicadores
  rationale: string
}

export type PaperPosicion = {
  simbolo: string
  cantidad: number           // >0 largo
  precioEntrada: number
  stop: number
  abiertaEn: string          // ISO date
}

export type PaperOrden = {
  simbolo: string
  lado: 'BUY' | 'SELL'
  cantidad: number
  precio: number
  fecha: string
  motivo: string             // p.ej. "tesis momentum conf 78" | "stop" | "cierre horizonte"
}
