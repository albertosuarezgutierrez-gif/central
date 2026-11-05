// F5 — BORRADORES del modelo 200 (Impuesto sobre Sociedades) y 202 (pagos fraccionados). PURO, céntimos enteros, sin BD ni red.
//
// ⚠️ SOLO BORRADOR REVISABLE, sin validez ante la AEAT: NO genera fichero oficial (el diseño de registro no se ha podido contrastar y nunca se
// inventan posiciones). Las «casillas» llevan identificadores PROPIOS (RC, BI, CI…), no los números oficiales, y TODAS están marcadas
// «pendiente de contrastar». Regla del repo «dato que NO hay ≠ 0»: si falta un dato necesario, la casilla y el `resultado` son `null` y la lista
// `faltan` dice cuál; nunca se rellena con 0 por defecto.
import { ErrorContable, formatearCentimos, validarCentimos, type Centimos } from '../partida/dinero.ts'
import { DISENO_OFICIAL_PENDIENTE } from '../impuestos/comun.ts'
import { escaparHtml, neutralizarFormulaCsv } from '../impuestos/borrador.ts'
import { AVISO_PRESENTACION } from '../impuestos/declaraciones.ts'

export const PENDIENTE_DE_CONTRASTAR = 'pendiente de contrastar'

/** Tipo general de gravamen del IS (25 %) en puntos básicos. DATO editable: la empresa puede tener otro (nueva creación, reducida dimensión…). */
export const TIPO_GENERAL_IS_PB = 2500
/** Porcentaje del pago fraccionado (modalidad art. 40.2 LIS) sobre la cuota. DATO editable, recordado, a contrastar. */
export const PORCENTAJE_202_ART40_2_PB = 1800
/** Porcentaje (modalidad art. 40.3 LIS) sobre la base de los primeros 3/9/11 meses: 5/7 del tipo general redondeado = 18 %. A contrastar; ≥ 10 M€ de cifra de negocios aplica otro. */
export const PORCENTAJE_202_ART40_3_PB = 1800

export type CasillaIs = {
  /** Identificador PROPIO (no es el número oficial de casilla). */
  codigo: string
  descripcion: string
  /** Céntimos, o `null` = no calculable porque falta un dato. */
  importe: Centimos | null
  /** Siempre `media`: ninguna casilla está contrastada con el formulario oficial. */
  certeza: 'media'
  origen: string[]
}

export type CalculoIs = {
  modelo: '200' | '202'
  anio: number
  periodo: '0A' | '1P' | '2P' | '3P'
  casillas: CasillaIs[]
  /** Resultado de la autoliquidación (céntimos; + a ingresar, − a devolver/compensar). `null` si falta algún dato. */
  resultado: Centimos | null
  /** Datos que faltan para poder calcular (vacío = calculado). */
  faltan: string[]
  avisos: string[]
  ficheroOficial: typeof DISENO_OFICIAL_PENDIENTE
}

const cas = (codigo: string, descripcion: string, importe: Centimos | null, origen: string[] = []): CasillaIs => ({
  codigo, descripcion: `${descripcion} (${PENDIENTE_DE_CONTRASTAR})`, importe, certeza: 'media', origen,
})

const enteroOpcional = (v: unknown, etiqueta: string): Centimos | null => (v === null || v === undefined ? null : validarCentimos(v, etiqueta))

/** round(importe × pb / 10000), mitades hacia fuera, sin pasar por floats (BigInt). */
export function porPuntosBasicos(importe: Centimos, pb: number): Centimos {
  validarCentimos(importe)
  if (!Number.isInteger(pb) || pb < 0 || pb > 10000) throw new ErrorContable('porcentaje_invalido', 'porcentaje inválido (0–10000 puntos básicos)')
  const n = BigInt(Math.abs(importe)) * BigInt(pb)
  const r = Number((BigInt(2) * n + BigInt(10000)) / BigInt(20000))
  return importe < 0 ? -r : r
}

