/**
 * Motor de nómina en CÉNTIMOS ENTEROS (N0, 05/11/2026). Puro: sin BD, sin red, sin reloj.
 *
 * Fórmulas (todas las cuotas = round(base × tipo), un redondeo por línea — `aplicarTipo`):
 *   salarioEf      = round(salarioBase × jornada/100)
 *   prorrata       = 14 pagas → round(salarioEf × 2 / 12) (paga extra = salario base efectivo); 12 pagas → 0
 *   devengado      = salarioEf + complementos + [prorrata si se prorratea] + [paga extra si toca este mes]
 *                    + horas extra + pluses − descuentos
 *   remuneración CC = devengado − horas extra − paga extra cobrada este mes + prorrata (14 pagas, siempre)
 *   base CC        = clamp(remuneración CC, mín. grupo, máx.)          (Orden PJC/297/2026 arts. 1.1 y 3)
 *   base CP        = clamp(remuneración CC + horas extra, tope mín., máx.) (AT/EP, desempleo, FOGASA, FP: arts. 1.2, 2.2, 33.1)
 *   tiempo parcial = mínimos POR HORA × horas trabajadas del mes (arts. 38.3 y 39); sin horas → mínimo × jornada (pendiente)
 *   exceso solid.  = max(0, remuneración CC + horas extra − máx.)          → tramos de solidaridad (art. 17, reparto por tramo)
 *   MEI            = sobre base CC
 *   IRPF           = devengado × % del contrato (plano) o, con `irpfAlgoritmo`, × tipo del algoritmo AEAT (irpf.ts)
 *   neto           = devengado − deducciones trabajador ; coste = devengado + cuota empresa
 * Grupos 8-11: bases diarias × días naturales del mes (mínimo CP = mínimo CC: no se toca, fuera de alcance).
 *
 * Modos: «calculo» = nómina que se confirmará → cualquier cifra/regla PENDIENTE_VERIFICAR usada LANZA.
 *        «simulacion» = borrador: usa los candidatos y lista lo pendiente en `cifrasPendientes`.
 */
import { CifraDesconocidaError, CifraPendienteError, PENDIENTE_VERIFICAR, type Cifra } from './cifras'
import { aplicarTipo, esCentimos, type Centimos, type Ppm } from './dinero'
import { calcularTipoIrpf, type DetalleIrpf } from './irpf'
import { retribucionAnualPrevisible } from './pagas'
import type { SituacionFamiliar } from './situacion-familiar'
import { tablaDelAño, type GrupoDiario, type GrupoMensual, type TablaAnual, type TablaIrpf } from './tablas'
import type { GrupoCotizacion, TipoIncidencia } from './tipos'

export type ModoCalculo = 'calculo' | 'simulacion'
export type DuracionContrato = 'indefinido' | 'temporal'

export interface IncidenciaCentimos {
  tipo: TipoIncidencia
  concepto: string
  importe?: Centimos
  horas?: number
  dias?: number
}

export interface EntradaNomina {
  periodo: string // YYYY-MM
  grupo: GrupoCotizacion
  /** null = no se sabe (p. ej. contrato «parcial» sin duración): pendiente en modo cálculo. */
  duracion: DuracionContrato | null
  jornadaPct: number // 100 = completa
  /** Tiempo parcial: horas ordinarias + complementarias REALMENTE trabajadas en el mes (art. 39.2 Orden PJC/297/2026).
   *  Sin dato (undefined) = «no se sabe» → mínimo mensual × jornada y regla pendiente. */
  horasTrabajadasMes?: number
  salarioBase: Centimos // mensual, jornada completa
  complementosFijos: { concepto: string; importe: Centimos }[]
  pagas: 12 | 14
  /** Solo con 14 pagas: true = las extras se pagan prorrateadas cada mes. */
  prorrataExtras: boolean
  mesesPagaExtra?: number[] // por defecto [6, 12]
  /** % plano heredado. Se IGNORA si hay `irpfAlgoritmo`. */
  irpfPct: number
  /** N1: retención por el algoritmo AEAT (tipo anual sobre la retribución previsible). null en `situacion` = sin modelo 145. */
  irpfAlgoritmo?: { situacion: SituacionFamiliar | null; duracionInferiorAño?: boolean }
  /** Tipo AT/EP de la empresa en ppm; null = «no se sabe» (sin CNAE resuelto). */
  atEp: Ppm | null
  incidencias: IncidenciaCentimos[]
  diasLaborablesMes?: number // por defecto 22 (descuentos por días)
}

