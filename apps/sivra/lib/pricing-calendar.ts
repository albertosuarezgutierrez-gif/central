// Calendario de eventos / temporada / día de la semana de Sevilla.
// Extraído de app/api/rates/snapshot para reutilizarlo también en el motor (apply/recommend).
//
// - EVENTS:   multiplicador absoluto para fechas con evento (Semana Santa, Feria, congresos…).
// - SEASONAL: multiplicador por mes (enero=0 … diciembre=11).
// - DOW:      multiplicador por día de la semana (lunes=0 … domingo=6).

export const EVENTS: Record<string, number> = {
  "2026-03-29":2.20,"2026-03-30":2.30,"2026-03-31":2.40,"2026-04-01":2.50,
  "2026-04-02":2.60,"2026-04-03":3.00,"2026-04-04":2.80,"2026-04-05":2.50,
  "2026-04-18":2.75,"2026-04-20":2.50,"2026-04-21":2.80,"2026-04-22":3.00,
  "2026-04-23":3.20,"2026-04-24":3.50,"2026-04-25":3.00,"2026-04-26":2.80,
  "2026-05-04":1.30,"2026-05-05":1.30,"2026-05-06":1.30,"2026-05-07":1.30,
  "2026-05-08":1.30,"2026-05-09":1.30,"2026-05-15":1.20,"2026-05-16":1.40,
  "2026-05-22":1.40,"2026-05-23":1.50,"2026-05-24":1.50,"2026-05-25":1.40,
  "2026-06-06":1.40,"2026-06-12":1.40,"2026-06-13":1.60,"2026-06-14":1.60,
  "2026-06-19":1.60,"2026-06-20":1.60,"2026-06-21":1.30,"2026-06-26":1.40,
  "2026-07-03":1.40,"2026-07-16":1.50,"2026-07-18":1.30,
  "2026-11-16":1.40,"2026-11-17":1.40,"2026-11-18":1.40,"2026-11-19":1.40,
  "2026-11-20":1.40,"2026-11-21":1.35,"2026-11-22":1.30,"2026-12-31":1.60,
  // --- 2027 (ESTIMADO; confirmar fechas oficiales antes de la temporada) ---
  // Semana Santa 2027 (Domingo de Resurrección 28-mar): la Madrugá (25-26 mar) es el pico.
  "2027-03-21":2.20,"2027-03-22":2.30,"2027-03-23":2.40,"2027-03-24":2.50,
  "2027-03-25":3.00,"2027-03-26":3.20,"2027-03-27":2.80,"2027-03-28":2.50,
  // Feria de Abril 2027 (~2 semanas tras Semana Santa): estimada 18-25 abr.
  "2027-04-18":2.50,"2027-04-19":2.60,"2027-04-20":2.80,"2027-04-21":3.00,
  "2027-04-22":3.20,"2027-04-23":3.20,"2027-04-24":3.00,"2027-04-25":2.60,
}

// Horizonte de pricing: hasta cuántos días vista se captura (snapshot) y se tarifica (apply).
// Ampliado 90→365 para captar reservas de larga antelación (sobre todo extranjeros) y los
// eventos de la próxima temporada (Semana Santa / Feria del año siguiente).
export const PRICING_HORIZON_DAYS = 365

// Última fecha con evento cargado. Si el horizonte de pricing la sobrepasa, el agente avisa
// (watchdog en pilot-track) para que el calendario de eventos NO caduque en silencio cada año.
export const EVENTS_LAST_DATE = Object.keys(EVENTS).sort().slice(-1)[0]
export const SEASONAL = [0.65,0.65,1.10,1.00,1.40,1.45,0.85,0.85,1.40,1.10,1.10,1.00]
export const DOW      = [0.95,0.88,0.88,0.90,0.95,1.12,1.18]

// Multiplicador absoluto sobre una base (uso del snapshot "shadow": price_ours).
export function calcOurs(base: number, dateStr: string): number {
  const d   = new Date(dateStr + "T00:00:00")
  const mon = d.getMonth()
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  return Math.round(base * Math.max(EVENTS[dateStr] ?? 0, SEASONAL[mon]) * DOW[dow])
}

// Factor RELATIVO de evento para el motor anclado al mercado: sólo sube en fechas con evento
// declarado (Semana Santa/Feria/…); el resto de estacionalidad/día ya la refleja el mercado.
// Acotado para que no se dispare. Devuelve 1.0 si no hay evento ese día.
export function eventFactor(dateStr: string): number {
  const e = EVENTS[dateStr]
  if (!e) return 1.0
  return Math.max(1.0, Math.min(e, 1.5)) // +50% máx. de premium por evento
}
