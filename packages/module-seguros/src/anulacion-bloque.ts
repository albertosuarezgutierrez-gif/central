/**
 * Señales INFORMATIVAS del vigía de ingesta sobre anulaciones (06/10/2026).
 *
 * Caso real: el POL de Mapfre del 05/10 trajo 47 pólizas y 25 en AN (53%),
 * casi todas anulaciones antiguas (mediana ~14 meses entre la fecha de anulación
 * y la llegada). Nada del vigía lo veía: `fotoSospechosa` solo mira desapariciones.
 *
 * Aquí viven los helpers PUROS (sin BD, sin datos personales en los textos):
 *  - `evaluarAnulacionesEnBloque`: ¿un fichero POL trae demasiadas AN?
 *  - `textoRenovacionesAnuladas`: renovación que la compañía ANULÓ (≠ «no llega»).
 *  - `textoRetrasoAnulacion`: mediana de días fecha de anulación → llegada.
 *  - `agruparPosiblesBajas` / `textoPosiblesBajas`: recibo anulado sin reemisión.
 *
 * Tres estados en todas: `undefined` = no se pide · `null` = no se pudo mirar ·
 * `[]` = se miró y no hay. Un retraso sin fecha legible es `null`, nunca 0.
 */

/** Ventana de los ficheros POL que se miran. */
export const HORAS_VENTANA_ANULACION_BLOQUE = 48
/** Un fichero es «en bloque» con ≥ este porcentaje de pólizas en AN… */
export const UMBRAL_ANULACION_BLOQUE = 0.3
/** …y al menos estas pólizas en AN (un fichero de 2 con 1 anulada no es un bloque). */
export const MIN_ANULADAS_BLOQUE = 10
/** Ventana (horas) del pre-aviso «recibo anulado sin reemisión». */
export const HORAS_RECIBO_ANULADO_SIN_REEMISION = 72

/** Fila agregada por fichero POL (la calcula la consulta). */
export type FicheroAnulacionFila = {
  entidad: string
  entidadNombre: string | null
  fichero: string
  /** Pólizas del fichero (máx. de las enlazadas y las declaradas). */
  polizas: number
  /** Pólizas en situación AN. */
  anuladas: number
  impago: number
  otraCompania: number
  siniestralidad: number
  /** Otros motivos y AN sin motivo legible. */
  otros: number
  /** Mediana de días fecha de anulación → llegada; `null` = ninguna fecha legible. */
  medianaDiasRetraso: number | null
}

export type AnulacionEnBloque = FicheroAnulacionFila

/**
 * Filtra los ficheros que son una anulación en bloque: ≥30% de las pólizas y ≥10.
 * Más anuladas primero; a igualdad, el nombre del fichero (orden estable).
 */
export function evaluarAnulacionesEnBloque(filas: FicheroAnulacionFila[]): AnulacionEnBloque[] {
  return filas
    .filter(f => f.polizas > 0 && f.anuladas >= MIN_ANULADAS_BLOQUE && f.anuladas / f.polizas >= UMBRAL_ANULACION_BLOQUE)
    .sort((a, b) => b.anuladas - a.anuladas || a.fichero.localeCompare(b.fichero))
}

function dias(n: number | null): string {
  return n === null ? 'sin fecha legible' : `${n} d`
}

/**
 * «📉 Anulación en bloque: Mapfre, fichero X: 25/47 pólizas en AN (53%) — 11
 * impago · 9 otra compañía · 5 siniestralidad · 0 otros; mediana 369 d entre la
 * anulación y su llegada: es histórico que llega de golpe, confirma en el portal.»
 */
export function textoAnulacionesEnBloque(lista: AnulacionEnBloque[] | null | undefined): string {
  if (!lista || lista.length === 0) return ''
  const partes = lista.map(f => {
    const pct = Math.round((f.anuladas / f.polizas) * 100)
    return `${f.entidadNombre ?? f.entidad}, fichero ${f.fichero}: ${f.anuladas}/${f.polizas} pólizas en AN (${pct}%) — ` +
      `${f.impago} impago · ${f.otraCompania} otra compañía · ${f.siniestralidad} siniestralidad · ${f.otros} otros; ` +
      `mediana ${dias(f.medianaDiasRetraso)} entre la anulación y su llegada`
  })
  return `📉 Anulación en bloque: ${partes.join(' | ')}. Comprueba en el portal de la compañía si son bajas nuevas ` +
    'o histórico que llega de golpe.'
}

/** Retraso por compañía (anulación → llegada), últimos 30 días de ficheros. */
export type RetrasoAnulacion = {
  entidad: string
  entidadNombre: string | null
  /** Pólizas en AN con fecha de anulación legible que entran en la mediana. */
  polizas: number
  medianaDias: number | null
}