export interface OpcionesCalculo {
  modo: ModoCalculo
  /** Para tests: tabla explícita. Por defecto, la del año del periodo (o error). */
  tabla?: TablaAnual
  /** Para tests: tabla IRPF explícita. Por defecto, la del año (o error). */
  tablaIrpf?: TablaIrpf
}

export interface NominaCentimos {
  periodo: string
  año: number
  modo: ModoCalculo
  devengos: {
    salarioBase: Centimos
    complementosFijos: { concepto: string; importe: Centimos }[]
    prorrataExtras: Centimos
    pagaExtra: Centimos
    horasExtra: Centimos
    pluses: { concepto: string; importe: Centimos }[]
    descuentos: Centimos
    total: Centimos
  }
  bases: { contingenciasComunes: Centimos; contingenciasProfesionales: Centimos; irpf: Centimos; excesoSolidaridad: Centimos }
  trabajador: { contingenciasComunes: Centimos; desempleo: Centimos; fp: Centimos; mei: Centimos; solidaridad: Centimos; irpf: Centimos; total: Centimos }
  empresa: { contingenciasComunes: Centimos; desempleo: Centimos; fogasa: Centimos; fp: Centimos; atEp: Centimos; mei: Centimos; solidaridad: Centimos; total: Centimos }
  /** N1: detalle del algoritmo IRPF (null = % plano heredado). */
  irpf: DetalleIrpf | null
  neto: Centimos
  costeEmpresa: Centimos
  /** Claves de cifras/reglas PENDIENTE_VERIFICAR que intervinieron (vacío = todo verificado o probable). */
  cifrasPendientes: string[]
  avisos: string[]
}

/** Reglas que el motor N0 aún no implementa bien: en modo cálculo bloquean si se activan. */
export const REGLAS_PENDIENTES = {
  base_min_parcial: 'Base mínima a tiempo parcial sin `horasTrabajadasMes`: la Orden fija mínimos POR HORA (arts. 38.3 y 39); se usa el mínimo mensual × jornada (aproximación)',
  horas_extra_cotizacion_adicional: 'Horas extra: falta la cotización adicional (LGSS art. 149) y el precio por convenio (aquí salario/160)',
  it_prestacion: 'Baja IT: se descuenta por días; falta la prestación (60 %/75 %, pago delegado)',
  duracion_contrato: 'Contrato «parcial» sin duración conocida: no se sabe si desempleo va a tipo indefinido o temporal',
  at_ep_empresa: 'Empresa sin tipo AT/EP (CNAE sin resolver): en simulación se usa 1,50 % provisional',
} as const

const AT_EP_PROVISIONAL: Ppm = 15_000
const MESES_EXTRA = [6, 12]

function diasDelMes(año: number, mes: number): number {
  return new Date(Date.UTC(año, mes, 0)).getUTCDate()
}

function esMensual(g: GrupoCotizacion): g is GrupoMensual {
  return g <= 7
}

