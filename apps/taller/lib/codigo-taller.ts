// Código de acceso del taller (paso 1 del login: taller → usuario → PIN). Corto, sin caracteres ambiguos (0/O, 1/I/L) al generarlo,
// y tolerante al escribirlo (mayúsculas/minúsculas, espacios y guiones). Es una llave de DISPOSITIVO: el secreto de verdad es el PIN
// de cada persona; el código solo resuelve qué taller es y enseña los nombres de su personal.
export const ALFABETO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const LONGITUD_CODIGO = 8
const FORMATO = /^[A-Z0-9]{6,12}$/

/** Código aleatorio (CSPRNG por defecto; `aleatorio` inyectable para tests). Rechazo para no sesgar el módulo 31. */
export function generarCodigoTaller(aleatorio: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  const limite = Math.floor(0x1_0000_0000 / ALFABETO_CODIGO.length) * ALFABETO_CODIGO.length
  let s = ''
  while (s.length < LONGITUD_CODIGO) {
    const n = aleatorio()
    if (n >= limite) continue
    s += ALFABETO_CODIGO[n % ALFABETO_CODIGO.length]
  }
  return s
}

/** Normaliza lo que escribe la persona; null si no tiene forma de código. */
export function normalizarCodigoTaller(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.toUpperCase().replace(/[\s-]/g, '')
  return FORMATO.test(t) ? t : null
}

/** XXXX-XXXX para enseñarlo. */
export function formatearCodigoTaller(c: string): string {
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}
