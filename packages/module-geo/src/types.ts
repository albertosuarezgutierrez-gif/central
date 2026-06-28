// Tipos del módulo GEO (puro, sin BD). Coordenadas en grados decimales (WGS84).

export interface Punto {
  lat: number
  lng: number
}

// Una lectura de posición de un móvil/baliza. `capturadoAt` es ISO 8601.
export interface Posicion extends Punto {
  capturadoAt: string
  velocidadKmh?: number | null
  rumbo?: number | null
}

// Punto con nombre (p. ej. una parada de la ruta).
export interface Ubicacion extends Punto {
  nombre?: string | null
}

export interface ProgresoRuta {
  paradaIndex: number // índice de la parada más cercana a la posición actual
  distanciaKm: number // distancia a esa parada
  siguienteIndex: number | null // índice de la siguiente parada (o null si ya es la última)
  etaMin: number | null // ETA aproximada a la siguiente parada (min), null si no hay velocidad
}
