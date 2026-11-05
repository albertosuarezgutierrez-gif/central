// Facturas RECIBIDAS (compras): validación de forma, totales, clave de duplicado y traducción a `HechoCompra`. PURO.
// La validación del NIF (algoritmo oficial) la hace la app con `@central/core-fiscal`: este núcleo no depende de ningún país.
//
// Convenciones (con test):
//   · duplicado = mismo (NIF del proveedor, número de factura normalizado). El número se compara sin espacios, en mayúsculas y sin ceros a la
//     izquierda en cada grupo de cifras («2026/0045» ≡ «2026/45»);
//   · la retención (IRPF) se calcula sobre la BASE y se resta del total a pagar; con retención el proveedor es un acreedor (410);
//   · cuentas de gasto: regla de la empresa/plantilla por categoría → tabla de categorías habituales → cuenta de gasto de la regla.
import { ErrorContable, porcentajeDe, type Centimos } from '../partida/dinero.ts'
import type { HechoCompra, LineaIva, ReglasAsiento } from '../partida/hechos.ts'

export type TipoProveedor = 'proveedor' | 'acreedor'
export type OrigenFacturaRecibida = 'manual' | 'gmail' | 'ocr' | 'vertical'
export const TIPOS_IVA_ES = [21, 10, 4, 0] as const

export type LineaFactura = { base: Centimos; tipoIva: number; /** Clave de categoría de gasto (minúsculas y _). */ categoria?: string }

export type EntradaFacturaRecibida = {
  proveedor: { nif: string; nombre: string; tipo?: TipoProveedor }
  /** Número tal como lo pone el proveedor. */
  numero: string
  /** Fecha de la factura (ISO). */
  fecha: string
  /** Fecha en que se contabiliza (ISO); por defecto la de la factura. */
  fechaContable?: string
  lineas: readonly LineaFactura[]
  /** IRPF retenido, en % sobre la base (p. ej. 15). */
  retencionPct?: number
  /** Solo REFERENCIA al documento (nombre/clave); nada se sube a ningún almacenamiento desde aquí. */
  adjuntoRef?: string
  origen?: OrigenFacturaRecibida
  /** Eje de rentabilidad opcional (p. ej. { ot: 'OT-1042' }). */
  dimensiones?: Readonly<Record<string, string>>
}

/** Cuenta de gasto habitual por categoría (cuando ni la empresa ni su plantilla dicen otra cosa). */
export const CUENTA_GASTO_POR_CATEGORIA: Readonly<Record<string, string>> = {
  mercaderias: '600', materias_primas: '601', aprovisionamientos: '602', trabajos_terceros: '607',
  alquiler: '621', reparaciones: '622', profesionales: '623', transportes: '624', seguros: '625', bancarios: '626',
  publicidad: '627', suministros: '628', otros_servicios: '629',
}
export const CATEGORIAS_GASTO: readonly string[] = Object.keys(CUENTA_GASTO_POR_CATEGORIA)

const norm = (s: string) => s.toUpperCase().replace(/[\s.\-]/g, '')
export const normalizarNifProveedor = (nif: string): string => norm(nif)

/** Número de factura comparable: mayúsculas, sin espacios y sin ceros a la izquierda de cada grupo de cifras. */
export function normalizarNumeroFactura(numero: string): string {
  return numero.toUpperCase().replace(/\s+/g, '').replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ''))
}

export const claveFacturaRecibida = (nif: string, numero: string): string => `${normalizarNifProveedor(nif)}|${normalizarNumeroFactura(numero)}`

export type TotalesFactura = {
  base: Centimos; cuota: Centimos; retencion: Centimos
  /** base + cuota (lo que dice la factura). */
  total: Centimos
  /** total − retención (lo que se paga al proveedor). */
  aPagar: Centimos
  porTipo: { tipoIva: number; base: Centimos; cuota: Centimos }[]
}

