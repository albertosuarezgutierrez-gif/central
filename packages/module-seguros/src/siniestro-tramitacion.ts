/**
 * Claves oficiales EIAC V07.1 de la tramitación de un siniestro (Documentos
 * Estándar §13.3.44/.47/.48/.81/.82) y su lectura para el CORREDOR.
 *
 * El CRM (repo `asegura`, #852) guarda lo que manda la compañía en
 * `siniestros.situaciones_cima` / `acciones_cima` / `pagos_cima` (jsonb que se
 * FUSIONAN fichero a fichero) y `reserva_cima`, `indemnizacion_cima`,
 * `total_pagos_cima`, `posicion_cima`.
 *
 * Aquí viven las TABLAS oficiales y `tramitacionCompania()`, la vista del
 * corredor (el portal del cliente tiene su propia redacción en
 * `module-seguros-portal/siniestro-tramitacion.ts`, sin descripción, figuras,
 * reserva ni culpa): TODO lo que manda la compañía, con su descripción libre, las figuras
 * que intervienen, la reserva y la posición de culpa.
 *
 * Una clave fuera de tabla no se inventa: se enseña el código tal cual, marcado
 * como no reconocido, para que el corredor lo vea y no se pierda.
 */

export const EIAC_SITUACION_SINIESTRO: Readonly<Record<string, string>> = Object.freeze({
  AP: 'Abierto',
  CE: 'Cerrado',
  RA: 'Reabierto',
  RC: 'Rechazado',
})

export const EIAC_ACCION_SINIESTRO: Readonly<Record<string, string>> = Object.freeze({
  DI: 'Documentación / información',
  EJ: 'Vía judicial',
  EP: 'Peritación',
  ER: 'Reparación',
  IN: 'Indemnización',
})

export const EIAC_SITUACION_ACCION: Readonly<Record<string, string>> = Object.freeze({
  PD: 'Pendiente de inicio',
  EC: 'En curso',
  FI: 'Finalizada',
})

export const EIAC_FIGURA_ACCION: Readonly<Record<string, string>> = Object.freeze({
  AB: 'Abogado / procurador',
  EA: 'Empresa de asistencia',
  PE: 'Perito',
  RE: 'Reparador',
  TA: 'Taller',
  TR: 'Tramitador',
})

/** `PosicionSiniestro` = CULPA, no estado. */
export const EIAC_POSICION_SINIESTRO: Readonly<Record<string, string>> = Object.freeze({
  CU: 'Culpa',
  RE: 'Reclamación',
  IN: 'Indeterminado',
  NA: 'No aplica',
})

/** Orden de avance de una acción: si llegan dos fotos de la misma, gana la más avanzada. */
const ORDEN_SITUACION_ACCION: Readonly<Record<string, number>> = { PD: 1, EC: 2, FI: 3 }

export type ClaveLeida = {
  codigo: string
  /** `null` = código fuera de la tabla oficial: se enseña el código, no se inventa. */
  texto: string | null
}

export type PasoTramitacionCorredor = {
  /** `YYYY-MM-DD`; `null` = sin fecha. */
  fecha: string | null
  tipo: 'situacion' | 'accion' | 'pago'
  /** Situación del siniestro, acción o, en un pago, el receptor (figura). */
  clave: ClaveLeida | null
  /** Solo en acciones: en qué punto está. */
  estadoAccion: ClaveLeida | null
  /** Solo en acciones: quién interviene (perito, taller…), sin nombres. */
  figuras: ClaveLeida[]
  /** Texto libre de la compañía. El corredor lo ve; el cliente, no. */
  descripcion: string | null
  /** Solo en pagos. */
  importe: number | null
}

export type TramitacionCompania = {
  pasos: PasoTramitacionCorredor[]
  reserva: number | null
  indemnizacion: number | null
  totalPagado: number | null
  posicion: ClaveLeida | null
}

