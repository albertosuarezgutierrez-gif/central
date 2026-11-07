/**
 * FINIQUITO (liquidación por extinción del contrato). Puro, en CÉNTIMOS, sin reloj: todas las fechas llegan en la entrada.
 *
 * Fuentes (textos consolidados del BOE, consultados el 07/11/2026):
 *   ET  = RDLeg 2/2015 (BOE-A-2015-11430, últ. act. 21/10/2026): art. 38 (vacaciones), 49.1.c) (fin de contrato temporal:
 *         12 días por año, salvo formativos y sustitución), 53.1.b) (objetivo: 20 días/año, prorrata por meses, máx. 12
 *         mensualidades), 56.1 (improcedente: 33 días/año, prorrata por meses, máx. 24 mensualidades), DT 11.ª
 *         (contratos anteriores al 12/02/2012: 45 días/año por el tiempo anterior + 33 por el posterior; máx. 720 días salvo
 *         que el tramo anterior dé más, y nunca más de 42 mensualidades).
 *   LIRPF = Ley 35/2006 (BOE-A-2006-20764) art. 7.e): exenta la indemnización en la cuantía OBLIGATORIA del ET (no la
 *         pactada; sí la acordada en conciliación ante el servicio administrativo); en despido colectivo o extinción del
 *         art. 52.c) por causas ETOP, exenta hasta el límite obligatorio del despido improcedente; límite 180.000 €.
 *
 * Convenciones (aritméticas, no cifras legales): salario diario = salario anual / 365; mensualidad = salario anual / 12;
 * días de vacaciones en días NATURALES (art. 38.1 ET: mínimo 30 naturales) devengados en el año natural de la baja;
 * valor del día de vacaciones = salario mensual × 12 / 365 (se puede fijar `valorDiaVacaciones` desde el convenio).
 * Reglas sin fuente primaria descargable → PENDIENTE (modo «calculo» LANZA, «simulacion» las lista):
 *   - `regla:finiquito_fraccion_mes`: la fracción de mes del art. 53/56 se cuenta como mes completo (criterio
 *     jurisprudencial; el ET solo dice «prorrateándose por meses»).
 *   - `regla:finiquito_exencion_fin_contrato`: exención del art. 7.e) de la indemnización por fin de contrato temporal
 *     (doctrina administrativa, no el texto de la ley).
 */
import { CifraPendienteError } from './cifras'
import { esCentimos, type Centimos } from './dinero'

export type ModoFiniquito = 'calculo' | 'simulacion'

export type CausaExtincion =
  /** Art. 49.1.c) ET. `sustitucion` y `formativo` no tienen indemnización. */
  | { tipo: 'fin_contrato_temporal'; modalidad: 'ordinaria' | 'sustitucion' | 'formativo' }
  /** Art. 52-53 ET. `causa52c` = causas económicas, técnicas, organizativas o de producción (exención ampliada, art. 7.e LIRPF). */
  | { tipo: 'objetivo'; causa52c: boolean }
  /** Art. 56 ET. `via`: la exención exige que la cuantía sea obligatoria (sentencia) o acordada en conciliación administrativa. */
  | { tipo: 'improcedente'; via: 'sentencia' | 'conciliacion_administrativa' | 'reconocimiento_empresa' }
  /** Dimisión / baja voluntaria: sin indemnización. */
  | { tipo: 'dimision' }

export interface PagaExtraPendiente {
  concepto: string
  /** Importe de UNA paga completa. */
  importe: Centimos
  /** Periodo de devengo de esta paga según convenio (YYYY-MM-DD, ambos inclusive), p. ej. 2026-01-01 → 2026-06-30. */
  inicioDevengo: string
  finDevengo: string
}

