import { claveEiacConocida, etiquetaClave, type TablaClaveEiac } from '@central/module-seguros'

/**
 * Rótulos de un recibo CIMA. Puro: lo usa la tabla de recibos de la póliza.
 * `null` = «no consta» (se pinta «—»), nunca un valor de cajón.
 */

/** Clase del recibo (EIAC `clase_recibo`). Un código desconocido se enseña tal cual. */
const CLASES: Record<string, string> = {
  CA: 'Cartera (renovación)',
  NP: 'Nueva producción',
  SU: 'Suplemento',
}

export function etiquetaClaseRecibo(clase: string | null | undefined): string {
  const c = (clase ?? '').trim()
  if (c === '') return '—'
  return CLASES[c.toUpperCase()] ?? etiquetaClave('claseRecibo', c.toUpperCase()) ?? c
}

/** Un código EIAC listo para pintar: `texto` traducido si el estándar lo trae; si no, el código CRUDO y `desconocido`. */
export type RotuloClave = { texto: string; desconocido: boolean }

export const TITULO_CODIGO_COMPANIA = 'Código de la compañía: el estándar EIAC transcrito en el repo no lo documenta'

/** Quita el punto final de las glosas del estándar («Mediador: Comisión por producto.»). */
const sinPunto = (t: string) => t.replace(/\.$/, '')

/** Traduce con la tabla oficial. `null` = no consta (no se pinta). Código fuera de tabla → crudo + `desconocido`. */
export function rotuloClave(tabla: TablaClaveEiac, codigo: string | null | undefined): RotuloClave | null {
  const c = (codigo ?? '').trim()
  if (c === '') return null
  const t = claveEiacConocida(tabla, c) ? etiquetaClave(tabla, c) : claveEiacConocida(tabla, c.toUpperCase()) ? etiquetaClave(tabla, c.toUpperCase()) : null
  return t !== null ? { texto: sinPunto(t), desconocido: false } : { texto: c, desconocido: true }
}

/** «1 cobrado» / «2 cobrados». */
export function conteoPlural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

const VERBO: Record<string, string> = { cobrado: 'cobrado', devuelto: 'devuelto', anulado: 'anulado' }

/** `dd/mm/aaaa` desde `aaaa-mm-dd…`; cualquier otra cosa → `null`. */
function ddmmaaaa(iso: string | null | undefined): string | null {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/**
 * «cobrado el 05/03/2026». Solo para cobrado/devuelto/anulado y con fecha legible:
 * en cualquier otro caso (pendiente, sin fecha) `null`, que no se pinta.
 */
export function textoFechaSituacion(situacion: string, fechaSituacion: string | null | undefined): string | null {
  const verbo = VERBO[situacion]
  const f = ddmmaaaa(fechaSituacion)
  return verbo && f ? `${verbo} el ${f}` : null
}
