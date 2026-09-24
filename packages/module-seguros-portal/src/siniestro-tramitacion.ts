/**
 * La tramitación de un siniestro tal y como la cuenta la COMPAÑÍA por EIAC
 * (V07.1, Documentos Estándar §13.3.44/.47/.48/.81): situaciones, acciones
 * (peritación, reparación…) y pagos. La guarda el CRM en
 * `siniestros.situaciones_cima` / `acciones_cima` / `pagos_cima` (jsonb, se
 * FUSIONAN fichero a fichero) y `total_pagos_cima` / `indemnizacion_cima`.
 *
 * Qué se enseña al cliente y qué no (regla de visibilidad del 03/09/2026):
 * - Los PASOS con su fecha, traducidos de la clave oficial. Una clave que no
 *   está en la tabla NO se pinta: «Acción XX» no le dice nada a nadie.
 * - 🚫 NUNCA la `descripcion` libre de la compañía ni las FIGURAS de una acción:
 *   ahí viajan nombres de tramitador, perito o taller, que son gestión del
 *   corredor. Por eso `PasoTramitacion` ni siquiera tiene sitio para ellas.
 * - 🚫 NUNCA la reserva ni la posición de culpa: la reserva es lo que la
 *   compañía aparta, no lo que va a pagar, y enseñarla crea expectativas; la
 *   culpa es una valoración que discute el corredor. El portal ni las lee.
 * - Un PAGO dice a quién va cuando la clave lo dice («al taller»): un pago al
 *   perito no es dinero para el cliente, y «la compañía ha pagado 500€» a secas
 *   se leería como «me han pagado».
 *
 * Tres estados, como en todo el portal: `null` = la compañía no manda esto (la
 * mayoría: solo Occident y Allianz lo hacen, y solo desde que se guarda) ·
 * lista vacía = lo mandó sin pasos · con pasos = la línea.
 */

const SITUACION_SINIESTRO: Record<string, string> = {
  AP: 'La compañía abrió el siniestro',
  CE: 'La compañía cerró el siniestro',
  RA: 'La compañía reabrió el siniestro',
  RC: 'La compañía rechazó el siniestro',
}

const ACCION: Record<string, string> = {
  DI: 'Documentación',
  EJ: 'Vía judicial',
  EP: 'Peritación',
  ER: 'Reparación',
  IN: 'Indemnización',
}

/** Orden de avance de una acción: si llegan dos fotos de la misma, gana la más avanzada. */
const SITUACION_ACCION: Record<string, { texto: string; orden: number }> = {
  PD: { texto: 'pendiente de empezar', orden: 1 },
  EC: { texto: 'en curso', orden: 2 },
  FI: { texto: 'terminada', orden: 3 },
}

const DESTINO_PAGO: Record<string, string> = {
  AB: 'al abogado',
  EA: 'a la empresa de asistencia',
  PE: 'al perito',
  RE: 'al reparador',
  TA: 'al taller',
  TR: 'al tramitador',
}

export type PasoTramitacion = {
  /** `YYYY-MM-DD` tal y como la manda la compañía; `null` = sin fecha. */
  fecha: string | null
  tipo: 'situacion' | 'accion' | 'pago'
  texto: string
  /** Solo en pagos. Número, sin formatear: el formato español lo pone la pantalla. */
  importe: number | null
}

export type TramitacionSiniestro = {
  pasos: PasoTramitacion[]
  /** Lo que la compañía lleva pagado en TOTAL (a quien sea). `null` = no lo ha dicho. */
  totalPagado: number | null
  /** Indemnización que informa la compañía. `null` = no la ha informado. */
  indemnizacion: number | null
}

type Entrada = {
  situaciones: unknown
  acciones: unknown
  pagos: unknown
  totalPagos: unknown
  indemnizacion: unknown
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

const fechaIso = (v: unknown): string | null => {
  const t = texto(v)
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

/** Decimal de Prisma, string o número → número finito; cualquier otra cosa → `null`. */
export function importeNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

const lista = (v: unknown): Record<string, unknown>[] | null =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : null

/**
 * Traduce lo que guardó el CRM. Defensivo a propósito: el jsonb lo escribe otro
 * repo y aquí llega como `unknown`; una entrada rara se descarta, no revienta
 * la ficha de la póliza.
 */
export function tramitacionSiniestro(e: Entrada): TramitacionSiniestro | null {
  const sits = lista(e.situaciones)
  const accs = lista(e.acciones)
  const pags = lista(e.pagos)
  const totalPagado = importeNumero(e.totalPagos)
  const indemnizacion = importeNumero(e.indemnizacion)
  if (sits === null && accs === null && pags === null && totalPagado === null && indemnizacion === null) {
    return null
  }

  const pasos: PasoTramitacion[] = []

  for (const s of sits ?? []) {
    const t = SITUACION_SINIESTRO[texto(s.codigo)?.toUpperCase() ?? '']
    if (t) pasos.push({ fecha: fechaIso(s.fecha), tipo: 'situacion', texto: t, importe: null })
  }

  // La fusión del CRM guarda cada foto distinta: la misma peritación «en curso»
  // y luego «terminada» son dos entradas. Se pinta UNA, la más avanzada.
  const acciones = new Map<string, { fecha: string | null; nombre: string; orden: number; estado: string | null }>()
  for (const a of accs ?? []) {
    const nombre = ACCION[texto(a.accion)?.toUpperCase() ?? '']
    if (!nombre) continue
    const fecha = fechaIso(a.fecha)
    const sit = SITUACION_ACCION[texto(a.situacion)?.toUpperCase() ?? '']
    const clave = `${nombre}|${fecha ?? ''}`
    const previa = acciones.get(clave)
    const orden = sit?.orden ?? 0
    if (!previa || orden > previa.orden) acciones.set(clave, { fecha, nombre, orden, estado: sit?.texto ?? null })
  }
  for (const a of acciones.values()) {
    pasos.push({
      fecha: a.fecha,
      tipo: 'accion',
      texto: a.estado ? `${a.nombre}: ${a.estado}` : a.nombre,
      importe: null,
    })
  }

  for (const p of pags ?? []) {
    const importe = importeNumero(p.importe)
    if (importe === null) continue
    const destino = DESTINO_PAGO[texto(p.receptor)?.toUpperCase() ?? '']
    pasos.push({
      fecha: fechaIso(p.fecha),
      tipo: 'pago',
      texto: destino ? `Pago de la compañía ${destino}` : 'Pago de la compañía',
      importe,
    })
  }

  // Cronológico; sin fecha, al final (no es ni reciente ni antiguo).
  pasos.sort((a, b) => {
    if (a.fecha === b.fecha) return 0
    if (a.fecha === null) return 1
    if (b.fecha === null) return -1
    return a.fecha < b.fecha ? -1 : 1
  })

  return { pasos, totalPagado, indemnizacion }
}