export type TramitacionCruda = {
  situaciones: unknown
  acciones: unknown
  pagos: unknown
  reserva: unknown
  indemnizacion: unknown
  totalPagos: unknown
  posicion: unknown
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

const fechaIso = (v: unknown): string | null => {
  const t = texto(v)
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

/** Decimal de Prisma, string o número → número finito; cualquier otra cosa → `null` (nunca 0). */
export function importeEiacNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

const lista = (v: unknown): Record<string, unknown>[] | null =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : null

/** Lee una clave contra su tabla. Vacía → `null`; fuera de tabla → `{codigo, texto:null}`. */
export function leerClaveEiac(tabla: Readonly<Record<string, string>>, v: unknown): ClaveLeida | null {
  const codigo = texto(v)?.toUpperCase()
  if (!codigo) return null
  return { codigo, texto: tabla[codigo] ?? null }
}

/** Texto de una clave para pantalla: el oficial o, si no está en tabla, «código XX». */
export function textoClave(c: ClaveLeida | null): string | null {
  if (!c) return null
  return c.texto ?? `código ${c.codigo}`
}

/**
 * Vista del CORREDOR de lo que manda la compañía. `null` = no manda nada de
 * esto (la mayoría de las compañías, o fichero anterior a que se guardara).
 * Defensivo: el jsonb lo escribe otro repo; una entrada rara se descarta.
 */
export function tramitacionCompania(e: TramitacionCruda): TramitacionCompania | null {
  const sits = lista(e.situaciones)
  const accs = lista(e.acciones)
  const pags = lista(e.pagos)
  const reserva = importeEiacNumero(e.reserva)
  const indemnizacion = importeEiacNumero(e.indemnizacion)
  const totalPagado = importeEiacNumero(e.totalPagos)
  const posicion = leerClaveEiac(EIAC_POSICION_SINIESTRO, e.posicion)
  if (
    sits === null && accs === null && pags === null &&
    reserva === null && indemnizacion === null && totalPagado === null && posicion === null
  ) {
    return null
  }

  const pasos: PasoTramitacionCorredor[] = []

  for (const s of sits ?? []) {
    const clave = leerClaveEiac(EIAC_SITUACION_SINIESTRO, s.codigo)
    if (!clave) continue
    pasos.push({
      fecha: fechaIso(s.fecha), tipo: 'situacion', clave, estadoAccion: null, figuras: [],
      descripcion: texto(s.descripcion), importe: null,
    })
  }

  // La fusión del CRM guarda cada foto distinta de una acción: se pinta UNA por
  // (acción, fecha, descripción), la más avanzada.
  const acciones = new Map<string, { paso: PasoTramitacionCorredor; orden: number }>()
  for (const a of accs ?? []) {
    const clave = leerClaveEiac(EIAC_ACCION_SINIESTRO, a.accion)
    if (!clave) continue
    const fecha = fechaIso(a.fecha)
    const descripcion = texto(a.descripcion)
    const estadoAccion = leerClaveEiac(EIAC_SITUACION_ACCION, a.situacion)
    const figuras = (Array.isArray(a.figuras) ? a.figuras : [])
      .map((f) => leerClaveEiac(EIAC_FIGURA_ACCION, f))
      .filter((f): f is ClaveLeida => f !== null)
    const orden = estadoAccion ? ORDEN_SITUACION_ACCION[estadoAccion.codigo] ?? 0 : 0
    const k = `${clave.codigo}|${fecha ?? ''}|${descripcion ?? ''}`
    const previa = acciones.get(k)
    if (!previa || orden > previa.orden) {
      acciones.set(k, {
        orden,
        paso: { fecha, tipo: 'accion', clave, estadoAccion, figuras, descripcion, importe: null },
      })
    }
  }
  for (const { paso } of acciones.values()) pasos.push(paso)

  for (const p of pags ?? []) {
    const importe = importeEiacNumero(p.importe)
    if (importe === null) continue
    pasos.push({
      fecha: fechaIso(p.fecha), tipo: 'pago', clave: leerClaveEiac(EIAC_FIGURA_ACCION, p.receptor),
      estadoAccion: null, figuras: [], descripcion: texto(p.descripcion), importe,
    })
  }

  pasos.sort((a, b) => {
    if (a.fecha === b.fecha) return 0
    if (a.fecha === null) return 1
    if (b.fecha === null) return -1
    return a.fecha < b.fecha ? -1 : 1
  })

  return { pasos, reserva, indemnizacion, totalPagado, posicion }
}
