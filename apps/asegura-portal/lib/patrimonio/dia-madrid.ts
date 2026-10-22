// PATRIMONIO (22/10/2026, paso 7) — el «día» de un tope diario es el de ESPAÑA (Europe/Madrid), no el de UTC: a las 00:30
// de Madrid en verano todavía es «ayer» en UTC y el contador no se reiniciaría hasta las 02:00. PURO: el reloj se inyecta.
const ZONA = 'Europe/Madrid'

/** Desfase (minutos, +60/+120 para Madrid) de la zona en el instante dado. */
function desfaseMin(d: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return Math.round((local - Math.floor(d.getTime() / 1000) * 1000) / 60_000)
}

/** `YYYY-MM-DD` del día de Madrid al que pertenece el instante. */
export function fechaMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/** El instante (UTC) en que empezó el día de Madrid de `ahora`: las 00:00 locales. */
export function inicioDiaMadrid(ahora: Date): Date {
  const [y, m, d] = fechaMadrid(ahora).split('-').map(Number)
  const medianocheComoUtc = Date.UTC(y, m - 1, d)
  // Dos pasadas: el desfase se mide en el instante resultante (las 00:00 de Madrid nunca caen en un cambio horario).
  let t = medianocheComoUtc - desfaseMin(new Date(medianocheComoUtc)) * 60_000
  t = medianocheComoUtc - desfaseMin(new Date(t)) * 60_000
  return new Date(t)
}