// ── Modelo 200 ───────────────────────────────────────────────────────────────────────────────────────────────
export type EntradaModelo200 = {
  anio: number
  /** Resultado contable ANTES de impuestos (casilla C de la cuenta de PyG). Viene de los saldos: siempre se conoce. */
  resultadoAntesImpuestos: Centimos
  /** Ajustes extracontables al resultado contable (diferencias permanentes/temporarias). `null` = NO informado. */
  ajustesPositivos: Centimos | null
  ajustesNegativos: Centimos | null
  /** Compensación de bases imponibles negativas de ejercicios anteriores. `null` = no informada; `0` = informado que no hay. */
  compensacionBasesNegativas: Centimos | null
  /** Tipo de gravamen en puntos básicos. `null` = no informado. */
  tipoGravamenPb: number | null
  /** Deducciones y bonificaciones. `null` = no informadas. */
  deducciones: Centimos | null
  /** Retenciones e ingresos a cuenta soportados en el ejercicio. `null` = no informados. */
  retenciones: Centimos | null
  /** Pagos fraccionados (202) ya ingresados en el ejercicio. `null` = no informados. */
  pagosFraccionados: Centimos | null
}

export function borrador200(e: EntradaModelo200): CalculoIs {
  validarCentimos(e.resultadoAntesImpuestos, 'resultado antes de impuestos')
  const ajP = enteroOpcional(e.ajustesPositivos, 'ajustes positivos')
  const ajN = enteroOpcional(e.ajustesNegativos, 'ajustes negativos')
  const comp = enteroOpcional(e.compensacionBasesNegativas, 'compensación de bases negativas')
  const ded = enteroOpcional(e.deducciones, 'deducciones')
  const ret = enteroOpcional(e.retenciones, 'retenciones')
  const pf = enteroOpcional(e.pagosFraccionados, 'pagos fraccionados')
  for (const [v, n] of [[ajP, 'ajustes positivos'], [ajN, 'ajustes negativos'], [comp, 'compensación'], [ded, 'deducciones'], [ret, 'retenciones'], [pf, 'pagos fraccionados']] as const) {
    if (v !== null && v < 0) throw new ErrorContable('importe_negativo', `${n} no puede ser negativo`)
  }
  const faltan: string[] = []
  const avisos: string[] = [`Borrador sin validez ante la AEAT. ${AVISO_PRESENTACION}`, `Casillas: identificadores propios, todas ${PENDIENTE_DE_CONTRASTAR} con el formulario oficial.`]
  const necesita = (v: unknown, que: string) => { if (v === null) faltan.push(que) }
  necesita(ajP, 'Ajustes positivos al resultado contable')
  necesita(ajN, 'Ajustes negativos al resultado contable')
  necesita(comp, 'Compensación de bases imponibles negativas (pon 0 si no hay)')
  necesita(e.tipoGravamenPb, 'Tipo de gravamen')
  necesita(ded, 'Deducciones y bonificaciones (pon 0 si no hay)')
  necesita(ret, 'Retenciones e ingresos a cuenta (pon 0 si no hay)')
  necesita(pf, 'Pagos fraccionados ingresados (pon 0 si no hay)')

  const previa = ajP === null || ajN === null ? null : e.resultadoAntesImpuestos + ajP - ajN
  let bi: Centimos | null = null
  if (previa !== null && comp !== null) {
    if (comp > Math.max(previa, 0)) { faltan.push('La compensación de bases negativas supera la base imponible previa: revisa el importe'); bi = null }
    else bi = previa - comp
  }
  if (bi !== null && comp !== null && comp > 0) avisos.push('El límite legal de compensación (según cifra de negocios) NO se ha comprobado.')
  let integra: Centimos | null = null
  if (bi !== null && e.tipoGravamenPb !== null) {
    if (!Number.isInteger(e.tipoGravamenPb) || e.tipoGravamenPb < 0 || e.tipoGravamenPb > 10000) throw new ErrorContable('tipo_invalido', 'tipo de gravamen inválido')
    integra = bi > 0 ? porPuntosBasicos(bi, e.tipoGravamenPb) : 0
  }
  const liquida = integra === null || ded === null ? null : Math.max(0, integra - ded)
  if (integra !== null && ded !== null && ded > integra) avisos.push('Las deducciones superan la cuota íntegra: el exceso podría trasladarse a ejercicios futuros (no se calcula).')
  const resultado = liquida === null || ret === null || pf === null ? null : liquida - ret - pf
  if (bi !== null && bi < 0) avisos.push(`Base imponible negativa (${formatearCentimos(bi)}): cuota 0 y base pendiente de compensar en ejercicios futuros (no se registra aquí).`)
  const origenContable = ['Cuenta de PyG: resultado antes de impuestos']
  return {
    modelo: '200', anio: e.anio, periodo: '0A', ficheroOficial: DISENO_OFICIAL_PENDIENTE, faltan, avisos, resultado,
    casillas: [
      cas('RC', 'Resultado contable antes de impuestos', e.resultadoAntesImpuestos, origenContable),
      cas('AJ+', 'Ajustes positivos al resultado contable', ajP),
      cas('AJ-', 'Ajustes negativos al resultado contable', ajN),
      cas('BIP', 'Base imponible previa', previa),
      cas('COMP', 'Compensación de bases imponibles negativas', comp),
      cas('BI', 'Base imponible', bi),
      cas('TIPO', `Tipo de gravamen (puntos básicos)`, e.tipoGravamenPb),
      cas('CI', 'Cuota íntegra', integra),
      cas('DED', 'Deducciones y bonificaciones', ded),
      cas('CL', 'Cuota líquida', liquida),
      cas('RET', 'Retenciones e ingresos a cuenta', ret),
      cas('PF', 'Pagos fraccionados ingresados', pf),
      cas('RES', 'Resultado de la autoliquidación (+ a ingresar, − a devolver)', resultado),
    ],
  }
}

