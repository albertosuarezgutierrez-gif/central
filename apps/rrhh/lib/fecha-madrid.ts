/** Fecha de hoy en Madrid (AAAA-MM-DD). El reloj entra aquí, nunca dentro del módulo puro de nóminas (`hoy` se inyecta). */
export function hoyMadrid(ahora: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ahora).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
