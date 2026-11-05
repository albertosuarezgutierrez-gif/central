// F5 — Inmovilizado y amortizaciones. PURO: céntimos enteros, sin BD ni reloj. Método LINEAL.
//
// ⚠️ La tabla de coeficientes es DATO editable (cada empresa puede sustituirla), NO lógica, y es una versión SIMPLIFICADA de la tabla de
// amortización fiscal: sus porcentajes están marcados `certeza: 'media'` (recordados, pendientes de contrastar con el reglamento vigente).
// La amortización contable puede ser distinta de la fiscal; el máximo fiscal solo sirve de tope orientativo.
//
// Aritmética sin floats en el dinero: el % se guarda en PUNTOS BÁSICOS (1 % = 100 pb) y el cuadro se calcula con BigInt (importe × pb × meses
// excede 2^53 en importes grandes). Se amortiza mes a mes de forma ACUMULADA (acumulada(k) = redondeo(amortizable × pb × k / 120000)), así
// la suma nunca supera el valor amortizable y la última cuota ajusta el redondeo.
import { ErrorContable, validarCentimos, type Centimos } from '../partida/dinero.ts'
import { esFechaISO, rectificar, type Asiento, type ApunteAsiento } from '../partida/asiento.ts'

export type CategoriaActivo = string

export type FilaTablaAmortizacion = {
  categoria: CategoriaActivo
  descripcion: string
  /** Cuenta del activo por defecto (21x/20x). */
  cuentaActivo: string
  /** Amortización acumulada (281/280). */
  cuentaAmortizacionAcumulada: string
  /** Gasto por amortización (681/680). */
  cuentaGasto: string
  /** Coeficiente lineal MÁXIMO en puntos básicos (1.200 = 12 %). */
  porcentajeMaximoPb: number
  /** Periodo máximo en años (orientativo). */
  periodoMaximoAnios: number
  certeza: 'alta' | 'media'
}

/** Tabla por defecto (simplificada, a contrastar). Editable por empresa: la app guarda versiones y pasa la vigente. */
export const TABLA_AMORTIZACION_DEFECTO: readonly FilaTablaAmortizacion[] = [
  { categoria: 'edificios', descripcion: 'Edificios y otras construcciones', cuentaActivo: '211', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 300, periodoMaximoAnios: 68, certeza: 'media' },
  { categoria: 'instalaciones', descripcion: 'Instalaciones', cuentaActivo: '212', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 1000, periodoMaximoAnios: 20, certeza: 'media' },
  { categoria: 'maquinaria', descripcion: 'Maquinaria', cuentaActivo: '213', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 1200, periodoMaximoAnios: 18, certeza: 'media' },
  { categoria: 'utillaje', descripcion: 'Utillaje y herramientas', cuentaActivo: '214', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 3000, periodoMaximoAnios: 8, certeza: 'media' },
  { categoria: 'mobiliario', descripcion: 'Mobiliario y enseres', cuentaActivo: '216', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 1000, periodoMaximoAnios: 20, certeza: 'media' },
  { categoria: 'equipos_informaticos', descripcion: 'Equipos para procesos de información', cuentaActivo: '217', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 2500, periodoMaximoAnios: 8, certeza: 'media' },
  { categoria: 'elementos_transporte', descripcion: 'Elementos de transporte', cuentaActivo: '218', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 1600, periodoMaximoAnios: 14, certeza: 'media' },
  { categoria: 'otro_material', descripcion: 'Otro inmovilizado material', cuentaActivo: '219', cuentaAmortizacionAcumulada: '281', cuentaGasto: '681', porcentajeMaximoPb: 1000, periodoMaximoAnios: 20, certeza: 'media' },
  { categoria: 'aplicaciones_informaticas', descripcion: 'Aplicaciones informáticas', cuentaActivo: '206', cuentaAmortizacionAcumulada: '280', cuentaGasto: '680', porcentajeMaximoPb: 3300, periodoMaximoAnios: 6, certeza: 'media' },
]

