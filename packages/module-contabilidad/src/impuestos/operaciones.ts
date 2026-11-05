// Operación de IVA normalizada: el PUERTO de entrada de libros registro y de los modelos 303/390/347/349. PURO.
// Cada vertical/app la construye desde sus asientos o facturas (la app de contabilidad: desde `hechos_contables` + `facturas_recibidas`);
// el módulo no consulta ninguna BD. `ref` es la trazabilidad: identifica el asiento/factura que origina la operación y es lo que cada
// casilla lista en su «origen».
import { ErrorContable, porcentajeDe, type Centimos } from '../partida/dinero.ts'
import type { HechoCompra, HechoVenta } from '../partida/hechos.ts'
import { nifNormalizado } from './comun.ts'

export type SentidoIva = 'emitida' | 'recibida'

/**
 * Naturaleza de la operación a efectos de IVA:
 *  - interior: sujeta y no exenta en territorio de aplicación (21/10/4/0 %);
 *  - exenta / no_sujeta: sin cuota (van al libro; en el 303 solo como información);
 *  - isp: inversión del sujeto pasivo en operaciones interiores (el destinatario autorrepercute y deduce);
 *  - intracom_bienes / intracom_servicios: adquisiciones (recibida) o entregas/prestaciones (emitida) intracomunitarias → 349;
 *  - importacion: IVA de importación pagado en aduana; exportacion: exenta con derecho a deducción.
 */
export type ClaseOperacion = 'interior' | 'exenta' | 'no_sujeta' | 'isp' | 'intracom_bienes' | 'intracom_servicios' | 'importacion' | 'exportacion'
export const CLASES_OPERACION: readonly ClaseOperacion[] = ['interior', 'exenta', 'no_sujeta', 'isp', 'intracom_bienes', 'intracom_servicios', 'importacion', 'exportacion']

/** Regímenes especiales que este módulo NO soporta: si aparecen en una operación, el modelo se marca «no soportado» (no se calcula mal). */
export type RegimenEspecial = 'prorrata' | 'recargo_equivalencia' | 'simplificado' | 'agricultura_ganaderia_pesca' | 'rebu' | 'criterio_caja' | 'agencias_viajes' | 'oro_inversion' | 'otro'

export interface TerceroIva {
  /** NIF/CIF; para operadores UE, NIF-IVA con prefijo de país (p. ej. «FR12345678901»). `null` = no consta (se avisa; no se inventa). */
  nif: string | null
  nombre: string
  /** ISO 3166 alfa-2 si se conoce (UE). */
  pais?: string
}