// ── Modelo 202 ───────────────────────────────────────────────────────────────────────────────────────────────
export type Periodo202 = '1P' | '2P' | '3P'
export const PERIODOS_202: readonly Periodo202[] = ['1P', '2P', '3P']
export type Modalidad202 = 'art40_2' | 'art40_3'

/** Ejercicio cuya cuota sirve de base en la modalidad art. 40.2: el último con plazo de declaración YA vencido el primer día del periodo (ejercicio natural). */
export function ejercicioBase202(anio: number, periodo: Periodo202): number {
  return periodo === '1P' ? anio - 2 : anio - 1
}

export type EntradaModelo202 = {
  anio: number
  periodo: Periodo202
  /** `null` = no elegida. */
  modalidad: Modalidad202 | null
  // art. 40.2 — del ejercicio indicado por `ejercicioBase202`
  cuotaIntegraBase: Centimos | null
  deduccionesBase: Centimos | null
  retencionesBase: Centimos | null
  // art. 40.3
  baseImponibleMeses: Centimos | null
  retencionesPeriodo: Centimos | null
  // comunes
  /** Pagos fraccionados ya ingresados en el MISMO año. Para 1P se toma 0 (no hay anteriores); en 2P/3P, `null` = no informados. */
  pagosAnteriores: Centimos | null
  /** Sustituye al porcentaje por defecto (puntos básicos). */
  porcentajePb?: number
}

