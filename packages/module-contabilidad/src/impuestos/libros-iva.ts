// Libros registro de IVA (facturas EMITIDAS y RECIBIDAS) desde operaciones normalizadas. PURO.
// Una línea por (factura, tipo de IVA) → «desglose por tipo». Numeración correlativa dentro del periodo pedido, orden por fecha y nº.
// Incluye el resumen por tipo/clase (21/10/4/0, exentas, inversión del sujeto pasivo, intracomunitarias…) y el cuadre con el mayor 477/472.
// Fuente normativa del contenido: RD 1619/2012 (facturación) y RD 1624/1992 arts. 62-66 (libros registro de IVA) [Probable: contrastar].
import type { Centimos } from '../partida/dinero.ts'
import { claveDesglose, ETIQUETA_DESGLOSE, problemasOperacion, type ClaveDesglose, type OperacionIva, type SentidoIva } from './operaciones.ts'
import { enRango, nifNormalizado, type RangoFechas } from './comun.ts'

export type LineaLibroIva = {
  /** Nº de orden correlativo dentro del libro del periodo. */
  orden: number
  fecha: string
  numero: string
  nif: string | null
  nombre: string
  clave: ClaveDesglose
  base: Centimos
  tipoIva: number
  cuota: Centimos
  /** base + cuota. */
  total: Centimos
  /** Cuota no deducible (solo recibidas). */
  noDeducible: boolean
  rectificativa: boolean
  /** Trazabilidad: asiento/factura de origen. */
  ref: string
}

export type ResumenLibroIva = { clave: ClaveDesglose; etiqueta: string; lineas: number; base: Centimos; cuota: Centimos; total: Centimos }

export type LibroRegistroIva = {
  sentido: SentidoIva
  rango: RangoFechas
  lineas: LineaLibroIva[]
  resumen: ResumenLibroIva[]
  totales: { base: Centimos; cuota: Centimos; total: Centimos }
  /** Cuota deducible (recibidas) = cuota de las líneas deducibles. En emitidas coincide con `totales.cuota`. */
  cuotaDeducible: Centimos
  avisos: string[]
  /** Operaciones inválidas que no entran (con su motivo). */
  excluidas: { ref: string; motivo: string }[]
}

const ORDEN_CLAVES: readonly ClaveDesglose[] = ['21', '10', '4', '0', 'otro_tipo', 'exenta', 'no_sujeta', 'isp', 'intracom', 'importacion', 'exportacion']

export function libroRegistroIva(ops: readonly OperacionIva[], sentido: SentidoIva, rango: RangoFechas): LibroRegistroIva {
  const avisos: string[] = []
  const excluidas: { ref: string; motivo: string }[] = []
  const validas: OperacionIva[] = []
  for (const o of ops) {
    if (o.sentido !== sentido || !enRango(o.fecha, rango)) continue
    const p = problemasOperacion(o)
    if (p.length) { excluidas.push({ ref: String(o.ref), motivo: p.join('; ') }); continue }
    validas.push(o)
  }
  validas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : b.tipoIva - a.tipoIva))
  const lineas: LineaLibroIva[] = validas.map((o, i) => ({
    orden: i + 1, fecha: o.fecha, numero: o.numero, nif: nifNormalizado(o.tercero.nif), nombre: o.tercero.nombre,
    clave: claveDesglose(o), base: o.base, tipoIva: o.tipoIva, cuota: o.cuota, total: o.base + o.cuota,
    noDeducible: sentido === 'recibida' && o.deducible === false, rectificativa: o.rectificativa === true, ref: o.ref,
  }))
  const m = new Map<ClaveDesglose, ResumenLibroIva>()
  for (const l of lineas) {
    const x = m.get(l.clave) ?? { clave: l.clave, etiqueta: ETIQUETA_DESGLOSE[l.clave], lineas: 0, base: 0, cuota: 0, total: 0 }
    x.lineas += 1; x.base += l.base; x.cuota += l.cuota; x.total += l.total
    m.set(l.clave, x)
  }
  const resumen = ORDEN_CLAVES.filter((k) => m.has(k)).map((k) => m.get(k)!)
  const totales = lineas.reduce((t, l) => ({ base: t.base + l.base, cuota: t.cuota + l.cuota, total: t.total + l.total }), { base: 0, cuota: 0, total: 0 })
  const cuotaDeducible = lineas.filter((l) => !l.noDeducible).reduce((t, l) => t + l.cuota, 0)
  const sinNif = lineas.filter((l) => !l.nif && l.clave !== 'no_sujeta').length
  if (sinNif > 0) avisos.push(`${sinNif} línea(s) sin NIF del ${sentido === 'emitida' ? 'cliente' : 'proveedor'}: el libro las lleva, pero no se podrán declarar en el 347/349 sin el dato`)
  if (lineas.some((l) => l.clave === 'otro_tipo')) avisos.push('hay líneas con un tipo de IVA distinto de 21/10/4/0: revísalas')
  if (excluidas.length) avisos.push(`${excluidas.length} operación(es) inválida(s) fuera del libro`)
  if (lineas.length === 0) avisos.push('Sin datos: no hay operaciones en el periodo')
  return { sentido, rango, lineas, resumen, totales, cuotaDeducible, avisos, excluidas }
}

export type CuadreIva = {
  ok: boolean
  /** IVA repercutido esperado en el mayor 477 (haber − debe): emitidas + autorrepercutido (ISP e intracomunitarias recibidas). */
  esperado477: Centimos
  /** IVA soportado esperado en el mayor 472 (debe − haber): cuotas deducibles de recibidas. */
  esperado472: Centimos
  diferencia477: Centimos
  diferencia472: Centimos
  mensajes: string[]
}

/**
 * Cuadre libros de IVA ≡ mayor 477/472 del MISMO periodo (guardián de la fase 4). `saldo477` = haber − debe y `saldo472` = debe − haber
 * de los movimientos del periodo por origen «hecho» (antes de la regularización/liquidación, que los lleva a cero).
 * Las importaciones pagadas en aduana van al 472 pero no al 477; las exportaciones/exentas no llevan cuota.
 */
export function cuadrarLibrosConMayor(emitidas: LibroRegistroIva, recibidas: LibroRegistroIva, saldo477: Centimos, saldo472: Centimos): CuadreIva {
  const autorrepercutido = recibidas.lineas.filter((l) => l.clave === 'isp' || l.clave === 'intracom').reduce((t, l) => t + l.cuota, 0)
  const esperado477 = emitidas.totales.cuota + autorrepercutido
  const esperado472 = recibidas.cuotaDeducible
  const diferencia477 = saldo477 - esperado477
  const diferencia472 = saldo472 - esperado472
  const mensajes: string[] = []
  if (diferencia477 !== 0) mensajes.push(`477: el mayor difiere del libro en ${diferencia477} céntimos`)
  if (diferencia472 !== 0) mensajes.push(`472: el mayor difiere del libro en ${diferencia472} céntimos`)
  return { ok: mensajes.length === 0, esperado477, esperado472, diferencia477, diferencia472, mensajes }
}
