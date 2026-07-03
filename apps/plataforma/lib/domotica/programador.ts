// lib/domotica/programador.ts — decisión PURA de la automatización del ventilador (sin IO).
//
// Regla de Alberto (03/07/2026): día de llegada a las 15:00 Madrid, si en Sevilla hace >30 °C,
// encender SOLO el ventilador (la luz no se toca). Día de check-out a las 11:30, mandar apagar
// SIEMPRE (apagar algo apagado es inocuo y cubre el desfase de estado del mando RF).
// El cron corre cada 30 min en franja UTC; aquí se decide con hora Europe/Madrid (DST-safe).

export type ReservaVentana = { id: string; arrival: string; departure: string }

export type ConfigAuto = {
  autoOn: boolean       // encendido automático activo
  umbralC: number       // solo enciende si temperatura > umbral
  horaOn: string        // inicio ventana de encendido (día de llegada)
  horaOffCheck: string  // inicio ventana de verificación de apagado (día de salida)
  ventanaMin: number    // anchura de ambas ventanas (≥ intervalo del cron, 30 min)
}

export const CONFIG_DEFAULT: ConfigAuto = {
  autoOn: true, umbralC: 30, horaOn: '15:00', horaOffCheck: '11:30', ventanaMin: 30,
}

export function ahoraMadrid(d = new Date()): { fecha: string; hora: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value || ''
  return { fecha: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` }
}

export function enVentana(hora: string, inicio: string, minutos: number): boolean {
  const [h, m] = hora.split(':').map(Number)
  const [hi, mi] = inicio.split(':').map(Number)
  const x = h * 60 + m
  const a = hi * 60 + mi
  return x >= a && x < a + minutos
}

// `hechas` = claves `${accion}:${reservaRef}` ya registradas en domotica_log.
export function decidirAcciones(
  fecha: string,
  hora: string,
  reservas: ReservaVentana[],
  cfg: ConfigAuto,
  hechas: Set<string>,
): { encender: ReservaVentana[]; apagar: ReservaVentana[] } {
  const encender = cfg.autoOn && enVentana(hora, cfg.horaOn, cfg.ventanaMin)
    ? reservas.filter(r => r.arrival === fecha && !hechas.has(`on:${r.id}`) && !hechas.has(`skip_temp:${r.id}`))
    : []
  const apagar = enVentana(hora, cfg.horaOffCheck, cfg.ventanaMin)
    ? reservas.filter(r => r.departure === fecha && !hechas.has(`off:${r.id}`))
    : []
  return { encender, apagar }
}
