// @central/module-geo — Geolocalización pura de la casa de marcas.
// Lógica de geo reutilizable por cualquier vertical para localizar personal/vehículos de campo:
// distancia, rumbo, velocidad, señal viva/perdida, geocerca, ETA, km de una traza, progreso de
// ruta y simulación de trayecto para demos. Sin BD; cada vertical aporta sus posiciones.

export type { Punto, Posicion, Ubicacion, ProgresoRuta } from './types'

export {
  round2,
  haversineKm,
  rumbo,
  velocidadKmh,
  tieneSenal,
  ultimaPosicionPorVehiculo,
  dentroDeGeocerca,
  etaMin,
  kmDeTraza,
  progresoRuta,
  simularTrayecto,
} from './geo'