export function totalesFactura(lineas: readonly LineaFactura[], retencionPct = 0): TotalesFactura {
  if (!lineas.length) throw new ErrorContable('desglose_vacio', 'la factura necesita al menos una línea')
  if (!(retencionPct >= 0 && retencionPct <= 100)) throw new ErrorContable('retencion_invalida', 'la retención es un porcentaje entre 0 y 100')
  const m = new Map<number, { base: Centimos; cuota: Centimos }>()
  let base = 0
  for (const l of lineas) {
    if (!Number.isSafeInteger(l.base) || l.base < 0) throw new ErrorContable('importe_no_entero', 'la base de cada línea es un entero ≥ 0 en céntimos')
    if (!(l.tipoIva >= 0 && l.tipoIva <= 100)) throw new ErrorContable('iva_invalido', 'el tipo de IVA es un porcentaje entre 0 y 100')
    const x = m.get(l.tipoIva) ?? { base: 0, cuota: 0 }
    x.base += l.base
    m.set(l.tipoIva, x)
    base += l.base
  }
  // IVA por tipo sobre la base agregada de ese tipo (como en el libro registro), no línea a línea.
  const porTipo = [...m.entries()].sort((a, b) => b[0] - a[0]).map(([tipoIva, x]) => ({ tipoIva, base: x.base, cuota: porcentajeDe(x.base, tipoIva) }))
  const cuota = porTipo.reduce((t, x) => t + x.cuota, 0)
  const retencion = porcentajeDe(base, retencionPct)
  return { base, cuota, retencion, total: base + cuota, aPagar: base + cuota - retencion, porTipo }
}

export type ProblemaFactura = string

/** Forma de la entrada (el NIF lo valida la app con core-fiscal). Lista de problemas; vacía = válida. */
export function validarFormaFacturaRecibida(f: EntradaFacturaRecibida, hoy: string): ProblemaFactura[] {
  const p: string[] = []
  const iso = (s: unknown): s is string => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }
  if (!f.proveedor || typeof f.proveedor.nif !== 'string' || !norm(f.proveedor.nif)) p.push('falta el NIF del proveedor')
  if (!f.proveedor || typeof f.proveedor.nombre !== 'string' || !f.proveedor.nombre.trim() || f.proveedor.nombre.length > 200) p.push('falta el nombre del proveedor (máx. 200)')
  if (typeof f.numero !== 'string' || !f.numero.trim() || f.numero.length > 60) p.push('falta el número de factura (máx. 60)')
  if (!iso(f.fecha)) p.push('la fecha de la factura no es válida')
  else if (f.fecha > hoy) p.push('la fecha de la factura es futura')
  if (f.fechaContable !== undefined && !iso(f.fechaContable)) p.push('la fecha contable no es válida')
  if (!Array.isArray(f.lineas) || f.lineas.length === 0 || f.lineas.length > 200) p.push('la factura necesita entre 1 y 200 líneas')
  else {
    f.lineas.forEach((l, i) => {
      if (!Number.isSafeInteger(l.base) || l.base < 0) p.push(`línea ${i + 1}: la base debe ser un entero ≥ 0 en céntimos`)
      if (typeof l.tipoIva !== 'number' || !(l.tipoIva >= 0 && l.tipoIva <= 100)) p.push(`línea ${i + 1}: tipo de IVA no válido`)
      if (l.categoria !== undefined && !/^[a-z][a-z0-9_]{1,40}$/.test(l.categoria)) p.push(`línea ${i + 1}: categoría no válida`)
    })
    if (f.lineas.every((l) => l.base === 0)) p.push('la factura no tiene importe')
  }
  if (f.retencionPct !== undefined && !(typeof f.retencionPct === 'number' && f.retencionPct >= 0 && f.retencionPct <= 100)) p.push('la retención debe ser un porcentaje entre 0 y 100')
  if (f.adjuntoRef !== undefined && (typeof f.adjuntoRef !== 'string' || f.adjuntoRef.length > 300)) p.push('referencia del adjunto no válida (máx. 300)')
  return p
}

/** Cuenta de gasto de una categoría: regla de la empresa/plantilla → tabla habitual → cuenta de gasto por defecto de la regla. */
export function cuentaGastoDeCategoria(reglas: ReglasAsiento, categoria: string | undefined): string {
  if (categoria !== undefined) {
    const regla = reglas.categorias?.compra
    if (regla && Object.prototype.hasOwnProperty.call(regla, categoria)) return regla[categoria]
    if (Object.prototype.hasOwnProperty.call(CUENTA_GASTO_POR_CATEGORIA, categoria)) return CUENTA_GASTO_POR_CATEGORIA[categoria]
  }
  return reglas.compra.gasto
}

