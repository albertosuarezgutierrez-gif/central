// Ubicación OPCIONAL de un parte (13/10/2026). Solo existe si la persona pulsó
// «Usar mi ubicación»: la pantalla nunca pide el permiso al cargar. Aquí solo hay
// reglas PURAS: validar rangos y REDONDEAR (4 decimales ≈ 11 m: sirve para situar el
// siniestro, no para seguir a nadie). El servidor vuelve a redondear lo que llega,
// porque el cliente es de quien lo manda.
export type UbicacionParte = { lat: number; lng: number }

const DECIMALES = 4

function redondear(n: number): number {
  const k = 10 ** DECIMALES
  return Math.round(n * k) / k
}

/** `null` si no son dos números finitos dentro de rango. Nunca devuelve (0,0) por defecto. */
export function coordenadasRedondeadas(lat: unknown, lng: unknown): UbicacionParte | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat: redondear(lat), lng: redondear(lng) }
}

/** Del cuerpo de la petición: `{lat,lng}` válido o `null` (ausente, mal formado o fuera de rango). */
export function normalizarUbicacion(v: unknown): UbicacionParte | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as { lat?: unknown; lng?: unknown }
  return coordenadasRedondeadas(o.lat, o.lng)
}

/** Texto editable para el campo «Dónde» cuando estaba vacío. Con precisión solo si es creíble. */
export function textoCoordenadas(u: UbicacionParte, precisionM?: number): string {
  const p = typeof precisionM === 'number' && Number.isFinite(precisionM) && precisionM > 0 ? ` (±${Math.round(precisionM)} m)` : ''
  return `Ubicación GPS: ${u.lat.toFixed(DECIMALES)}, ${u.lng.toFixed(DECIMALES)}${p}`
}