export interface EntradaFiniquito {
  /** Inicio del tiempo de servicios computable (antigüedad). */
  fechaAntiguedad: string
  /** Último día de servicios (inclusive). */
  fechaBaja: string
  causa: CausaExtincion
  /** Salario mensual ordinario (base + complementos fijos), sin pagas extra. */
  salarioMensual: Centimos
  /** Salario anual regulador de la indemnización (todo lo devengado en el año, incluidas las extras). */
  salarioAnual: Centimos
  /** Pagas extra NO prorrateadas pendientes de cobro, con su periodo de devengo. [] = ninguna (prorrateadas o cobradas). */
  pagasExtra: PagaExtraPendiente[]
  vacaciones: {
    /** Días naturales de vacaciones al año (convenio; mínimo legal 30). */
    diasAnuales: number
    /** Días naturales ya disfrutados en el año de la baja. */
    diasDisfrutados: number
    /** Valor de un día de vacaciones según convenio; sin él, salario mensual × 12 / 365. */
    valorDiaVacaciones?: Centimos
  }
  /** Indemnización efectivamente pagada si difiere de la obligatoria (pactada mayor, acuerdo menor). Sin dato = la obligatoria. */
  indemnizacionPagada?: Centimos
}

export interface Finiquito {
  vacaciones: { diasDevengados: number; diasPendientes: number; importe: Centimos }
  pagasExtra: { concepto: string; diasDevengados: number; diasPeriodo: number; importe: Centimos }[]
  indemnizacion: {
    /** Días de salario de indemnización obligatoria (con decimales). */
    dias: number
    obligatoria: Centimos
    pagada: Centimos
    /** Parte exenta del IRPF (art. 7.e LIRPF). */
    exenta: Centimos
    /** Parte sujeta a IRPF (pagada − exenta). */
    sujeta: Centimos
    topeAplicado: boolean
  }
  /** Conceptos salariales (vacaciones + pagas): cotizan y tributan. */
  totalSalarial: Centimos
  total: Centimos
  cifrasPendientes: string[]
  avisos: string[]
}

/** Art. 7.e) LIRPF: límite de la indemnización exenta. */
export const LIMITE_EXENCION_INDEMNIZACION: Centimos = 18_000_000
/** DT 11.ª ET: fecha de corte de la reforma laboral de 2012. */
export const FECHA_REFORMA_2012 = '2012-02-12'

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

function dia(f: string): number {
  const m = FECHA.exec(f)
  if (!m) throw new Error(`Fecha inválida: ${f}`)
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(t)
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) throw new Error(`Fecha inválida: ${f}`)
  return t / 86_400_000
}

function fecha(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10)
}

/** Días entre dos fechas, ambos inclusive (0 si `hasta` < `desde`). */
export function diasInclusive(desde: string, hasta: string): number {
  return Math.max(0, dia(hasta) - dia(desde) + 1)
}