export function borrador202(e: EntradaModelo202): CalculoIs {
  const faltan: string[] = []
  const avisos: string[] = [`Borrador sin validez ante la AEAT. ${AVISO_PRESENTACION}`, `Casillas: identificadores propios, todas ${PENDIENTE_DE_CONTRASTAR} con el formulario oficial.`,
    `Plazo: del 1 al 20 de ${e.periodo === '1P' ? 'abril' : e.periodo === '2P' ? 'octubre' : 'diciembre'} de ${e.anio} (ejercicio natural; sin trasladar festivos: ${PENDIENTE_DE_CONTRASTAR}).`]
  const pagos = e.periodo === '1P' ? 0 : enteroOpcional(e.pagosAnteriores, 'pagos anteriores')
  if (e.modalidad === null) faltan.push('Modalidad de pago fraccionado (art. 40.2 o art. 40.3 LIS)')
  if (pagos === null) faltan.push('Pagos fraccionados ya ingresados este año')
  const pb = e.porcentajePb ?? (e.modalidad === 'art40_3' ? PORCENTAJE_202_ART40_3_PB : PORCENTAJE_202_ART40_2_PB)
  let base: Centimos | null = null
  const casillas: CasillaIs[] = []
  if (e.modalidad === 'art40_2') {
    const ci = enteroOpcional(e.cuotaIntegraBase, 'cuota íntegra base')
    const d = enteroOpcional(e.deduccionesBase, 'deducciones base')
    const r = enteroOpcional(e.retencionesBase, 'retenciones base')
    const ej = ejercicioBase202(e.anio, e.periodo)
    if (ci === null) faltan.push(`Cuota íntegra del ejercicio ${ej} (último con plazo de declaración vencido)`)
    if (d === null) faltan.push(`Deducciones y bonificaciones del ejercicio ${ej} (pon 0 si no hay)`)
    if (r === null) faltan.push(`Retenciones e ingresos a cuenta del ejercicio ${ej} (pon 0 si no hay)`)
    base = ci === null || d === null || r === null ? null : Math.max(0, ci - d - r)
    casillas.push(cas('CIB', `Cuota íntegra del ejercicio ${ej}`, ci), cas('DEDB', `Deducciones y bonificaciones del ejercicio ${ej}`, d), cas('RETB', `Retenciones e ingresos a cuenta del ejercicio ${ej}`, r), cas('BASE', 'Base del pago fraccionado (cuota − deducciones − retenciones)', base))
  } else if (e.modalidad === 'art40_3') {
    const bm = enteroOpcional(e.baseImponibleMeses, 'base imponible de los meses')
    const rp = enteroOpcional(e.retencionesPeriodo, 'retenciones del periodo')
    if (bm === null) faltan.push(`Base imponible de los primeros ${e.periodo === '1P' ? 3 : e.periodo === '2P' ? 9 : 11} meses del ejercicio ${e.anio}`)
    if (rp === null) faltan.push('Retenciones e ingresos a cuenta del periodo (pon 0 si no hay)')
    base = bm === null || rp === null ? null : Math.max(0, bm)
    casillas.push(cas('BIM', 'Base imponible de los meses transcurridos', bm), cas('RETP', 'Retenciones e ingresos a cuenta del periodo', rp), cas('BASE', 'Base del pago fraccionado', base))
    avisos.push('Cifra de negocios ≥ 10 M€: el porcentaje aplicable es otro (24 % recordado): no se aplica, indícalo en el porcentaje.')
  } else {
    casillas.push(cas('BASE', 'Base del pago fraccionado', null))
  }
  let bruto: Centimos | null = null
  if (base !== null && pagos !== null) {
    const pct = porPuntosBasicos(base, pb)
    const retenciones = e.modalidad === 'art40_3' ? (enteroOpcional(e.retencionesPeriodo, 'retenciones del periodo') ?? 0) : 0
    bruto = pct - pagos - retenciones
  }
  // Un pago fraccionado no puede ser negativo (no se devuelve): el mínimo es 0.
  const resultado = bruto === null ? null : Math.max(0, bruto)
  if (bruto !== null && bruto < 0) avisos.push('El resultado sale negativo: el pago fraccionado es 0 (no se devuelve).')
  casillas.push(cas('PCT', 'Porcentaje aplicado (puntos básicos)', e.modalidad === null ? null : pb), cas('PAG', 'Pagos fraccionados anteriores del año', pagos), cas('RES', 'Pago fraccionado a ingresar', resultado))
  return { modelo: '202', anio: e.anio, periodo: e.periodo, ficheroOficial: DISENO_OFICIAL_PENDIENTE, faltan, avisos, resultado, casillas }
}

/** Plazo orientativo del modelo 200 de un ejercicio natural: 25 días naturales siguientes a los 6 meses posteriores al cierre (25/07). Sin trasladar festivos. */
export const plazoModelo200 = (anio: number): { hasta: string; nota: string } => ({ hasta: `${anio + 1}-07-25`, nota: `orientativo, ejercicio natural y sin trasladar festivos (${PENDIENTE_DE_CONTRASTAR})` })

