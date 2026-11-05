// Puerto de «hechos contables» + reglas configurables hecho → cuentas.
// El resto de la app (facturación, banco, nóminas) emite HechoContable; este módulo lo traduce a Asiento.
// Importes siempre en céntimos. Abonos/devoluciones: no se admiten importes negativos; se rectifica el asiento.

import { ErrorContable, porcentajeDe, validarCentimos, type Centimos } from './dinero.ts'
import type { Asiento, ApunteAsiento, Dimensiones, OrigenAsiento } from './asiento.ts'

export interface LineaIva {
  base: Centimos
  /** Porcentaje (21, 10, 4, 0…). */
  tipoIva: number
  /** Si se omite se calcula `base × tipo / 100` redondeado al céntimo. */
  cuota?: Centimos
  /** Cuenta de ingreso/gasto concreta para esta línea (sustituye a la de la regla). */
  cuentaContrapartida?: string
  /** Etiqueta del sector (p. ej. «mano_obra»): la regla de la empresa/sector decide su cuenta (`ReglasAsiento.categorias`). */
  categoria?: string
}

interface HechoBase {
  fecha: string
  ref: string
  concepto?: string
  documento?: string
  /** Ejes de rentabilidad (opcional): el hecho dice a qué pertenece; el núcleo solo los conserva en el asiento. */
  dimensiones?: Dimensiones
}

export interface HechoVenta extends HechoBase {
  tipo: 'venta'
  desglose: readonly LineaIva[]
  /** Retención de IRPF que el cliente nos practica (importe en céntimos). */
  retencion?: Centimos
  /** Subcuenta del cliente (p. ej. 430000001). Por defecto la de la regla. */
  cuentaTercero?: string
}

export interface HechoCompra extends HechoBase {
  tipo: 'compra'
  desglose: readonly LineaIva[]
  /** Retención de IRPF que practicamos al proveedor/profesional. */
  retencion?: Centimos
  cuentaTercero?: string
}

/** Cómo se cobra/paga. La regla mapea cada medio a su cuenta (efectivo → caja 570; resto → bancos 572 por defecto). */
export const MEDIOS_PAGO = ['efectivo', 'bizum', 'transferencia', 'tarjeta', 'otro'] as const
export type MedioPago = (typeof MEDIOS_PAGO)[number]
export const esMedioPago = (v: unknown): v is MedioPago => typeof v === 'string' && (MEDIOS_PAGO as readonly string[]).includes(v)

export interface HechoCobro extends HechoBase {
  tipo: 'cobro'
  /** Medio de cobro (opcional; sin medio se usa la cuenta de tesorería por defecto de la regla). */
  medio?: MedioPago
  importe: Centimos
  cuentaTercero?: string
  /** Caja o banco. Por defecto la de la regla. */
  cuentaTesoreria?: string
}

export interface HechoPago extends HechoBase {
  tipo: 'pago'
  medio?: MedioPago
  importe: Centimos
  cuentaTercero?: string
  cuentaTesoreria?: string
}

export interface HechoNomina extends HechoBase {
  tipo: 'nomina'
  bruto: Centimos
  ssEmpresa: Centimos
  irpf: Centimos
  ssTrabajador: Centimos
  /** Debe cumplirse bruto − irpf − ssTrabajador = liquido. */
  liquido: Centimos
}

export type HechoContable = HechoVenta | HechoCompra | HechoCobro | HechoPago | HechoNomina

/** Mapa hecho → cuentas. Configurable por cliente/sector. */
export interface ReglasAsiento {
  venta: { cliente: string; ingreso: string; ivaRepercutido: string; retencionSoportada: string }
  compra: { proveedor: string; gasto: string; ivaSoportado: string; retencionPracticada: string }
  cobro: { tesoreria: string; cliente: string }
  pago: { tesoreria: string; proveedor: string }
  nomina: { sueldos: string; ssEmpresa: string; irpfPracticado: string; ssAcreedora: string; remuneracionesPendientes: string }
  /** Cuenta de ingreso/gasto por categoría de línea (opcional; la línea sin categoría usa `ingreso`/`gasto`). */
  categorias?: { venta?: Readonly<Record<string, string>>; compra?: Readonly<Record<string, string>> }
  /** Cuenta de tesorería por medio de cobro/pago (opcional; sin entrada para el medio se usa `tesoreria`). */
  medios?: { cobro?: Partial<Readonly<Record<MedioPago, string>>>; pago?: Partial<Readonly<Record<MedioPago, string>>> }
}