export const CATEGORIAS_ACTIVO: readonly string[] = TABLA_AMORTIZACION_DEFECTO.map((f) => f.categoria)

export function filaDeTabla(tabla: readonly FilaTablaAmortizacion[], categoria: string): FilaTablaAmortizacion | undefined {
  return tabla.find((f) => f.categoria === categoria)
}

/** Alta de un bien. La pueden enviar otras verticales (material del empleado en RRHH, herramientas…) o darse a mano: solo el TIPO de entrada. */
export type EntradaInmovilizado = {
  /** Quién da el alta: 'manual' o la vertical (p. ej. 'rrhh'). */
  origen: string
  /** Clave del bien en el origen: (origen, refExterna) identifica el alta (idempotente). */
  refExterna: string
  descripcion: string
  categoria: CategoriaActivo
  /** ISO de entrada en funcionamiento. */
  fechaAlta: string
  valorAdquisicion: Centimos
  valorResidual?: Centimos
  /** Sustituye al máximo de la tabla (puntos básicos). Si se omite se usa el máximo de la categoría. */
  porcentajePb?: number
  /** false = el alta no pasó por una factura asentada: hay que asentarla (`asientoAltaInmovilizado`). Por defecto true. */
  yaContabilizado?: boolean
}

export type FichaActivo = {
  ref: string
  origen: string
  refExterna: string
  descripcion: string
  categoria: CategoriaActivo
  cuentaActivo: string
  cuentaAmortizacionAcumulada: string
  cuentaGasto: string
  fechaAlta: string
  valorAdquisicion: Centimos
  valorResidual: Centimos
  porcentajePb: number
  metodo: 'lineal'
  yaContabilizado: boolean
  /** Baja (venta o retirada), si la hay. */
  fechaBaja?: string | null
}

const REF_RE = /^[A-Za-z0-9._:\-/]{1,64}$/

/** Valida una entrada y construye la ficha (lanza `ErrorContable` con todos los problemas). `ref` la asigna quien persiste. */
export function fichaDesdeEntrada(e: EntradaInmovilizado, ref: string, tabla: readonly FilaTablaAmortizacion[] = TABLA_AMORTIZACION_DEFECTO): FichaActivo {
  const errs: string[] = []
  const fila = filaDeTabla(tabla, e.categoria)
  if (!fila) errs.push(`categoría desconocida: ${String(e.categoria)}`)
  if (!e.descripcion || !e.descripcion.trim()) errs.push('descripción obligatoria')
  if (typeof e.origen !== 'string' || !REF_RE.test(e.origen)) errs.push('origen no válido')
  if (typeof e.refExterna !== 'string' || !REF_RE.test(e.refExterna)) errs.push('refExterna no válida')
  if (!esFechaISO(e.fechaAlta)) errs.push('fecha de alta inválida')
  const val = Number.isSafeInteger(e.valorAdquisicion) ? e.valorAdquisicion : NaN
  if (!(val > 0)) errs.push('el valor de adquisición debe ser un entero positivo en céntimos')
  const res = e.valorResidual ?? 0
  if (!Number.isSafeInteger(res) || res < 0) errs.push('el valor residual debe ser un entero ≥ 0 en céntimos')
  else if (val > 0 && res >= val) errs.push('el valor residual debe ser menor que el valor de adquisición')
  const pb = e.porcentajePb ?? fila?.porcentajeMaximoPb
  if (pb === undefined || !Number.isInteger(pb) || pb < 1 || pb > 10000) errs.push('porcentaje de amortización inválido (1–10000 puntos básicos)')
  else if (fila && pb > fila.porcentajeMaximoPb) errs.push(`el porcentaje ${pb / 100} % supera el máximo de la tabla para ${fila.categoria} (${fila.porcentajeMaximoPb / 100} %)`)
  if (errs.length) throw new ErrorContable('activo_invalido', errs.join('; '))
  return {
    ref, origen: e.origen, refExterna: e.refExterna, descripcion: e.descripcion.trim(), categoria: e.categoria,
    cuentaActivo: fila!.cuentaActivo, cuentaAmortizacionAcumulada: fila!.cuentaAmortizacionAcumulada, cuentaGasto: fila!.cuentaGasto,
    fechaAlta: e.fechaAlta, valorAdquisicion: val, valorResidual: res, porcentajePb: pb!, metodo: 'lineal', yaContabilizado: e.yaContabilizado !== false,
    fechaBaja: null,
  }
}

