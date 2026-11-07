/**
 * N3 — Nómina confirmada → «hecho contable» para el puerto de contabilidad (`POST /api/hechos`). PURO.
 *
 * El motor/BD guardan EUROS (NUMERIC → float); el puerto exige CÉNTIMOS. Cada importe se convierte UNA sola vez
 * (`eurosACentimos`) y el cuadre se comprueba en céntimos: bruto − IRPF − SS trabajador = líquido. Un desfase de ±1 céntimo
 * (ruido de redondeo de los derivados) se reparte en la SS del trabajador, que es la única cifra derivada
 * (`deducciones.total − irpf`); más de 1 céntimo, o que 640 + 642 ≠ coste empresa del desglose, es un ERROR (nada se asienta).
 *
 * Tipo del hecho: estructuralmente idéntico a `HechoNomina` / `HechoPago` de `@central/module-contabilidad` (no se importa:
 * rrhh no depende de ese paquete). El cepo `regression-nomina-asiento` lo compara con el real.
 * Idempotencia: `ref = nomina:<id>` (el puerto deduplica por empresa + tipo + ref).
 */
import { eurosACentimos, type Centimos } from './dinero'
import { desgloseConfirmable } from './calcular'
import type { NominaDesglose } from './tipos'

export interface HechoNominaPuerto {
  tipo: 'nomina'
  fecha: string
  ref: string
  concepto: string
  documento: string
  dimensiones: Readonly<Record<string, string>>
  bruto: Centimos
  ssEmpresa: Centimos
  irpf: Centimos
  ssTrabajador: Centimos
  liquido: Centimos
}

export interface HechoPagoNominaPuerto {
  tipo: 'pago'
  fecha: string
  ref: string
  concepto: string
  medio: 'transferencia'
  importe: Centimos
  /** Cuenta del tercero: 465 remuneraciones pendientes de pago (el asiento de la nómina la dejó al haber). */
  cuentaTercero: string
}

export class ErrorNominaHecho extends Error {
  readonly codigo: 'desglose_no_confirmable' | 'importe_invalido' | 'descuadre' | 'coste_no_cuadra' | 'periodo_invalido' | 'dimension_invalida'
  constructor(codigo: ErrorNominaHecho['codigo'], mensaje: string) { super(mensaje); this.name = 'ErrorNominaHecho'; this.codigo = codigo }
}

export interface NominaParaHecho {
  nominaId: string
  empleadoId: string
  /** Centro de coste (obra) si se conoce; opcional. */
  centroCosteId?: string | null
  /** AAAA-MM */
  periodo: string
  desglose: unknown
}

const ID = /^[0-9a-zA-Z-]{8,64}$/

function ultimoDia(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new ErrorNominaHecho('periodo_invalido', `Período inválido: ${periodo}`)
  const dia = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
  return `${periodo}-${String(dia).padStart(2, '0')}`
}

function cent(euros: unknown, etiqueta: string): Centimos {
  if (typeof euros !== 'number' || !Number.isFinite(euros) || euros < 0) throw new ErrorNominaHecho('importe_invalido', `${etiqueta} no es un importe válido (${String(euros)})`)
  return eurosACentimos(euros)
}

export function nominaAHecho(n: NominaParaHecho): HechoNominaPuerto {
  if (!ID.test(n.nominaId) || !ID.test(n.empleadoId)) throw new ErrorNominaHecho('dimension_invalida', 'nominaId/empleadoId inválidos')
  if (n.centroCosteId != null && !ID.test(n.centroCosteId)) throw new ErrorNominaHecho('dimension_invalida', 'centroCosteId inválido')
  const fecha = ultimoDia(n.periodo)
  const c = desgloseConfirmable(n.desglose)
  if (!c.ok) throw new ErrorNominaHecho('desglose_no_confirmable', c.motivo)
  const d = n.desglose as NominaDesglose

  const bruto = cent(d.devengos?.total, 'bruto')
  const ssEmpresa = cent(d.cuotaPatronal?.total, 'SS empresa')
  const irpf = cent(d.deducciones?.irpf, 'IRPF')
  const deduc = cent(d.deducciones?.total, 'deducciones')
  const liquido = cent(d.netoAPagar, 'líquido')
  const coste = cent(d.costeTotalEmpresa, 'coste empresa')

  if (irpf > deduc) throw new ErrorNominaHecho('descuadre', 'IRPF mayor que el total de deducciones')
  let ssTrabajador = deduc - irpf
  const desfase = bruto - irpf - ssTrabajador - liquido
  if (desfase !== 0) {
    if (Math.abs(desfase) > 1) throw new ErrorNominaHecho('descuadre', `bruto − IRPF − SS trabajador ≠ líquido (desfase de ${desfase} céntimos)`)
    ssTrabajador += desfase // el céntimo de redondeo se reparte en la única cifra derivada
  }
  if (bruto + ssEmpresa !== coste) {
    throw new ErrorNominaHecho('coste_no_cuadra', `640 + 642 (${bruto + ssEmpresa}) ≠ coste empresa del desglose (${coste})`)
  }

  return {
    tipo: 'nomina', fecha, ref: `nomina:${n.nominaId}`, concepto: `Nómina ${n.periodo}`, documento: `nomina:${n.nominaId}`,
    dimensiones: { empleado: n.empleadoId, ...(n.centroCosteId ? { centro_coste: n.centroCosteId } : {}) },
    bruto, ssEmpresa, irpf, ssTrabajador, liquido,
  }
}

/** Pago del líquido: D465 / H572. La ref es distinta de la de la nómina, así que no choca con su idempotencia. */
export function pagoNominaAHecho(h: Pick<HechoNominaPuerto, 'ref' | 'liquido'>, fechaPago: string): HechoPagoNominaPuerto {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) throw new ErrorNominaHecho('periodo_invalido', `Fecha de pago inválida: ${fechaPago}`)
  if (!Number.isSafeInteger(h.liquido) || h.liquido < 0) throw new ErrorNominaHecho('importe_invalido', 'líquido inválido')
  return { tipo: 'pago', fecha: fechaPago, ref: `pago-${h.ref}`, concepto: `Pago ${h.ref}`, medio: 'transferencia', importe: h.liquido, cuentaTercero: '465' }
}
