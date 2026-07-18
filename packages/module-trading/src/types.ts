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
  pb?: number                // price-to-book
  deudaEbitda?: number
  margenNeto?: number
  valorRazonable?: number    // DCF / fair value (FMP) para "cotiza por debajo de su valor"
  proximoEarnings?: string   // ISO date
}

// Candidato de la CANTERA (capa C): un valor fuera de la watchlist que un buscador por
// parámetros propone estudiar. Precio + volumen (para rvol) + fundamentales opcionales.
export type Candidato = {
  simbolo: string
  precio: number
  rvol?: number              // volumen de hoy ÷ media (volumen relativo)
  fundamentales?: Fundamentales
  sector?: string
}

// Criterios del buscador. Todos opcionales: se aplican solo los presentes.
export type CriteriosScreener = {
  rvolMin?: number           // p.ej. 2 = volumen ≥ 2× su media (inusual)
  perMax?: number            // PER por debajo de X (barata por múltiplo)
  pbMax?: number             // price-to-book por debajo de X
  descuentoMinVsValor?: number // 0.15 = precio ≥15% por debajo del valor razonable
  precioMin?: number
  precioMax?: number
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