export const amortizable = (f: Pick<FichaActivo, 'valorAdquisicion' | 'valorResidual'>): Centimos => f.valorAdquisicion - f.valorResidual

const mesIndice = (iso: string) => Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1)
const mesDeIndice = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

/** Amortización ACUMULADA tras `k` meses completos (k ≥ 0), topada al valor amortizable. Redondeo al céntimo (mitades hacia arriba). */
export function acumuladaTrasMeses(f: Pick<FichaActivo, 'valorAdquisicion' | 'valorResidual' | 'porcentajePb'>, k: number): Centimos {
  if (!Number.isInteger(k) || k < 0) throw new ErrorContable('meses_invalidos', 'meses inválidos')
  const base = BigInt(amortizable(f))
  const d = BigInt(120000)
  const num = base * BigInt(f.porcentajePb) * BigInt(k)
  const v = (BigInt(2) * num + d) / (BigInt(2) * d)
  return Number(v > base ? base : v)
}

export type FilaCuadro = {
  /** `AAAA-MM`. */
  mes: string
  cuota: Centimos
  acumulada: Centimos
  /** Valor neto contable al cierre del mes. */
  neto: Centimos
}

/**
 * Cuadro de amortización mensual. El mes de alta cuenta COMPLETO (convención simplificada). Si hay baja, la amortización termina en el mes
 * de la baja (inclusive). `hastaMes` (`AAAA-MM`) limita las filas devueltas; el cuadro completo acaba al agotar lo amortizable.
 */
export function cuadroAmortizacion(f: FichaActivo, hastaMes?: string): FilaCuadro[] {
  if (!esFechaISO(f.fechaAlta)) throw new ErrorContable('fecha_invalida', 'fecha de alta inválida')
  const ini = mesIndice(f.fechaAlta)
  const finBaja = f.fechaBaja ? mesIndice(f.fechaBaja) : Infinity
  const tope = hastaMes ? mesIndice(`${hastaMes}-01`) : Infinity
  const filas: FilaCuadro[] = []
  let prev = 0
  for (let k = 1; ; k++) {
    const idx = ini + k - 1
    if (idx > finBaja || idx > tope) break
    const acum = acumuladaTrasMeses(f, k)
    filas.push({ mes: mesDeIndice(idx), cuota: acum - prev, acumulada: acum, neto: f.valorAdquisicion - acum })
    prev = acum
    if (acum >= amortizable(f)) break
    if (k > 12 * 200) throw new ErrorContable('cuadro_infinito', 'cuadro de amortización sin fin')
  }
  return filas
}

/** Amortización acumulada de la ficha hasta el final del mes `AAAA-MM` (0 si aún no ha empezado). */
export function amortizacionAcumuladaHasta(f: FichaActivo, mes: string): Centimos {
  const filas = cuadroAmortizacion(f, mes)
  return filas.length ? filas[filas.length - 1].acumulada : 0
}

export type PeriodoAmortizacion = { anio: number; /** 1-12; sin mes = el año completo. */ mes?: number }

