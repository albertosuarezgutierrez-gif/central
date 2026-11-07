// ANTECEDENTES DE SINIESTRALIDAD desde CIMA (07/11/2026). PURO: sin BD ni reloj (`hoy` se inyecta).
//
// Qué responde: «¿cuántos siniestros CON CULPA en los últimos 5 años trae CIMA para las pólizas de auto/moto de este cliente?»
// Tres estados (regla del repo: dato que NO hay ≠ dato que NO se ha mirado):
//   · `null` = NO SE PUEDE AFIRMAR (dentro de la ventana hay una fila con posición IN/NA/NULL sin culpa probada, sin fecha de
//     ocurrencia o sin referencia). Se marca pendiente; NUNCA se cuenta como 0.
//   · `0`    = revisado: ningún siniestro con culpa en la ventana.
//   · `N`    = nº de REFERENCIAS DISTINTAS con culpa. Regla de Alberto (07/11/2026): un siniestro es UNO, identificado por el
//     nº de siniestro de la compañía (`id_siniestro_entidad`, respaldo `referencia`) + código DGS de la entidad, aunque haya
//     varios contrarios o varias filas. Dos filas SIN referencia no se funden: hacen el resultado `null`.
// Culpa = `posicion_cima` CU (clave EIAC claves_posicionsiniestro) O `responsabilidad_cima` CAUSANTE. RE (reclamación) con
// responsabilidad que no sea CAUSANTE no es culpa. Fuera de la ventana (anterior a hoy − 5 años) no cuenta, sea cual sea.
// ASISTENCIA fuera (Alberto, 07/11/2026): un siniestro cuya tipología EIAC (`siniestros.tipo`, clave 13.3.86) es del grupo 11
// «Asistencia» (11, 1101-1107: cerrajería, en viaje, jurídica, manitas…, «Otras Asistencias») NO es un siniestro con culpa y no
// cuenta NI duda, estén donde estén. Sin `tipo` o con un código fuera de la tabla no se distingue: se trata como siniestro normal
// (no se inventa). NO se mira el estado abierto/cerrado del siniestro (se sospecha que está mal).
// Que sea válido SOLO lo decide quien llama: únicamente si la póliza tiene historial CIMA (cartera en vigor).

import { descripcionEiacSiniestro } from './eiac-siniestros.ts'

export type FilaSiniestroCima = {
  idSiniestroEntidad?: string | null
  referencia?: string | null
  codigoEntidadDgs?: string | null
  posicionCima?: string | null
  responsabilidadCima?: string | null
  /** Tipología EIAC (`tipo`, clave 13.3.86). `null` = no consta. */
  tipo?: string | null
  /** Fecha de OCURRENCIA (`fecha_hora`). `null` = no consta. */
  fechaHora?: Date | string | null
}

/** Años de la ventana de antecedentes. */
export const VENTANA_ANTECEDENTES_ANIOS = 5

const limpio = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim().toUpperCase() : '')

function dia(v: Date | string | null | undefined): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10)
  return null
}

/** Primer día de la ventana (inclusive): `hoy` menos 5 años, AAAA-MM-DD en UTC. */
export function inicioVentanaAntecedentes(hoy: Date): string {
  const d = new Date(Date.UTC(hoy.getUTCFullYear() - VENTANA_ANTECEDENTES_ANIOS, hoy.getUTCMonth(), hoy.getUTCDate()))
  return d.toISOString().slice(0, 10)
}

/** Tipología del grupo 11 «Asistencia» de la tabla oficial (11, 1101-1107). Código ausente o fuera de la tabla → `false`. */
export function esSiniestroDeAsistenciaCima(tipo: string | null | undefined): boolean {
  const c = typeof tipo === 'string' ? tipo.trim() : ''
  return /^11(0[1-7])?$/.test(c) && descripcionEiacSiniestro(c) !== null
}

export function esSiniestroConCulpaCima(f: Pick<FilaSiniestroCima, 'posicionCima' | 'responsabilidadCima'>): boolean {
  return limpio(f.posicionCima) === 'CU' || limpio(f.responsabilidadCima) === 'CAUSANTE'
}

type Estado = 'culpa' | 'sin_culpa' | 'incierta'

/**
 * Siniestros con culpa en los últimos 5 años según las filas de CIMA. `null` = no se puede afirmar; `0` = revisado, ninguno;
 * `N` = referencias distintas con culpa. PURA (`hoy` inyectado).
 */
export function siniestrosConCulpaCima(filas: readonly FilaSiniestroCima[], hoy: Date): number | null {
  const desde = inicioVentanaAntecedentes(hoy)
  const grupos = new Map<string, Estado>()
  let incierto = false
  for (const f of filas) {
    if (esSiniestroDeAsistenciaCima(f.tipo)) continue // asistencia (grúa, viaje…): no es siniestro con culpa
    const fecha = dia(f.fechaHora)
    if (fecha === null) { incierto = true; continue } // sin fecha de ocurrencia: podría estar dentro de la ventana
    if (fecha < desde) continue // antiguo: no cuenta
    const ref = limpio(f.idSiniestroEntidad) || limpio(f.referencia)
    if (ref === '') { incierto = true; continue } // sin referencia no se puede contar ni fundir
    const estado: Estado = esSiniestroConCulpaCima(f) ? 'culpa' : limpio(f.posicionCima) === 'RE' ? 'sin_culpa' : 'incierta'
    const clave = `${limpio(f.codigoEntidadDgs)}|${ref}`
    const previo = grupos.get(clave)
    // En una misma referencia manda la culpa probada; después lo incierto; sin culpa solo si ninguna fila dice otra cosa.
    grupos.set(clave, previo === 'culpa' || estado === 'culpa' ? 'culpa' : previo === 'incierta' || estado === 'incierta' ? 'incierta' : 'sin_culpa')
  }
  let n = 0
  for (const e of grupos.values()) {
    if (e === 'culpa') n++
    else if (e === 'incierta') incierto = true
  }
  return incierto ? null : n
}