/** Reglas por defecto PGC PYMES. */
export const REGLAS_PGC: ReglasAsiento = {
  venta: { cliente: '430', ingreso: '705', ivaRepercutido: '477', retencionSoportada: '473' },
  compra: { proveedor: '400', gasto: '600', ivaSoportado: '472', retencionPracticada: '4751' },
  cobro: { tesoreria: '572', cliente: '430' },
  pago: { tesoreria: '572', proveedor: '400' },
  nomina: { sueldos: '640', ssEmpresa: '642', irpfPracticado: '4751', ssAcreedora: '476', remuneracionesPendientes: '465' },
}

/** Mezcla parcial de reglas sobre las PGC (útil para plantillas sectoriales). */
export function combinarReglas(
  base: ReglasAsiento,
  cambios: { [K in Exclude<keyof ReglasAsiento, 'categorias' | 'medios'>]?: Partial<ReglasAsiento[K]> } & { categorias?: ReglasAsiento['categorias']; medios?: ReglasAsiento['medios'] },
): ReglasAsiento {
  const venta = { ...base.categorias?.venta, ...cambios.categorias?.venta }
  const compra = { ...base.categorias?.compra, ...cambios.categorias?.compra }
  const hayCategorias = Object.keys(venta).length > 0 || Object.keys(compra).length > 0
  const mCobro = { ...base.medios?.cobro, ...cambios.medios?.cobro }
  const mPago = { ...base.medios?.pago, ...cambios.medios?.pago }
  const hayMedios = Object.keys(mCobro).length > 0 || Object.keys(mPago).length > 0
  return {
    ...(hayCategorias ? { categorias: { venta, compra } } : {}),
    ...(hayMedios ? { medios: { cobro: mCobro, pago: mPago } } : {}),
    venta: { ...base.venta, ...cambios.venta },
    compra: { ...base.compra, ...cambios.compra },
    cobro: { ...base.cobro, ...cambios.cobro },
    pago: { ...base.pago, ...cambios.pago },
    nomina: { ...base.nomina, ...cambios.nomina },
  }
}

function pos(n: Centimos, etiqueta: string): Centimos {
  validarCentimos(n, etiqueta)
  if (n < 0) throw new ErrorContable('importe_negativo', `${etiqueta} no puede ser negativo (usa rectificar)`)
  return n
}

function cabecera(h: HechoBase, porDefecto: string): Pick<Asiento, 'fecha' | 'ejercicio' | 'concepto'> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.fecha)) throw new ErrorContable('fecha_invalida', `fecha inválida: ${h.fecha}`)
  return { fecha: h.fecha, ejercicio: Number(h.fecha.slice(0, 4)), concepto: h.concepto ?? porDefecto }
}

function ap(cuenta: string, debe: Centimos, haber: Centimos, documento?: string): ApunteAsiento | null {
  if (debe === 0 && haber === 0) return null
  return { cuenta, debe, haber, ...(documento ? { documento } : {}) }
}

function compactar(xs: (ApunteAsiento | null)[]): ApunteAsiento[] {
  return xs.filter((x): x is ApunteAsiento => x !== null)
}

function sumaDesglose(d: readonly LineaIva[]): { base: Centimos; cuota: Centimos; lineas: { l: LineaIva; cuota: Centimos }[] } {
  if (!d.length) throw new ErrorContable('desglose_vacio', 'el hecho necesita al menos una línea de desglose')
  let base = 0
  let cuota = 0
  const lineas = d.map(l => {
    pos(l.base, 'base')
    const c = l.cuota !== undefined ? pos(l.cuota, 'cuota') : porcentajeDe(l.base, l.tipoIva)
    base += l.base
    cuota += c
    return { l, cuota: c }
  })
  return { base, cuota, lineas }
}

function cuentaDeCategoria(mapa: Readonly<Record<string, string>> | undefined, categoria: string | undefined): string | undefined {
  return categoria !== undefined && mapa && Object.prototype.hasOwnProperty.call(mapa, categoria) ? mapa[categoria] : undefined
}

function origen(tipo: OrigenAsiento['tipo'], ref: string): OrigenAsiento {
  return { tipo, ref }
}