/** Cuotas de las fichas en el periodo (solo las > 0), por ficha. */
export function cuotasDelPeriodo(fichas: readonly FichaActivo[], p: PeriodoAmortizacion): { ref: string; cuota: Centimos; ficha: FichaActivo }[] {
  if (!Number.isInteger(p.anio) || (p.mes !== undefined && (!Number.isInteger(p.mes) || p.mes < 1 || p.mes > 12))) throw new ErrorContable('periodo_invalido', 'periodo inválido')
  const meses = p.mes !== undefined ? [`${p.anio}-${String(p.mes).padStart(2, '0')}`] : Array.from({ length: 12 }, (_, i) => `${p.anio}-${String(i + 1).padStart(2, '0')}`)
  const r: { ref: string; cuota: Centimos; ficha: FichaActivo }[] = []
  for (const f of fichas) {
    const cuota = cuadroAmortizacion(f).filter((x) => meses.includes(x.mes)).reduce((t, x) => t + x.cuota, 0)
    if (cuota > 0) r.push({ ref: f.ref, cuota, ficha: f })
  }
  return r
}

const refPeriodo = (p: PeriodoAmortizacion) => (p.mes !== undefined ? `${p.anio}-${String(p.mes).padStart(2, '0')}` : String(p.anio))
const finDeMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

/** Referencia de origen del asiento de amortización de un periodo (idempotencia: `amortizacion:2026-03` o `amortizacion:2026`). */
export const refAmortizacion = (p: PeriodoAmortizacion) => `amortizacion:${refPeriodo(p)}`

/**
 * Asiento de amortización del periodo (mensual o anual): Debe 681/680 (gasto) · Haber 281/280 (acumulada), agrupado por cuenta.
 * `null` si no hay cuota que asentar (nada que amortizar NO es un asiento a cero). Fecha = último día del periodo.
 */
export function asientoAmortizacion(fichas: readonly FichaActivo[], p: PeriodoAmortizacion): Asiento | null {
  const cuotas = cuotasDelPeriodo(fichas, p)
  if (!cuotas.length) return null
  const gasto = new Map<string, Centimos>()
  const acum = new Map<string, Centimos>()
  for (const { ficha, cuota } of cuotas) {
    gasto.set(ficha.cuentaGasto, (gasto.get(ficha.cuentaGasto) ?? 0) + cuota)
    acum.set(ficha.cuentaAmortizacionAcumulada, (acum.get(ficha.cuentaAmortizacionAcumulada) ?? 0) + cuota)
  }
  const apuntes: ApunteAsiento[] = [
    ...[...gasto.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([cuenta, debe]) => ({ cuenta, debe, haber: 0 })),
    ...[...acum.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([cuenta, haber]) => ({ cuenta, debe: 0, haber })),
  ]
  const mes = p.mes ?? 12
  return {
    fecha: `${p.anio}-${String(mes).padStart(2, '0')}-${String(finDeMes(p.anio, mes)).padStart(2, '0')}`,
    ejercicio: p.anio,
    concepto: p.mes !== undefined ? `Amortización del inmovilizado ${refPeriodo(p)}` : `Amortización del inmovilizado ejercicio ${p.anio}`,
    apuntes,
    origen: { tipo: 'amortizacion', ref: refAmortizacion(p) },
  }
}

/** Asiento de alta SOLO para bienes que no pasaron por una factura asentada (`yaContabilizado = false`): Debe 21x · Haber contrapartida. */
export function asientoAltaInmovilizado(f: FichaActivo, cuentaContrapartida: string): Asiento {
  if (f.yaContabilizado) throw new ErrorContable('alta_ya_contabilizada', 'el alta ya está contabilizada por su factura: no se vuelve a asentar')
  validarCentimos(f.valorAdquisicion)
  return {
    fecha: f.fechaAlta, ejercicio: Number(f.fechaAlta.slice(0, 4)), concepto: `Alta de inmovilizado: ${f.descripcion}`,
    apuntes: [{ cuenta: f.cuentaActivo, debe: f.valorAdquisicion, haber: 0, documento: f.ref }, { cuenta: cuentaContrapartida, debe: 0, haber: f.valorAdquisicion, documento: f.ref }],
    origen: { tipo: 'manual', ref: `alta-activo:${f.ref}` },
  }
}

