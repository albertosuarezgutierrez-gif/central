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
  return CLASES[c.toUpperCase()] ?? c
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
