// lib/domotica/acceso-programador.ts — lógica PURA de PIN por reserva (sin IO), testeable con node --test.
//
// Decide, dado un set de reservas de Smoobu + la config de la cerradura + los PIN ya creados, qué PIN
// hay que crear y cuáles borrar (idempotente por `reserva_ref`). La ventana de validez sale del horario
// REAL del piso (HORARIOS_PISO, que manda sobre lo que diga Smoobu) ± los márgenes configurados.
//
// Una cerradura puede colgar de VARIOS pisos (BustoTavera = portal de 2 turísticos): por eso cada
// reserva trae su `propertyId` y su horario ya resuelto; aquí no se consulta nada, solo se calcula.

export type ReservaAcceso = {
  id: string              // bookingId de Smoobu → reserva_ref
  propertyId: string      // prop_* (para etiquetar; el horario ya viene resuelto)
  smoobuApartmentId: number
  arrival: string         // 'YYYY-MM-DD' (día de check-in)
  departure: string       // 'YYYY-MM-DD' (día de check-out)
  checkIn: string         // 'HH:MM' hora real de entrada del piso
  checkOut: string        // 'HH:MM' hora real de salida del piso
  guestName?: string
}

export type PinExistente = {
  reservaRef: string
  estado: string          // activo|caducado|borrado|error
  validoHastaEpoch: number // segundos
  tuyaPasswordId: string | null
}

// Config mínima que necesita la lógica pura (subset de ConfigAcceso).
export type CfgProgramador = {
  autoPin: boolean
  margenEntradaMin: number
  margenSalidaMin: number
  autoBorrarTrasCheckout: boolean
}

// Offset de Europe/Madrid (en minutos, p.ej. +120 en verano, +60 en invierno) para un instante dado.
// Determinista: Intl es estable. Sirve para convertir hora de pared de Madrid ↔ epoch (DST-safe).
export function madridOffsetMin(epochMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset',
  }).formatToParts(new Date(epochMs))
  const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+1'
  const m = tz.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/)
  if (!m) return 60
  return Number(m[1]) * 60 + (m[1].startsWith('-') ? -Number(m[2] || 0) : Number(m[2] || 0))
}

// Hora de pared de Madrid ('YYYY-MM-DD' + 'HH:MM') → epoch en SEGUNDOS (lo que quiere Tuya). DST-safe.
export function madridEpoch(fecha: string, hora: string): number {
  const [Y, Mo, D] = fecha.split('-').map(Number)
  const [h, m] = hora.split(':').map(Number)
  const asUTC = Date.UTC(Y, (Mo || 1) - 1, D || 1, h || 0, m || 0)
  const off = madridOffsetMin(asUTC) // offset en el instante aproximado (basta para no cruzar el salto de DST relevante)
  return Math.floor((asUTC - off * 60_000) / 1000)
}

// Ventana de validez del PIN de una reserva, en epoch (segundos), aplicando los márgenes.
export function ventanaPin(r: ReservaAcceso, cfg: CfgProgramador): { desdeEpoch: number; hastaEpoch: number } {
  const desde = madridEpoch(r.arrival, r.checkIn) - Math.max(0, cfg.margenEntradaMin) * 60
  const hasta = madridEpoch(r.departure, r.checkOut) + Math.max(0, cfg.margenSalidaMin) * 60
  return { desdeEpoch: desde, hastaEpoch: hasta }
}

// Decide qué crear y qué borrar. Idempotente por reserva_ref:
//  - crear: reservas con autoPin activo que NO tengan ya un PIN vivo (activo).
//  - borrar: PIN activos cuya ventana ya venció (si autoBorrarTrasCheckout) — además de caducar solo.
export function reconciliar(
  reservas: ReservaAcceso[],
  cfg: CfgProgramador,
  existentes: PinExistente[],
  ahoraEpoch: number,
): { crear: ReservaAcceso[]; borrar: PinExistente[] } {
  const vivos = new Set(existentes.filter(p => p.estado === 'activo').map(p => p.reservaRef))
  const crear = cfg.autoPin ? reservas.filter(r => !vivos.has(r.id)) : []

  const borrar = cfg.autoBorrarTrasCheckout
    ? existentes.filter(p => p.estado === 'activo' && p.validoHastaEpoch < ahoraEpoch)
    : []
  return { crear, borrar }
}

// ¿Hay que avisar de cerradura offline antes de un check-in? True si la cerradura está offline y falta
// menos de `leadHoras` para el próximo check-in (para tener margen de resolverlo antes de que llegue el
// huésped). `proximoCheckinEpoch` = null si no hay check-in próximo.
export function necesitaAvisoOffline(
  online: boolean,
  proximoCheckinEpoch: number | null,
  ahoraEpoch: number,
  leadHoras: number,
): boolean {
  if (online || proximoCheckinEpoch == null) return false
  const faltanSeg = proximoCheckinEpoch - ahoraEpoch
  return faltanSeg > 0 && faltanSeg <= Math.max(1, leadHoras) * 3600
}