export function textoRetrasoAnulacion(lista: RetrasoAnulacion[] | null | undefined): string {
  if (!lista || lista.length === 0) return ''
  const partes = [...lista]
    .sort((a, b) => b.polizas - a.polizas || a.entidad.localeCompare(b.entidad))
    .map(r => `${r.entidadNombre ?? r.entidad} ${dias(r.medianaDias)} (${r.polizas} póliza(s))`)
  return `⏱️ Retraso de las anulaciones (mediana de la fecha de anulación a su llegada por CIMA, ficheros de 30 días): ${partes.join(' · ')}.`
}

/** Normaliza: sin compañías vacías y en orden estable (para firma y texto). */
export function ordenarRetraso(lista: RetrasoAnulacion[]): RetrasoAnulacion[] {
  return lista.filter(r => r.polizas > 0).sort((a, b) => b.polizas - a.polizas || a.entidad.localeCompare(b.entidad))
}

/** Misma forma que `RenovacionSinLlegar` (se redefine para no acoplar ficheros). */
export type RenovacionAnuladaPorCompania = {
  entidad: string
  entidadNombre: string | null
  polizas: number
  vencimientoMasAntiguo: string | null
}

/**
 * «ℹ️ Mapfre anuló la renovación de 4 póliza(s): probablemente no renovada,
 * confirmar en el portal.» No es hueco de CIMA ni se reclama: la compañía SÍ ha
 * mandado, y lo que mandó es la anulación.
 */
export function textoRenovacionesAnuladas(lista: RenovacionAnuladaPorCompania[] | null | undefined): string {
  if (!lista || lista.length === 0) return ''
  const partes = lista.filter(r => r.polizas > 0).map(r => `${r.entidadNombre ?? r.entidad} anuló la renovación de ${r.polizas} póliza(s)`)
  if (partes.length === 0) return ''
  return `ℹ️ ${partes.join(' · ')}: probablemente no renovada(s), confirmar en el portal (no es un hueco de CIMA ni hay nada que reclamar).`
}

/** Póliza en vigor con su último recibo anulado y sin reemisión. */
export type PosibleBaja = {
  entidad: string
  entidadNombre: string | null
  numeroPoliza: string
}

export type PosiblesBajasPorCompania = {
  entidad: string
  entidadNombre: string | null
  numeros: string[]
}

/** Agrupa por compañía; números ordenados y sin repetir. Sin datos personales. */
export function agruparPosiblesBajas(lista: PosibleBaja[]): PosiblesBajasPorCompania[] {
  const m = new Map<string, PosiblesBajasPorCompania>()
  for (const b of lista) {
    const n = b.numeroPoliza.trim()
    if (!n) continue
    const g = m.get(b.entidad) ?? { entidad: b.entidad, entidadNombre: b.entidadNombre, numeros: [] }
    if (!g.numeros.includes(n)) g.numeros.push(n)
    m.set(b.entidad, g)
  }
  return [...m.values()]
    .map(g => ({ ...g, numeros: g.numeros.sort() }))
    .sort((a, b) => b.numeros.length - a.numeros.length || a.entidad.localeCompare(b.entidad))
}

const TOPE_NUMEROS_POR_COMPANIA = 5

export function textoPosiblesBajas(lista: PosiblesBajasPorCompania[] | null | undefined): string {
  if (!lista || lista.length === 0) return ''
  const partes = lista.filter(g => g.numeros.length > 0).map(g => {
    const vistos = g.numeros.slice(0, TOPE_NUMEROS_POR_COMPANIA).join(', ')
    const resto = g.numeros.length > TOPE_NUMEROS_POR_COMPANIA ? ` y ${g.numeros.length - TOPE_NUMEROS_POR_COMPANIA} más` : ''
    return `${g.entidadNombre ?? g.entidad} ${g.numeros.length} (${vistos}${resto})`
  })
  if (partes.length === 0) return ''
  return `🔔 Posible baja en camino (aún sin POL): último recibo anulado o a cero y sin recibo nuevo en ` +
    `${HORAS_RECIBO_ANULADO_SIN_REEMISION} h — ${partes.join(' · ')}.`
}

/** Tramo de firma: qué ficheros/compañías/pólizas, para que suene al cambiar (sin el retraso). */
export function tramoFirmaAnulaciones(e: {
  bloque: AnulacionEnBloque[] | null | undefined
  bajas: PosiblesBajasPorCompania[] | null | undefined
  anuladas: RenovacionAnuladaPorCompania[] | null | undefined
}): string {
  // Sin `:` dentro (separa tramos) ni `,` ambiguas: `;` entre grupos.
  const un = <T>(v: T[] | null | undefined, f: (x: T) => string) =>
    v === null ? '?' : v === undefined ? '' : v.map(f).sort().join(';')
  const b = un(e.bloque, x => `${x.entidad}=${x.fichero}`)
  const p = un(e.bajas, x => `${x.entidad}=${x.numeros.join('+').replace(/[:|;\[\]]/g, '_')}`)
  const a = un(e.anuladas, x => `${x.entidad}=${x.polizas}`)
  // El retraso NO entra: su mediana se mueve con cada fichero y haría sonar el aviso sin cambio real.
  return `[${b}|${p}|${a}]`
}
