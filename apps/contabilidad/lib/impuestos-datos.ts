// De los HECHOS asentados (y sus facturas recibidas) a los datos fiscales que consumen los modelos: operaciones de IVA y retenciones. PURO.
// El hecho de venta/compra no lleva todo lo fiscal (NIF del tercero, clase de operación…): se toma de la factura recibida (0003) y, para lo
// que no existe aún, de CAMPOS OPCIONALES del payload (`tercero`, `clase`, `bienInversion`, `deducible`, `regimen`, `rectificativa`, `triangular`,
// `refCatastral`) que las verticales pueden añadir sin romper el puerto. Lo que falta NO se inventa: se avisa.
// RETENCIONES: se atribuyen al periodo del hecho (fecha de la factura/nómina). La norma las imputa al PAGO; si se paga en otro trimestre hay
// que ajustarlo a mano. Se avisa siempre que hay retenciones. [Probable: contrastar con el asesor.]
import {
  CLASES_OPERACION, operacionesDeHecho, type ClaseOperacion, type ExtraOperacion, type HechoCompra, type HechoVenta, type OperacionIva,
  type RegimenEspecial, type RetencionPracticada,
} from '@central/module-contabilidad'

export type FilaHechoFiscal = {
  hechoId: string
  tipo: 'venta' | 'compra' | 'nomina'
  ref: string
  fecha: string
  payload: unknown
  /** «nº/ejercicio» del asiento que originó el hecho (trazabilidad hasta el diario). */
  asientoRef: string | null
  /** De la factura recibida (0003), si existe. */
  proveedorNif: string | null
  proveedorNombre: string | null
  facturaNumero: string | null
}

export type DatosFiscales = {
  ops: OperacionIva[]
  retenciones: RetencionPracticada[]
  /** ref de la operación/retención → «nº/ejercicio» del asiento. */
  refAAsiento: Record<string, string>
  avisos: string[]
}

const REGIMENES: readonly RegimenEspecial[] = ['prorrata', 'recargo_equivalencia', 'simplificado', 'agricultura_ganaderia_pesca', 'rebu', 'criterio_caja', 'agencias_viajes', 'oro_inversion', 'otro']
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const ent = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null)

export function datosFiscalesDeHechos(filas: readonly FilaHechoFiscal[]): DatosFiscales {
  const ops: OperacionIva[] = []
  const retenciones: RetencionPracticada[] = []
  const refAAsiento: Record<string, string> = {}
  const avisos: string[] = []
  let hayRetenciones = false

  for (const f of filas) {
    const p = obj(f.payload)
    if (!p) { avisos.push(`${f.ref}: payload ilegible, fuera de los modelos`); continue }
    const marca = (ref: string) => { if (f.asientoRef) refAAsiento[ref] = f.asientoRef }

    if (f.tipo === 'nomina') {
      const bruto = ent(p.bruto)
      const irpf = ent(p.irpf)
      if (bruto === null || irpf === null) { avisos.push(`${f.ref}: nómina sin bruto/IRPF legibles`); continue }
      if (irpf === 0) continue
      const per = obj(p.perceptor)
      retenciones.push({
        ref: f.ref, fecha: f.fecha, concepto: 'trabajo', percepcion: bruto, retencion: irpf, origen: 'nominas',
        perceptor: { nif: str(per?.nif, 20), nombre: str(per?.nombre) ?? '', ...(str(per?.provincia, 2) ? { provincia: str(per?.provincia, 2)! } : {}) },
        ...(str(p.clave, 3) ? { clave: str(p.clave, 3)! } : {}),
      })
      marca(f.ref); hayRetenciones = true
      continue
    }

    const desglose = Array.isArray(p.desglose) ? (p.desglose as unknown[]) : null
    if (!desglose || desglose.length === 0 || desglose.some((l) => ent(obj(l)?.base) === null || typeof obj(l)?.tipoIva !== 'number')) {
      avisos.push(`${f.ref}: desglose de IVA ilegible, fuera de los libros`); continue
    }
    const terc = obj(p.tercero)
    const tercero = f.tipo === 'compra' && f.proveedorNif
      ? { nif: f.proveedorNif, nombre: f.proveedorNombre ?? '' }
      : { nif: str(terc?.nif, 20), nombre: str(terc?.nombre) ?? f.proveedorNombre ?? '' }
    const clase = CLASES_OPERACION.includes(p.clase as ClaseOperacion) ? (p.clase as ClaseOperacion) : 'interior'
    const regimen = REGIMENES.includes(p.regimen as RegimenEspecial) ? (p.regimen as RegimenEspecial) : undefined
    const esAlquiler = f.tipo === 'compra' && desglose.some((l) => obj(l)?.categoria === 'alquiler')
    const retencion = ent(p.retencion) ?? 0
    const extra: ExtraOperacion = {
      tercero, numero: f.facturaNumero ?? str(p.documento, 60) ?? f.ref, clase,
      ...(p.bienInversion === true ? { bienInversion: true } : {}),
      ...(p.deducible === false ? { deducible: false } : {}),
      ...(regimen ? { regimen } : {}),
      ...(p.rectificativa === true ? { rectificativa: true } : {}),
      ...(p.triangular === true ? { triangular: true } : {}),
      ...(esAlquiler && retencion > 0 ? { alquilerConRetencion: true } : {}),
    }
    const nuevas = operacionesDeHecho({ ...(p as object), tipo: f.tipo, ref: f.ref, fecha: f.fecha } as HechoVenta | HechoCompra, extra)
    ops.push(...nuevas)
    marca(f.ref)

    if (f.tipo === 'compra' && retencion > 0) {
      const base = desglose.reduce<number>((t, l) => t + (ent(obj(l)?.base) ?? 0), 0)
      retenciones.push({
        ref: f.ref, fecha: f.fecha, concepto: esAlquiler ? 'alquiler' : 'actividad_profesional', percepcion: base, retencion,
        perceptor: { nif: tercero.nif, nombre: tercero.nombre }, origen: 'compras',
        ...(str(p.refCatastral, 30) ? { refCatastral: str(p.refCatastral, 30)! } : {}),
      })
      hayRetenciones = true
    }
  }
  if (hayRetenciones) avisos.push('Las retenciones se atribuyen al periodo de la factura o nómina, no al del pago: si se pagó en otro trimestre, ajústalo antes de revisar.')
  return { ops, retenciones, refAAsiento, avisos }
}
