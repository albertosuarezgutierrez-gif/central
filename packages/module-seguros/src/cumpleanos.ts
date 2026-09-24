// Felicitar el cumpleaños (Alberto, 24/09/2026: «felicitar por mail y app los cumpleaños»).
//
// Regla pura: ¿es hoy el cumpleaños de quien nació en `fechaNacimiento`? «Hoy» es el día de
// Madrid, no el UTC: un cron a las 07:00 UTC y una pantalla abierta a las 00:30 tienen que decir
// lo mismo. Quien nació un 29 de febrero lo celebra el 28 en los años que no son bisiestos (si
// no, tres de cada cuatro años no se le felicitaría nunca).
//
// Una fecha que no es una fecha real, o posterior a hoy, NO es un cumpleaños: es un dato que no
// se ha sabido leer, y felicitar con él sería inventárselo.

const ZONA = 'Europe/Madrid'

/** `YYYY-MM-DD` del día de Madrid para ese instante. */
export function diaMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

function fechaReal(v: string | null | undefined): { anio: number; mes: number; dia: number } | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) ?? null
  const es = m ? null : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  const [anio, mes, dia] = m ? [+m[1]!, +m[2]!, +m[3]!] : es ? [+es[3]!, +es[2]!, +es[1]!] : [NaN, NaN, NaN]
  if (!Number.isInteger(anio) || anio < 1900) return null
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return { anio, mes, dia }
}

const bisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0

/** `true` si hoy (día de Madrid) es su cumpleaños. `null` en la fecha = no se sabe = no se felicita. */
export function esCumpleanos(fechaNacimiento: string | null | undefined, ahora: Date): boolean {
  const n = fechaReal(fechaNacimiento)
  if (!n) return false
  const [a, m, d] = diaMadrid(ahora).split('-').map(Number) as [number, number, number]
  if (n.anio >= a) return false
  if (n.mes === 2 && n.dia === 29 && !bisiesto(a)) return m === 2 && d === 28
  return n.mes === m && n.dia === d
}

/** El año del cumpleaños que se celebra hoy (clave del sello: una felicitación por persona y año). */
export function anioCumpleanos(ahora: Date): number {
  return Number(diaMadrid(ahora).slice(0, 4))
}