/** Traduce un hecho a un asiento CUADRADO (por construcción; se comprueba igualmente). No valida contra el plan. */
export function asientoDesdeHecho(hecho: HechoContable, reglas: ReglasAsiento = REGLAS_PGC): Asiento {
  let apuntes: ApunteAsiento[]
  let cab: Pick<Asiento, 'fecha' | 'ejercicio' | 'concepto'>
  const doc = hecho.documento ?? hecho.ref

  switch (hecho.tipo) {
    case 'venta': {
      const r = reglas.venta
      const { base, cuota, lineas } = sumaDesglose(hecho.desglose)
      const ret = hecho.retencion === undefined ? 0 : pos(hecho.retencion, 'retención')
      if (ret > base) throw new ErrorContable('retencion_excesiva', 'la retención supera la base')
      cab = cabecera(hecho, `Factura emitida ${hecho.ref}`)
      apuntes = compactar([
        ap(hecho.cuentaTercero ?? r.cliente, base + cuota - ret, 0, doc),
        ap(r.retencionSoportada, ret, 0, doc),
        ...porCuenta(lineas.map(x => [x.l.cuentaContrapartida ?? cuentaDeCategoria(reglas.categorias?.venta, x.l.categoria) ?? r.ingreso, x.l.base] as const)).map(([c, v]) => ap(c, 0, v, doc)),
        ap(r.ivaRepercutido, 0, cuota, doc),
      ])
      break
    }
    case 'compra': {
      const r = reglas.compra
      const { base, cuota, lineas } = sumaDesglose(hecho.desglose)
      const ret = hecho.retencion === undefined ? 0 : pos(hecho.retencion, 'retención')
      if (ret > base) throw new ErrorContable('retencion_excesiva', 'la retención supera la base')
      cab = cabecera(hecho, `Factura recibida ${hecho.ref}`)
      apuntes = compactar([
        ...porCuenta(lineas.map(x => [x.l.cuentaContrapartida ?? cuentaDeCategoria(reglas.categorias?.compra, x.l.categoria) ?? r.gasto, x.l.base] as const)).map(([c, v]) => ap(c, v, 0, doc)),
        ap(r.ivaSoportado, cuota, 0, doc),
        ap(hecho.cuentaTercero ?? r.proveedor, 0, base + cuota - ret, doc),
        ap(r.retencionPracticada, 0, ret, doc),
      ])
      break
    }
    case 'cobro': {
      const r = reglas.cobro
      const imp = pos(hecho.importe, 'importe')
      cab = cabecera(hecho, `Cobro ${hecho.ref}`)
      apuntes = compactar([ap(hecho.cuentaTesoreria ?? cuentaDeCategoria(reglas.medios?.cobro, hecho.medio) ?? r.tesoreria, imp, 0, doc), ap(hecho.cuentaTercero ?? r.cliente, 0, imp, doc)])
      break
    }
    case 'pago': {
      const r = reglas.pago
      const imp = pos(hecho.importe, 'importe')
      cab = cabecera(hecho, `Pago ${hecho.ref}`)
      apuntes = compactar([ap(hecho.cuentaTercero ?? r.proveedor, imp, 0, doc), ap(hecho.cuentaTesoreria ?? cuentaDeCategoria(reglas.medios?.pago, hecho.medio) ?? r.tesoreria, 0, imp, doc)])
      break
    }
    case 'nomina': {
      const r = reglas.nomina
      const bruto = pos(hecho.bruto, 'bruto')
      const ssE = pos(hecho.ssEmpresa, 'SS empresa')
      const irpf = pos(hecho.irpf, 'IRPF')
      const ssT = pos(hecho.ssTrabajador, 'SS trabajador')
      const liq = pos(hecho.liquido, 'líquido')
      if (bruto - irpf - ssT !== liq) {
        throw new ErrorContable('nomina_no_cuadra', `bruto − IRPF − SS trabajador (${bruto - irpf - ssT}) ≠ líquido (${liq})`)
      }
      cab = cabecera(hecho, `Nómina ${hecho.ref}`)
      apuntes = compactar([
        ap(r.sueldos, bruto, 0, doc),
        ap(r.ssEmpresa, ssE, 0, doc),
        ap(r.irpfPracticado, 0, irpf, doc),
        ap(r.ssAcreedora, 0, ssE + ssT, doc),
        ap(r.remuneracionesPendientes, 0, liq, doc),
      ])
      break
    }
    default: {
      const nunca: never = hecho
      throw new ErrorContable('hecho_desconocido', `tipo de hecho desconocido: ${JSON.stringify(nunca)}`)
    }
  }

  const asiento: Asiento = {
    ...cab, apuntes, origen: origen(hecho.tipo, hecho.ref),
    ...(hecho.dimensiones && Object.keys(hecho.dimensiones).length ? { dimensiones: { ...hecho.dimensiones } } : {}),
  }
  let d = 0
  let h = 0
  for (const p of apuntes) { d += p.debe; h += p.haber }
  if (d !== h || apuntes.length < 2) throw new ErrorContable('asiento_descuadrado', `el hecho ${hecho.ref} genera un asiento descuadrado (${d} ≠ ${h})`)
  return asiento
}

/** Agrupa importes por cuenta conservando el orden de primera aparición. */
function porCuenta(pares: (readonly [string, Centimos])[]): [string, Centimos][] {
  const m = new Map<string, Centimos>()
  for (const [c, v] of pares) m.set(c, (m.get(c) ?? 0) + v)
  return [...m.entries()]
}