// ── Salidas (borrador HTML imprimible y CSV) ─────────────────────────────────────────────────────────────────
const valor = (c: CasillaIs) => (c.importe === null ? 'pendiente: falta un dato' : c.codigo === 'TIPO' || c.codigo === 'PCT' ? `${c.importe / 100} %` : formatearCentimos(c.importe))

export function borradorIsHtml(c: CalculoIs, o: { empresa: string; nif?: string; generado: string }): string {
  const filas = c.casillas.map((x) => `<tr><td>${escaparHtml(x.codigo)} <span class="media" title="Pendiente de contrastar">*</span></td><td>${escaparHtml(x.descripcion)}</td><td class="num${x.importe === null ? ' falta' : ''}">${escaparHtml(valor(x))}</td></tr>`).join('')
  const lista = (t: string, xs: readonly string[], clase: string) => (xs.length ? `<div class="${clase}"><strong>${escaparHtml(t)}</strong><ul>${xs.map((x) => `<li>${escaparHtml(x)}</li>`).join('')}</ul></div>` : '')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Borrador modelo ${c.modelo} ${c.periodo} ${c.anio}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:16px auto;max-width:900px;padding:0 16px;color:#111}h1{font-size:1.3rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}.num{text-align:right;white-space:nowrap}.falta{color:#a60;font-style:italic}.banda{background:#fff4d6;border:1px solid #e0b84a;padding:10px 12px;margin:12px 0}.aviso{background:#f3f3f3;padding:8px 12px;margin:10px 0}.error{background:#fde8e8;border:1px solid #d99;padding:8px 12px;margin:10px 0}.media{color:#a60}.scroll{overflow-x:auto}</style></head><body>
<h1>BORRADOR — Modelo ${c.modelo} · ${c.periodo === '0A' ? 'Anual' : c.periodo} ${c.anio}</h1>
<p>${escaparHtml(o.empresa)}${o.nif ? ` · NIF ${escaparHtml(o.nif)}` : ''} · generado el ${escaparHtml(o.generado)}</p>
<div class="banda"><strong>Borrador sin validez ante la AEAT.</strong> Fichero oficial: ${escaparHtml(c.ficheroOficial)}. Todas las casillas (*) están pendientes de contrastar con el formulario vigente.</div>
${lista('Datos que faltan (el resultado no se calcula hasta tenerlos)', c.faltan, 'error')}${lista('Avisos', c.avisos, 'aviso')}
<div class="scroll"><table><thead><tr><th>Casilla</th><th>Concepto</th><th>Importe</th></tr></thead><tbody>${filas}</tbody></table></div>
<p><strong>Resultado:</strong> ${c.resultado === null ? 'no calculable (faltan datos)' : escaparHtml(formatearCentimos(c.resultado))}</p>
</body></html>`
}

/** CSV (; y coma decimal). Una casilla sin dato sale con la celda VACÍA y certeza «pendiente de contrastar», nunca 0. */
export function borradorIsCsv(c: CalculoIs): string {
  const esc = (t: string) => (/[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)
  const num = (x: CasillaIs) => (x.importe === null ? '' : x.codigo === 'TIPO' || x.codigo === 'PCT' ? String(x.importe) : `${x.importe < 0 ? '-' : ''}${Math.floor(Math.abs(x.importe) / 100)},${String(Math.abs(x.importe) % 100).padStart(2, '0')}`)
  const cab = ['Modelo', 'Periodo', 'Ejercicio', 'Casilla', 'Concepto', 'Importe', 'Certeza'].join(';')
  const filas = c.casillas.map((x) => [c.modelo, c.periodo, String(c.anio), x.codigo, esc(neutralizarFormulaCsv(x.descripcion)), num(x), PENDIENTE_DE_CONTRASTAR].join(';'))
  return ['﻿' + cab, ...filas, ...c.faltan.map((f) => esc(`# FALTA: ${f}`)), esc(`# BORRADOR sin validez ante la AEAT — ${c.ficheroOficial}`)].join('\r\n') + '\r\n'
}
