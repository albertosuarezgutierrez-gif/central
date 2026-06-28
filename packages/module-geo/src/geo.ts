// Lógica pura del módulo GEO (sin BD). Distancia/rumbo/velocidad, señal, geocerca, ETA,
// km de una traza, progreso de ruta y simulación de trayecto. Reutilizable por cualquier vertical.
import type { Punto, Posicion, Ubicacion, ProgresoRuta } from './types'

const R_TIERRA_KM = 6371
const rad = (d: number): number => (d * Math.PI) / 180
const deg = (r: number): number => (r * 180) / Math.PI

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Distancia en km entre dos puntos por la fórmula del semiverseno (haversine).
export function haversineKm(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const lat1 = rad(a.lat)
  const lat2 = rad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Rumbo (bearing) inicial de a→b en grados [0,360).
export function rumbo(a: Punto, b: Punto): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

// Velocidad media en km/h entre dos puntos separados `dtSeg` segundos.
export function velocidadKmh(a: Punto, b: Punto, dtSeg: number): number {
  if (dtSeg <= 0) return 0
  return (haversineKm(a, b) / dtSeg) * 3600
}

// ¿La última lectura está "viva"? (capturada hace <= umbralSeg respecto a `ahoraIso`).
export function tieneSenal(ultima: Posicion | null | undefined, ahoraIso: string, umbralSeg = 60): boolean {
  if (!ultima) return false
  const dt = (new Date(ahoraIso).getTime() - new Date(ultima.capturadoAt).getTime()) / 1000
  return dt >= 0 && dt <= umbralSeg
}

// De una lista de posiciones (varios vehículos), la última de cada vehículo.
export function ultimaPosicionPorVehiculo<T extends { vehiculoId: string; capturadoAt: string }>(
  posiciones: T[],
): Map<string, T> {
  const m = new Map<string, T>()
  for (const p of posiciones) {
    const cur = m.get(p.vehiculoId)
    if (!cur || new Date(p.capturadoAt).getTime() > new Date(cur.capturadoAt).getTime()) {
      m.set(p.vehiculoId, p)
    }
  }
  return m
}

// ¿La posición está dentro de la geocerca (círculo de radio `radioM` metros sobre `centro`)?
export function dentroDeGeocerca(pos: Punto, centro: Punto, radioM: number): boolean {
  return haversineKm(pos, centro) * 1000 <= radioM
}

// ETA en minutos a `destino` a una velocidad dada (null si no hay velocidad útil).
export function etaMin(pos: Punto, destino: Punto, velKmh: number): number | null {
  if (velKmh <= 0) return null
  return round2((haversineKm(pos, destino) / velKmh) * 60)
}

// Km recorridos sumando los tramos de una traza de posiciones en orden.
export function kmDeTraza(posiciones: Punto[]): number {
  let km = 0
  for (let i = 1; i < posiciones.length; i++) km += haversineKm(posiciones[i - 1], posiciones[i])
  return round2(km)
}

// Progreso sobre una ruta de paradas: parada más cercana, siguiente y ETA a la siguiente.
export function progresoRuta(pos: Punto, paradas: Ubicacion[], velKmh = 30): ProgresoRuta | null {
  if (!paradas.length) return null
  let idx = 0
  let best = Infinity
  paradas.forEach((p, i) => {
    const d = haversineKm(pos, p)
    if (d < best) {
      best = d
      idx = i
    }
  })
  const siguienteIndex = idx + 1 < paradas.length ? idx + 1 : null
  const destino = siguienteIndex != null ? paradas[siguienteIndex] : paradas[idx]
  return { paradaIndex: idx, distanciaKm: round2(best), siguienteIndex, etaMin: etaMin(pos, destino, velKmh) }
}

// Interpola una traza recta entre paradas (para el modo DEMO sin GPS real).
export function simularTrayecto(paradas: Punto[], pasos = 20): Punto[] {
  if (paradas.length < 2) return paradas.slice()
  const out: Punto[] = []
  for (let s = 0; s < paradas.length - 1; s++) {
    const a = paradas[s]
    const b = paradas[s + 1]
    for (let k = 0; k < pasos; k++) {
      const t = k / pasos
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
    }
  }
  out.push(paradas[paradas.length - 1])
  return out
}