/** Suma `n` meses a una fecha (día recortado al último del mes de destino). */
function sumarMeses(f: string, n: number): string {
  const [y, m, d] = f.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const yy = Math.floor(total / 12)
  const mm = total % 12
  const ultimo = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

/** Meses completos de servicio entre `desde` y `hasta` (inclusive) y los días sueltos que sobran. */
export function mesesDeServicio(desde: string, hasta: string): { completos: number; diasResto: number } {
  if (dia(hasta) < dia(desde)) return { completos: 0, diasResto: 0 }
  const [y1, m1] = desde.split('-').map(Number)
  const [y2, m2] = hasta.split('-').map(Number)
  let n = (y2 - y1) * 12 + (m2 - m1) + 1
  while (n > 0 && dia(sumarMeses(desde, n)) - 1 > dia(hasta)) n--
  const finMeses = dia(sumarMeses(desde, n)) - 1 // último día cubierto por los n meses
  return { completos: n, diasResto: dia(hasta) - finMeses }
}

export function calcularFiniquito(e: EntradaFiniquito, modo: ModoFiniquito): Finiquito {
  for (const [k, v] of [['salarioMensual', e.salarioMensual], ['salarioAnual', e.salarioAnual]] as const) {
    if (!esCentimos(v) || v < 0) throw new Error(`${k} debe ser céntimos enteros ≥ 0`)
  }
  if (e.indemnizacionPagada !== undefined && (!esCentimos(e.indemnizacionPagada) || e.indemnizacionPagada < 0)) throw new Error('indemnizacionPagada debe ser céntimos enteros ≥ 0')
  if (dia(e.fechaBaja) < dia(e.fechaAntiguedad)) throw new Error('fechaBaja anterior a fechaAntiguedad')
  const v = e.vacaciones
  if (!(Number.isFinite(v.diasAnuales) && v.diasAnuales >= 0) || !(Number.isFinite(v.diasDisfrutados) && v.diasDisfrutados >= 0)) throw new Error('Días de vacaciones inválidos')
  if (v.valorDiaVacaciones !== undefined && (!esCentimos(v.valorDiaVacaciones) || v.valorDiaVacaciones < 0)) throw new Error('valorDiaVacaciones debe ser céntimos enteros ≥ 0')

  const pend = new Set<string>()
  const avisos: string[] = []
  if (v.diasAnuales < 30) avisos.push('vacaciones_bajo_minimo_legal_30_dias')

  // ── Vacaciones devengadas no disfrutadas (año natural de la baja) ──────────────────────────────
  const añoBaja = e.fechaBaja.slice(0, 4)
  const inicioAño = `${añoBaja}-01-01`
  const desdeVac = dia(e.fechaAntiguedad) > dia(inicioAño) ? e.fechaAntiguedad : inicioAño
  const diasTrab = diasInclusive(desdeVac, e.fechaBaja)
  const diasAño = diasInclusive(inicioAño, `${añoBaja}-12-31`)
  // pendientes = diasAnuales × diasTrab / diasAño − disfrutados (fracción exacta: numerador / diasAño)
  const numPend = v.diasAnuales * diasTrab - v.diasDisfrutados * diasAño
  const importeVac = v.valorDiaVacaciones !== undefined
    ? Math.round((numPend * v.valorDiaVacaciones) / diasAño)
    : Math.round((numPend * e.salarioMensual * 12) / (diasAño * 365))
  if (numPend < 0) avisos.push('vacaciones_disfrutadas_de_mas')
  const r2 = (x: number) => Math.round(x * 100) / 100

  // ── Pagas extra no prorrateadas: parte devengada ────────────────────────────────────────────────
  const pagas = e.pagasExtra.map(p => {
    if (!esCentimos(p.importe) || p.importe < 0) throw new Error(`Paga «${p.concepto}»: importe debe ser céntimos enteros ≥ 0`)
    const periodo = diasInclusive(p.inicioDevengo, p.finDevengo)
    if (periodo === 0) throw new Error(`Paga «${p.concepto}»: periodo de devengo vacío`)
    const desde = dia(e.fechaAntiguedad) > dia(p.inicioDevengo) ? e.fechaAntiguedad : p.inicioDevengo
    const hasta = dia(e.fechaBaja) < dia(p.finDevengo) ? e.fechaBaja : p.finDevengo
    const dev = diasInclusive(desde, hasta)
    return { concepto: p.concepto, diasDevengados: dev, diasPeriodo: periodo, importe: Math.round((p.importe * dev) / periodo) }
  })

  // ── Indemnización ───────────────────────────────────────────────────────────────────────────────
  const anual = e.salarioAnual
  /** Importe de (diasX12 / 12) días de salario: diasX12 × anual / (12 × 365), un redondeo. */
  const porDiasX12 = (diasX12: number) => Math.round((diasX12 * anual) / (12 * 365))
  /** «diasPorAño» por año de servicio, prorrata por meses (fracción de mes = mes completo, regla pendiente). */
  const diasX12PorMeses = (diasPorAño: number, desde: string, hasta: string): number => {
    const { completos, diasResto } = mesesDeServicio(desde, hasta)
    if (diasResto > 0) pend.add('regla:finiquito_fraccion_mes')
    return diasPorAño * (completos + (diasResto > 0 ? 1 : 0))
  }
  const improcedente = (): { diasX12: number; importe: Centimos; tope: boolean } => {
    if (dia(e.fechaAntiguedad) < dia(FECHA_REFORMA_2012)) {
      // DT 11.ª ET: 45 días/año hasta el 11/02/2012 + 33 días/año desde el 12/02/2012.
      const finPre = fecha(dia(FECHA_REFORMA_2012) - 1)
      const pre = diasX12PorMeses(45, e.fechaAntiguedad, dia(e.fechaBaja) < dia(finPre) ? e.fechaBaja : finPre)
      const post = dia(e.fechaBaja) >= dia(FECHA_REFORMA_2012) ? diasX12PorMeses(33, FECHA_REFORMA_2012, e.fechaBaja) : 0
      const bruto = porDiasX12(pre + post)
      const tope = pre > 720 * 12 ? Math.min(porDiasX12(pre), Math.round((42 * anual) / 12)) : porDiasX12(720 * 12)
      return { diasX12: pre + post, importe: Math.min(bruto, tope), tope: bruto > tope }
    }
    const d = diasX12PorMeses(33, e.fechaAntiguedad, e.fechaBaja)
    const bruto = porDiasX12(d)
    const tope = 2 * anual // 24 mensualidades
    return { diasX12: d, importe: Math.min(bruto, tope), tope: bruto > tope }
  }

  let diasX12 = 0
  let obligatoria = 0
  let topeAplicado = false
  let limiteExento = 0 // cuantía obligatoria que puede quedar exenta (antes del límite de 180.000 €)
  const c = e.causa
  switch (c.tipo) {
    case 'dimision':
      break
    case 'fin_contrato_temporal': {
      if (c.modalidad === 'ordinaria') {
        // Art. 49.1.c): parte proporcional de 12 días por año → 12 × días de servicio / 365.
        const dServ = diasInclusive(e.fechaAntiguedad, e.fechaBaja)
        diasX12 = (12 * dServ * 12) / 365
        obligatoria = Math.round((12 * dServ * anual) / (365 * 365))
        limiteExento = obligatoria
        pend.add('regla:finiquito_exencion_fin_contrato')
      }
      break
    }
    case 'objetivo': {
      diasX12 = diasX12PorMeses(20, e.fechaAntiguedad, e.fechaBaja)
      const bruto = porDiasX12(diasX12)
      obligatoria = Math.min(bruto, anual) // 12 mensualidades
      topeAplicado = bruto > anual
      limiteExento = c.causa52c ? improcedente().importe : obligatoria
      break
    }
    case 'improcedente': {
      const r = improcedente()
      diasX12 = r.diasX12
      obligatoria = r.importe
      topeAplicado = r.tope
      if (c.via === 'reconocimiento_empresa') avisos.push('improcedencia_sin_conciliacion_no_exenta')
      else limiteExento = obligatoria
      break
    }
  }
  const pagada = e.indemnizacionPagada ?? obligatoria
  if (pagada > obligatoria) avisos.push('indemnizacion_superior_a_la_obligatoria')
  let exenta = Math.min(pagada, limiteExento)
  if (exenta > LIMITE_EXENCION_INDEMNIZACION) { exenta = LIMITE_EXENCION_INDEMNIZACION; avisos.push('limite_exencion_180000') }

  const totalSalarial = importeVac + pagas.reduce((s, p) => s + p.importe, 0)
  const cifrasPendientes = [...pend].sort()
  if (modo === 'calculo' && cifrasPendientes.length) throw new CifraPendienteError(cifrasPendientes)
  return {
    vacaciones: { diasDevengados: r2((v.diasAnuales * diasTrab) / diasAño), diasPendientes: r2(numPend / diasAño), importe: importeVac },
    pagasExtra: pagas,
    indemnizacion: { dias: r2(diasX12 / 12), obligatoria, pagada, exenta, sujeta: pagada - exenta, topeAplicado },
    totalSalarial,
    total: totalSalarial + pagada,
    cifrasPendientes,
    avisos,
  }
}