export function calcularNominaCentimos(e: EntradaNomina, opts: OpcionesCalculo): NominaCentimos {
  const m = /^(\d{4})-(\d{2})$/.exec(e.periodo)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`Período inválido: ${e.periodo}`)
  const año = Number(m[1])
  const mes = Number(m[2])
  const tabla = opts.tabla ?? tablaDelAño(año)
  if (tabla.año !== año) throw new Error(`Tabla de ${tabla.año} para un periodo de ${año}`)
  if (!(e.jornadaPct > 0 && e.jornadaPct <= 100)) throw new Error(`Jornada inválida: ${e.jornadaPct}`)
  if (!esCentimos(e.salarioBase) || e.salarioBase < 0) throw new Error('salarioBase debe ser céntimos enteros ≥ 0')

  const pendientes = new Set<string>()
  const usar = <T>(c: Cifra<T>): T => {
    if (c.valor === null) throw new CifraDesconocidaError(c.clave)
    if (c.certeza === PENDIENTE_VERIFICAR) pendientes.add(c.clave)
    return c.valor
  }
  const regla = (clave: keyof typeof REGLAS_PENDIENTES) => pendientes.add(`regla:${clave}`)
  const avisos: string[] = []

  // ── Devengos ───────────────────────────────────────────────────────────
  const salarioEf = Math.round((e.salarioBase * e.jornadaPct) / 100)
  const complementosFijos = e.complementosFijos.map(c => ({ concepto: c.concepto, importe: c.importe }))
  const totalCompl = complementosFijos.reduce((s, c) => s + c.importe, 0)

  const prorrataMensual = e.pagas === 14 ? Math.round((salarioEf * 2) / 12) : 0
  const mesesExtra = e.mesesPagaExtra ?? MESES_EXTRA
  const prorrataCobrada = e.pagas === 14 && e.prorrataExtras ? prorrataMensual : 0
  const pagaExtra = e.pagas === 14 && !e.prorrataExtras && mesesExtra.includes(mes) ? salarioEf : 0

  const he = e.incidencias.filter(i => i.tipo === 'horas_extra')
  const horasExtra = he.reduce((s, i) => s + Math.round((e.salarioBase * (i.horas ?? 0)) / 160), 0)
  if (horasExtra > 0) regla('horas_extra_cotizacion_adicional')

  const pluses = e.incidencias.filter(i => i.tipo === 'plus_puntual').map(i => ({ concepto: i.concepto, importe: i.importe ?? 0 }))
  const totalPluses = pluses.reduce((s, p) => s + p.importe, 0)

  const diasLab = e.diasLaborablesMes ?? 22
  const importeDia = Math.round(salarioEf / diasLab)
  let descuentos = 0
  for (const i of e.incidencias) {
    if (i.tipo === 'descuento') descuentos += i.importe ?? 0
    else if (i.tipo === 'ausencia_injustificada' || i.tipo === 'baja_it' || i.tipo === 'vacaciones') {
      descuentos += i.importe != null ? i.importe : (i.dias ?? 0) * importeDia
    }
    if (i.tipo === 'baja_it') regla('it_prestacion')
  }

  const total = salarioEf + totalCompl + prorrataCobrada + pagaExtra + horasExtra + totalPluses - descuentos

  // ── Bases ──────────────────────────────────────────────────────────────
  let min: Centimos
  let minCP: Centimos
  let max: Centimos
  if (esMensual(e.grupo)) {
    const b = tabla.basesMensuales[e.grupo]
    min = usar(b.min)
    max = usar(b.max)
    minCP = usar(tabla.topeMinimoCP)
  } else {
    const b = tabla.basesDiarias[e.grupo as GrupoDiario]
    const dias = diasDelMes(año, mes)
    min = usar(b.min) * dias
    max = usar(b.max) * dias
    minCP = min
  }
  if (e.jornadaPct < 100) {
    const horas = e.horasTrabajadasMes
    const hCC = tabla.parcial.minimoHoraCC[e.grupo]
    const hCP = tabla.parcial.minimoHoraCP
    if (horas !== undefined && hCC.valor !== null && hCP.valor !== null) {
      if (!(Number.isFinite(horas) && horas >= 0)) throw new Error(`horasTrabajadasMes inválidas: ${horas}`)
      min = Math.round(horas * usar(hCC))
      minCP = Math.round(horas * usar(hCP))
    } else {
      regla('base_min_parcial')
      min = Math.round((min * e.jornadaPct) / 100)
      minCP = Math.round((minCP * e.jornadaPct) / 100)
    }
  }
  const remCC = total - horasExtra - pagaExtra + prorrataMensual - prorrataCobrada
  const baseCC = Math.max(min, Math.min(max, remCC))
  const baseCP = Math.max(minCP, Math.min(max, remCC + horasExtra))
  const exceso = Math.max(0, remCC + horasExtra - max)

  // ── Tipos ──────────────────────────────────────────────────────────────
  const t = tabla.tipos
  let duracion = e.duracion
  if (duracion === null) {
    regla('duracion_contrato')
    duracion = 'temporal' // provisional (como el motor anterior para «parcial»)
  }
  const des = duracion === 'indefinido' ? t.desempleoIndefinido : t.desempleoTemporal
  let atEp = e.atEp
  if (atEp === null) {
    regla('at_ep_empresa')
    atEp = AT_EP_PROVISIONAL
  }

  // Solidaridad por tramos sobre el exceso. Reparto: el de la Orden por tramo (2026, art. 17.1) o, sin él, proporción de CC.
  let solTrab = 0
  let solEmp = 0
  if (exceso > 0) {
    let resto = exceso
    let desde = 0
    let solTotalSinReparto = 0
    for (const tramo of tabla.solidaridad.tramos) {
      const hasta = tramo.hastaPctSobreMax === null ? Infinity : Math.round((max * tramo.hastaPctSobreMax) / 100)
      const enTramo = Math.min(resto, hasta - desde)
      if (enTramo > 0) {
        const total = usar(tramo.tipo)
        if (tramo.reparto) {
          const pe = usar(tramo.reparto.empresa)
          const pt = usar(tramo.reparto.trabajador)
          if (pe + pt !== total) throw new Error(`Solidaridad: el reparto del tramo no suma su tipo (${tramo.tipo.clave})`)
          solEmp += aplicarTipo(enTramo, pe)
          solTrab += aplicarTipo(enTramo, pt)
        } else solTotalSinReparto += aplicarTipo(enTramo, total)
      }
      resto -= Math.max(0, enTramo)
      desde = hasta
      if (resto <= 0) break
    }
    if (solTotalSinReparto > 0) {
      const rcc = tabla.solidaridad.repartoComoCC
      if (!rcc) throw new Error('Solidaridad: tramo sin reparto y la tabla no dice cómo repartir')
      usar(rcc)
      const ccE = usar(t.contingenciasComunes.empresa)
      const ccT = usar(t.contingenciasComunes.trabajador)
      const tr = Math.round((solTotalSinReparto * ccT) / (ccE + ccT))
      solTrab += tr
      solEmp += solTotalSinReparto - tr
    }
  }

  const trabajadorSinIrpf = {
    contingenciasComunes: aplicarTipo(baseCC, usar(t.contingenciasComunes.trabajador)),
    desempleo: aplicarTipo(baseCP, usar(des.trabajador)),
    fp: aplicarTipo(baseCP, usar(t.fp.trabajador)),
    mei: aplicarTipo(baseCC, usar(t.mei.trabajador)),
    solidaridad: solTrab,
  }
  let irpfDetalle: DetalleIrpf | null = null
  let irpf: Centimos
  if (e.irpfAlgoritmo) {
    const cotMensual = trabajadorSinIrpf.contingenciasComunes + trabajadorSinIrpf.desempleo + trabajadorSinIrpf.fp + trabajadorSinIrpf.mei
    irpfDetalle = calcularTipoIrpf(
      {
        retribucionAnual: retribucionAnualPrevisible({ salarioEf, complementosMensuales: totalCompl, pagas: e.pagas }),
        cotizacionesAnual: cotMensual * 12,
        situacion: e.irpfAlgoritmo.situacion,
        duracionInferiorAño: e.irpfAlgoritmo.duracionInferiorAño,
      },
      { año, modo: 'simulacion', tabla: opts.tablaIrpf },
    )
    for (const c of irpfDetalle.cifrasPendientes) pendientes.add(c)
    avisos.push(...irpfDetalle.avisos.map(a => `irpf:${a}`))
    irpf = aplicarTipo(Math.max(0, total), irpfDetalle.tipoPpm)
  } else {
    irpf = aplicarTipo(total, Math.round(Number((e.irpfPct * 10_000).toPrecision(15))))
  }
  const trabajador = {
    ...trabajadorSinIrpf,
    irpf,
    total: Object.values(trabajadorSinIrpf).reduce((s, x) => s + x, 0) + irpf,
  }

  usar(t.mei.total)
  const empresaLineas = {
    contingenciasComunes: aplicarTipo(baseCC, usar(t.contingenciasComunes.empresa)),
    desempleo: aplicarTipo(baseCP, usar(des.empresa)),
    fogasa: aplicarTipo(baseCP, usar(t.fogasa)),
    fp: aplicarTipo(baseCP, usar(t.fp.empresa)),
    atEp: aplicarTipo(baseCP, atEp),
    mei: aplicarTipo(baseCC, usar(t.mei.empresa)),
    solidaridad: solEmp,
  }
  const empresa = { ...empresaLineas, total: Object.values(empresaLineas).reduce((s, x) => s + x, 0) }

  // ── Avisos (no bloquean) ──────────────────────────────────────────────
  const smiAnual = tabla.smi.anual.valor
  if (smiAnual !== null) {
    const anualCompleta = (e.salarioBase + totalCompl) * 12 + (e.pagas === 14 ? e.salarioBase * 2 : 0)
    if (anualCompleta < smiAnual) avisos.push('bajo_smi: el salario anual a jornada completa no llega al SMI')
  }
  if (remCC < min) avisos.push('base_minima_aplicada')
  if (remCC + horasExtra > max) avisos.push('base_maxima_aplicada')

  const cifrasPendientes = [...pendientes].sort()
  if (opts.modo === 'calculo' && cifrasPendientes.length) throw new CifraPendienteError(cifrasPendientes)

  return {
    periodo: e.periodo,
    año,
    modo: opts.modo,
    devengos: { salarioBase: salarioEf, complementosFijos, prorrataExtras: prorrataCobrada, pagaExtra, horasExtra, pluses, descuentos, total },
    bases: { contingenciasComunes: baseCC, contingenciasProfesionales: baseCP, irpf: total, excesoSolidaridad: exceso },
    trabajador,
    empresa,
    irpf: irpfDetalle,
    neto: total - trabajador.total,
    costeEmpresa: total + empresa.total,
    cifrasPendientes,
    avisos,
  }
}