export interface OperacionIva {
  /** Trazabilidad: asiento/factura/hecho que origina la operación. Único por (ref, tipoIva, clase). */
  ref: string
  sentido: SentidoIva
  /** Fecha de la operación a efectos del periodo (expedición en emitidas; contable en recibidas). ISO. */
  fecha: string
  /** Nº de factura. */
  numero: string
  tercero: TerceroIva
  clase: ClaseOperacion
  /** Base en céntimos (negativa en facturas rectificativas/abonos). */
  base: Centimos
  /** Porcentaje de IVA aplicado (21, 10, 4, 0…). */
  tipoIva: number
  /** Cuota en céntimos (mismo signo que la base). */
  cuota: Centimos
  /** Bien de inversión (casillas de «bienes de inversión» del 303). */
  bienInversion?: boolean
  /** IVA no deducible (p. ej. gastos no afectos): entra en el libro pero no en las deducciones. Por defecto, deducible. */
  deducible?: boolean
  rectificativa?: boolean
  /** Triangular intracomunitaria (clave T del 349). */
  triangular?: boolean
  regimen?: RegimenEspecial
  /** Arrendamiento de inmueble con retención (se declara en 115/180, no en el 347). */
  alquilerConRetencion?: boolean
  /** Forzar fuera del 347 (p. ej. operación ya declarada por otra vía). */
  excluir347?: boolean
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Problemas de forma de una operación (vacía = válida). No lanza. */
export function problemasOperacion(o: OperacionIva): string[] {
  const p: string[] = []
  if (!o.ref || !String(o.ref).trim()) p.push('falta la referencia (trazabilidad)')
  if (o.sentido !== 'emitida' && o.sentido !== 'recibida') p.push(`sentido inválido: ${String(o.sentido)}`)
  if (typeof o.fecha !== 'string' || !ISO.test(o.fecha) || Number.isNaN(new Date(`${o.fecha}T00:00:00Z`).getTime())) p.push(`fecha inválida: ${String(o.fecha)}`)
  if (!CLASES_OPERACION.includes(o.clase)) p.push(`clase inválida: ${String(o.clase)}`)
  if (!Number.isSafeInteger(o.base)) p.push('la base debe ser un entero en céntimos')
  if (!Number.isSafeInteger(o.cuota)) p.push('la cuota debe ser un entero en céntimos')
  if (typeof o.tipoIva !== 'number' || !(o.tipoIva >= 0 && o.tipoIva <= 100)) p.push('tipo de IVA no válido')
  if (Number.isSafeInteger(o.base) && Number.isSafeInteger(o.cuota) && o.base !== 0 && o.cuota !== 0 && Math.sign(o.base) !== Math.sign(o.cuota)) p.push('base y cuota con signo distinto')
  if ((o.clase === 'exenta' || o.clase === 'no_sujeta' || o.clase === 'exportacion') && o.cuota !== 0) p.push(`una operación ${o.clase} no lleva cuota`)
  return p
}

/** Valida y devuelve la operación (lanza si no es válida). */
export function validarOperacion(o: OperacionIva): OperacionIva {
  const p = problemasOperacion(o)
  if (p.length) throw new ErrorContable('operacion_invalida', `${o.ref}: ${p.join('; ')}`)
  return o
}

/** Bucket del desglose del libro registro: tipo para lo interior; el nombre de la clase para lo demás. */
export type ClaveDesglose = '21' | '10' | '4' | '0' | 'otro_tipo' | 'exenta' | 'no_sujeta' | 'isp' | 'intracom' | 'importacion' | 'exportacion'
export function claveDesglose(o: Pick<OperacionIva, 'clase' | 'tipoIva'>): ClaveDesglose {
  switch (o.clase) {
    case 'exenta': return 'exenta'
    case 'no_sujeta': return 'no_sujeta'
    case 'isp': return 'isp'
    case 'intracom_bienes':
    case 'intracom_servicios': return 'intracom'
    case 'importacion': return 'importacion'
    case 'exportacion': return 'exportacion'
    default: return o.tipoIva === 21 ? '21' : o.tipoIva === 10 ? '10' : o.tipoIva === 4 ? '4' : o.tipoIva === 0 ? '0' : 'otro_tipo'
  }
}

export const ETIQUETA_DESGLOSE: Readonly<Record<ClaveDesglose, string>> = {
  '21': 'IVA 21 %', '10': 'IVA 10 %', '4': 'IVA 4 %', '0': 'IVA 0 %', otro_tipo: 'Otro tipo de IVA', exenta: 'Exentas', no_sujeta: 'No sujetas',
  isp: 'Inversión del sujeto pasivo', intracom: 'Intracomunitarias', importacion: 'Importaciones', exportacion: 'Exportaciones',
}

/** Datos extra que el hecho no lleva (la app los toma de la factura o del tercero). */
export type ExtraOperacion = Partial<Pick<OperacionIva, 'tercero' | 'numero' | 'clase' | 'bienInversion' | 'deducible' | 'regimen' | 'rectificativa' | 'triangular' | 'alquilerConRetencion' | 'excluir347'>> & {
  /** Referencia del asiento (trazabilidad); por defecto la del hecho. */
  ref?: string
}

/**
 * Hecho de venta/compra → operaciones de IVA, UNA por tipo de IVA (la cuota por línea es `cuota` o `base × tipo`, igual que
 * `asientoDesdeHecho`, para que el libro cuadre con el mayor 477/472 al céntimo).
 */
export function operacionesDeHecho(h: HechoVenta | HechoCompra, extra: ExtraOperacion = {}): OperacionIva[] {
  const porTipo = new Map<number, { base: Centimos; cuota: Centimos }>()
  for (const l of h.desglose) {
    const cuota = l.cuota !== undefined ? l.cuota : porcentajeDe(l.base, l.tipoIva)
    const x = porTipo.get(l.tipoIva) ?? { base: 0, cuota: 0 }
    x.base += l.base
    x.cuota += cuota
    porTipo.set(l.tipoIva, x)
  }
  const ref = extra.ref ?? h.ref
  return [...porTipo.entries()].sort((a, b) => b[0] - a[0]).map(([tipoIva, x]) => ({
    ref,
    sentido: h.tipo === 'venta' ? 'emitida' as const : 'recibida' as const,
    fecha: h.fecha,
    numero: extra.numero ?? h.documento ?? h.ref,
    tercero: extra.tercero ?? { nif: null, nombre: '' },
    clase: extra.clase ?? 'interior',
    base: x.base, tipoIva, cuota: x.cuota,
    ...(extra.bienInversion !== undefined ? { bienInversion: extra.bienInversion } : {}),
    ...(extra.deducible !== undefined ? { deducible: extra.deducible } : {}),
    ...(extra.regimen ? { regimen: extra.regimen } : {}),
    ...(extra.rectificativa ? { rectificativa: true } : {}),
    ...(extra.triangular ? { triangular: true } : {}),
    ...(extra.alquilerConRetencion ? { alquilerConRetencion: true } : {}),
    ...(extra.excluir347 ? { excluir347: true } : {}),
  }))
}

export { nifNormalizado }