export const refHechoCompra = (nif: string, numero: string): string => `fr:${claveFacturaRecibida(nif, numero)}`.slice(0, 120)
/** Documento que abre la partida en 40x/41x y que cerrarán los pagos. */
export const documentoCompra = (nif: string, numero: string): string => `${normalizarNifProveedor(nif)} ${numero.trim()}`.slice(0, 120)

/** `HechoCompra` listo para `recibirHecho`: líneas por tipo de IVA con su cuenta de gasto, retención y subcuenta de tercero (400/410). */
export function hechoDeFacturaRecibida(f: EntradaFacturaRecibida, reglas: ReglasAsiento): HechoCompra {
  const t = totalesFactura(f.lineas, f.retencionPct ?? 0)
  const acreedor = f.proveedor.tipo === 'acreedor' || t.retencion > 0
  // La cuota se fija por TIPO (no por línea) para que el asiento cuadre con el libro de IVA: va en la primera línea de cada tipo.
  const vistos = new Set<number>()
  const desglose: LineaIva[] = f.lineas.map((l) => {
    const primera = !vistos.has(l.tipoIva)
    vistos.add(l.tipoIva)
    return {
      base: l.base, tipoIva: l.tipoIva, cuota: primera ? t.porTipo.find((x) => x.tipoIva === l.tipoIva)!.cuota : 0,
      ...(l.categoria ? { categoria: l.categoria } : {}), cuentaContrapartida: cuentaGastoDeCategoria(reglas, l.categoria),
    }
  })
  return {
    tipo: 'compra', fecha: f.fechaContable ?? f.fecha, ref: refHechoCompra(f.proveedor.nif, f.numero),
    concepto: `Factura ${f.numero.trim()} de ${f.proveedor.nombre.trim()}`.slice(0, 300), documento: documentoCompra(f.proveedor.nif, f.numero),
    desglose, ...(t.retencion > 0 ? { retencion: t.retencion } : {}),
    cuentaTercero: acreedor ? '410' : reglas.compra.proveedor,
    ...(f.dimensiones && Object.keys(f.dimensiones).length ? { dimensiones: { ...f.dimensiones } } : {}),
  }
}

/** Lo que la app recuerda de un proveedor para pre-rellenar la siguiente factura. */
export type ProveedorRecordado = { nif: string; nombre: string; tipo: TipoProveedor; categoria: string | null; retencionPct: number | null }

/** Sugerencia para una factura nueva a partir del proveedor recordado (null = no se sabe: se pregunta, no se inventa). */
export function sugerenciaProveedor(p: ProveedorRecordado | null): { categoria: string | null; tipo: TipoProveedor; retencionPct: number | null } {
  return p ? { categoria: p.categoria, tipo: p.tipo, retencionPct: p.retencionPct } : { categoria: null, tipo: 'proveedor', retencionPct: null }
}

/**
 * PUERTO de ingesta automática de facturas recibidas (Gmail/OCR de `agente-facturas` en plataforma). SOLO la interfaz: no hay
 * implementación conectada. Cada borrador trae su `mensajeId` (idempotencia por Message-ID) y nunca se asienta solo: entra como
 * propuesta que revisa una persona.
 */
export interface BorradorFacturaRecibida {
  /** Clave de idempotencia de la fuente (Message-ID del correo, hash del PDF…). */
  mensajeId: string
  origen: Exclude<OrigenFacturaRecibida, 'manual'>
  /** Lo que se pudo leer; cualquier campo ausente es «no se sabe», nunca 0. */
  datos: Partial<Omit<EntradaFacturaRecibida, 'lineas'>> & { lineas?: readonly LineaFactura[] }
  confianza: number | null
}
export interface FuenteFacturasRecibidas {
  readonly nombre: string
  /** Borradores nuevos desde el último cursor; `cursor` null = desde el principio. */
  siguientes(cursor: string | null): Promise<{ borradores: BorradorFacturaRecibida[]; cursor: string | null }>
}
/** Implementación nula (por defecto): ninguna fuente conectada. */
export const fuenteFacturasNoConectada: FuenteFacturasRecibidas = {
  nombre: 'ninguna',
  async siguientes(cursor) { return { borradores: [], cursor } },
}