export type ResultadoBaja = {
  asiento: Asiento
  /** + beneficio (771) · − pérdida (671). 0 = sin resultado. */
  resultado: Centimos
  valorNetoContable: Centimos
}

/**
 * Baja o venta de un activo. `amortizacionAcumulada` es la que consta en CONTABILIDAD (281/280 de esa ficha): hay que asentar antes la
 * amortización hasta el mes de la baja. Venta: `precioVenta` (base, sin IVA; el IVA va en su factura) y `cuentaContrapartida` (por defecto
 * 572 si ya está cobrada; usa 440 si queda pendiente). Sin `precioVenta` = retirada: el neto se pierde (671).
 * Resultado = precio − valor neto contable: > 0 → 771; < 0 → 671.
 */
export function bajaActivo(f: FichaActivo, o: { fecha: string; amortizacionAcumulada: Centimos; precioVenta?: Centimos; cuentaContrapartida?: string }): ResultadoBaja {
  if (!esFechaISO(o.fecha)) throw new ErrorContable('fecha_invalida', 'fecha de baja inválida')
  if (o.fecha < f.fechaAlta) throw new ErrorContable('baja_anterior_al_alta', 'la baja no puede ser anterior al alta')
  validarCentimos(o.amortizacionAcumulada, 'amortización acumulada')
  if (o.amortizacionAcumulada < 0) throw new ErrorContable('amortizacion_negativa', 'la amortización acumulada no puede ser negativa')
  if (o.amortizacionAcumulada > amortizable(f)) throw new ErrorContable('amortizacion_excede_valor', 'la amortización acumulada supera el valor amortizable del activo')
  const precio = o.precioVenta ?? 0
  validarCentimos(precio, 'precio de venta')
  if (precio < 0) throw new ErrorContable('precio_negativo', 'el precio de venta no puede ser negativo')
  const neto = f.valorAdquisicion - o.amortizacionAcumulada
  const resultado = precio - neto
  const doc = f.ref
  const apuntes: ApunteAsiento[] = []
  if (o.amortizacionAcumulada > 0) apuntes.push({ cuenta: f.cuentaAmortizacionAcumulada, debe: o.amortizacionAcumulada, haber: 0, documento: doc })
  if (precio > 0) apuntes.push({ cuenta: o.cuentaContrapartida ?? '572', debe: precio, haber: 0, documento: doc })
  if (resultado < 0) apuntes.push({ cuenta: '671', debe: -resultado, haber: 0, documento: doc })
  apuntes.push({ cuenta: f.cuentaActivo, debe: 0, haber: f.valorAdquisicion, documento: doc })
  if (resultado > 0) apuntes.push({ cuenta: '771', debe: 0, haber: resultado, documento: doc })
  return {
    asiento: {
      fecha: o.fecha, ejercicio: Number(o.fecha.slice(0, 4)), concepto: `${precio > 0 ? 'Venta' : 'Baja'} de inmovilizado: ${f.descripcion}`,
      apuntes, origen: { tipo: 'manual', ref: `baja-activo:${f.ref}` },
    },
    resultado,
    valorNetoContable: neto,
  }
}

/** Contraasiento de una baja registrada por error (el original no se toca). */
export const rectificarBaja = (baja: Asiento, fecha: string): Asiento => rectificar(baja, { fecha, concepto: `Rectificación: ${baja.concepto}` })

/** Resumen por ficha a una fecha (para la pantalla y la memoria): amortizado, neto y si está totalmente amortizado. */
export function resumenActivo(f: FichaActivo, hastaMes: string): { acumulada: Centimos; neto: Centimos; totalmenteAmortizado: boolean } {
  const acumulada = amortizacionAcumuladaHasta(f, hastaMes)
  return { acumulada, neto: f.valorAdquisicion - acumulada, totalmenteAmortizado: acumulada >= amortizable(f) }
}
