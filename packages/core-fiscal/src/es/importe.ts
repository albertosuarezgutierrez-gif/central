// Importes y fechas en el formato que exige la AEAT (VeriFactu). Lógica PURA.
//
// Dinero: la API de VeriFactu trabaja SIEMPRE en CÉNTIMOS ENTEROS (number entero, puede ser negativo en una
// rectificativa por diferencias). Solo al escribir la huella, el QR o el XML se pasa a «12.34» (punto decimal,
// 2 decimales, sin separador de miles). Un importe no entero es un error de programación: se lanza, no se redondea.

export class ErrorVerifactu extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorVerifactu'
  }
}

/** Comprueba que `c` es un número entero de céntimos. Lanza si no. */
export function exigirCentimos(c: number, campo: string): number {
  if (typeof c !== 'number' || !Number.isSafeInteger(c)) {
    throw new ErrorVerifactu(`${campo}: se esperaban céntimos enteros y llegó ${String(c)}`)
  }
  return c
}

/** Céntimos enteros → «12.34» (formato decimal AEAT). 5 → «0.05»; -1234 → «-12.34». */
export function centimosAImporte(c: number, campo = 'importe'): string {
  exigirCentimos(c, campo)
  const neg = c < 0
  const abs = Math.abs(c)
  const euros = Math.floor(abs / 100)
  const cent = abs % 100
  return `${neg ? '-' : ''}${euros}.${String(cent).padStart(2, '0')}`
}

/**
 * Euros (number con decimales, p. ej. de una columna `numeric`) → céntimos enteros.
 * Para ADAPTADORES de apps que aún guardan euros. Redondea al céntimo más cercano.
 */
export function eurosACentimos(euros: number): number {
  if (typeof euros !== 'number' || !Number.isFinite(euros)) {
    throw new ErrorVerifactu(`eurosACentimos: importe no numérico (${String(euros)})`)
  }
  return Math.round(euros * 100)
}

/** Tipo impositivo en puntos porcentuales (21, 10, 5.5…) → «21.00». */
export function formatoTipoImpositivo(tipo: number): string {
  if (typeof tipo !== 'number' || !Number.isFinite(tipo) || tipo < 0 || tipo >= 100) {
    throw new ErrorVerifactu(`TipoImpositivo fuera de rango: ${String(tipo)}`)
  }
  return tipo.toFixed(2)
}

// ── Fechas ───────────────────────────────────────────────────────────────────

const RE_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const RE_FECHA_HORA_HUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

/** «2026-05-02» → «02-05-2026» (FechaExpedicionFactura, QR). Lanza si no es AAAA-MM-DD. */
export function fechaAeat(fechaIso: string): string {
  const m = RE_FECHA_ISO.exec(fechaIso.trim())
  if (!m) throw new ErrorVerifactu(`Fecha no válida (se espera AAAA-MM-DD): ${fechaIso}`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Valida FechaHoraHusoGenRegistro: «AAAA-MM-DDThh:mm:ss+hh:mm» (ISO 8601 con huso, sin milisegundos ni «Z»). */
export function exigirFechaHoraHuso(v: string): string {
  const t = v.trim()
  if (!RE_FECHA_HORA_HUSO.test(t)) {
    throw new ErrorVerifactu(`FechaHoraHusoGenRegistro no válida (AAAA-MM-DDThh:mm:ss±hh:mm): ${v}`)
  }
  return t
}

/**
 * Instante → «AAAA-MM-DDThh:mm:ss±hh:mm» en hora LOCAL del huso indicado (por defecto Europe/Madrid),
 * independiente del TZ del servidor (Vercel corre en UTC). Es el valor de FechaHoraHusoGenRegistro;
 * sus 10 primeros caracteres son la fecha local (FechaExpedicionFactura de un ticket emitido al momento).
 */
export function fechaHoraHuso(instante: Date, zona = 'Europe/Madrid'): string {
  const t = Math.floor(instante.getTime() / 1000) * 1000
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t))
  const p = (tipo: string) => partes.find(x => x.type === tipo)?.value ?? '00'
  const Y = p('year'), M = p('month'), D = p('day'), h = p('hour'), mi = p('minute'), s = p('second')
  const comoUtc = Date.UTC(Number(Y), Number(M) - 1, Number(D), Number(h), Number(mi), Number(s))
  const offMin = Math.round((comoUtc - t) / 60000)
  const signo = offMin >= 0 ? '+' : '-'
  const a = Math.abs(offMin)
  const huso = `${signo}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
  return `${Y}-${M}-${D}T${h}:${mi}:${s}${huso}`
}
