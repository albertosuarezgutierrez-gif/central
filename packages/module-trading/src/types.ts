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
  adx14?: number | null       // fuerza de tendencia (Wilder): ≥25 tendencia fuerte, <20 lateral
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

// Candidato de la CANTERA (capa C): un valor fuera de la watchlist que el agente descubre
// por su cuenta (temas IBKR, screener FMP, pico de volumen). Precio + volumen + fundamentales.
export type Candidato = {
  simbolo: string
  precio: number
  rvol?: number              // volumen de hoy ÷ media (volumen relativo)
  volAnual?: number          // volatilidad anualizada (0.90 = 90%) — riesgo del nombre
  fundamentales?: Fundamentales
  sector?: string
  posRango52?: number        // 0 = pegado a mínimos de 52s (barato vs su año), 1 = a máximos
  tendencia?: 'alcista' | 'bajista' | 'mixta'  // precio vs medias móviles 50/200
  fuentes?: string[]         // de dónde salió: 'tema:Nuclear', 'screener', 'volumen'…
}

// Criterios del buscador. Todos opcionales: se aplican solo los presentes.
export type CriteriosScreener = {
  rvolMin?: number           // p.ej. 2 = volumen ≥ 2× su media (inusual)
  perMax?: number            // PER por debajo de X (barata por múltiplo)
  pbMax?: number             // price-to-book por debajo de X
  descuentoMinVsValor?: number // 0.15 = precio ≥15% por debajo del valor razonable
  precioMin?: number
  precioMax?: number
  maxVolAnual?: number       // descarta lotería: p.ej. 0.8 = fuera si vol anual > 80%
  maxPosRango52?: number     // 0.5 = solo la mitad baja del rango 52s (proxy libre de "barata")
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
  // 🚨 NO es un stop de mercado: NADA vende por este precio. H9 (resuelta 08/08/2026) concluyó
  // literalmente «No se ponen stops», y la reconfirmación del 28/08 sobre 183.093 observaciones lo
  // sostuvo en los CINCO quintiles de momentum. Esta distancia sobrevive porque es el ANCLA DEL TAMAÑO:
  // `dimensionar` reparte el 1% del NAV según lo lejos que esté, así que borrarla dejaría a la cartera
  // sin criterio de posición. Se conserva como cálculo y como registro de qué distancia se usó.
  stop: number
  abiertaEn: string          // ISO date
  // Ventana declarada de la tesis que abrió la posición. Es la ÚNICA salida del paper (H9). NULL en las
  // posiciones abiertas antes de que esto existiera: «no se sabe su horizonte», que no es «no vence».
  horizonteDias?: number | null
}

export type PaperOrden = {
  simbolo: string
  lado: 'BUY' | 'SELL'
  cantidad: number
  precio: number
  fecha: string
  motivo: string             // p.ej. "tesis momentum conf 78" | "stop" | "cierre horizonte"
}
