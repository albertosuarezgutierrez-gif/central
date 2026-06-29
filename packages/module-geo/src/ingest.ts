// Normalización de payloads de hardware/GPS heterogéneo a una lectura común. Permite que cualquier
// vertical ingiera posiciones venga de donde venga (móvil del conductor, baliza OBD-II, Teltonika,
// Concox, un servidor Traccar…) SIN acoplar la app a un fabricante: el front, la geocerca, el ETA y
// los km reales trabajan siempre sobre el mismo `LecturaCruda`. Puro: no toca BD ni red.

export type FormatoIngesta = 'osmand' | 'traccar' | 'generico'

// Una lectura ya normalizada, lista para persistir. `deviceId` identifica el aparato (IMEI / uniqueId)
// que la vertical mapea a un vehículo. `capturadoAt` es ISO 8601 o null (si el aparato no lo manda, el
// almacén pone la hora de llegada). Velocidad SIEMPRE en km/h; rumbo en grados [0,360).
export interface LecturaCruda {
  deviceId: string
  lat: number
  lng: number
  capturadoAt: string | null
  velocidadKmh: number | null
  rumbo: number | null
}

const NUDO_A_KMH = 1.852

// 1 nudo = 1.852 km/h. Los protocolos OsmAnd y Traccar reportan la velocidad en nudos.
export function nudosAKmh(nudos: number): number {
  return Math.round(nudos * NUDO_A_KMH * 100) / 100
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const primero = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v

// Normaliza una marca de tiempo: epoch en segundos o ms, o cadena ISO. Devuelve ISO 8601 o null.
export function parseTimestamp(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v)
    const ms = n < 1e12 ? n * 1000 : n // epoch en segundos vs milisegundos
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Construye la lectura validando coordenadas; descarta basura (sin id, sin coords o fuera de rango).
function construir(
  deviceId: string,
  lat: number | null,
  lng: number | null,
  capturadoAt: string | null,
  velocidadKmh: number | null,
  rumbo: number | null,
): LecturaCruda | null {
  const id = deviceId.trim()
  if (!id || lat == null || lng == null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { deviceId: id, lat, lng, capturadoAt, velocidadKmh, rumbo }
}

// Formato GENÉRICO (el nuestro): JSON con claves flexibles. La velocidad ya viene en km/h.
export function normalizarGenerico(o: Record<string, unknown>): LecturaCruda | null {
  const deviceId = String(o.deviceId ?? o.device ?? o.id ?? o.uniqueId ?? '')
  return construir(
    deviceId,
    toNum(o.lat ?? o.latitude),
    toNum(o.lng ?? o.lon ?? o.longitude),
    parseTimestamp(o.capturadoAt ?? o.timestamp ?? o.time ?? o.fixTime ?? o.deviceTime),
    toNum(o.velocidadKmh ?? o.speedKmh),
    toNum(o.rumbo ?? o.course ?? o.bearing ?? o.heading),
  )
}

// Protocolo OsmAnd (Traccar Client, multitud de balizas baratas): parámetros de query
// `id, lat, lon, speed (nudos), bearing, timestamp`.
export function normalizarOsmAnd(
  params: Record<string, string | string[] | undefined>,
): LecturaCruda | null {
  const g = (k: string) => primero(params[k])
  const speedKn = toNum(g('speed'))
  return construir(
    String(g('id') ?? g('deviceid') ?? ''),
    toNum(g('lat')),
    toNum(g('lon') ?? g('lng')),
    parseTimestamp(g('timestamp') ?? g('time')),
    speedKn == null ? null : nudosAKmh(speedKn),
    toNum(g('bearing') ?? g('heading') ?? g('course')),
  )
}

// Webhook "Forward" de Traccar: JSON con `{ position:{ latitude,longitude,speed(nudos),course,fixTime },
// device:{ uniqueId } }`. Acepta también el `position` plano por robustez.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizarTraccar(body: Record<string, any>): LecturaCruda | null {
  const pos = (body?.position ?? body) as Record<string, any>
  const dev = (body?.device ?? {}) as Record<string, any>
  const speedKn = toNum(pos.speed)
  return construir(
    String(dev.uniqueId ?? dev.id ?? pos.deviceId ?? ''),
    toNum(pos.latitude ?? pos.lat),
    toNum(pos.longitude ?? pos.lng ?? pos.lon),
    parseTimestamp(pos.fixTime ?? pos.deviceTime ?? pos.serverTime),
    speedKn == null ? null : nudosAKmh(speedKn),
    toNum(pos.course ?? pos.bearing),
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Dispatcher por formato. Devuelve la lectura normalizada o null si el payload no es válido.
export function normalizarLectura(formato: FormatoIngesta, payload: unknown): LecturaCruda | null {
  if (formato === 'osmand') return normalizarOsmAnd((payload ?? {}) as Record<string, string | string[] | undefined>)
  if (formato === 'traccar') return normalizarTraccar((payload ?? {}) as Record<string, unknown>)
  return normalizarGenerico((payload ?? {}) as Record<string, unknown>)
}
