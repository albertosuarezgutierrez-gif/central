// «Nómina explicable»: convierte el desglose que guarda el motor (`nominas.datos_calculo`) en una explicación en
// español llano por cada línea. PURA (sin BD, sin red). Dato ausente = «no consta», nunca 0.
import { tablaDelAño } from '@central/module-nominas'
import type { NominaDesglose, TablaAnual } from '@central/module-nominas'
import { eur } from '@/app/admin/nominas/formato'

export type GrupoLinea = 'devengos' | 'deducciones' | 'resultado'
export interface LineaExplicada {
  id: string
  grupo: GrupoLinea
  titulo: string
  /** Importe ya formateado («86,94€») o «no consta». */
  importe: string
  explicacion: string
  /** Avisos propios de esta línea (topes, reglas pendientes…). */
  avisos: string[]
}
export interface NominaExplicada {
  lineas: LineaExplicada[]
  /** Avisos generales (borrador, cifras pendientes, tablas sin año…). */
  avisos: string[]
}

const NO_CONSTA = 'no consta'
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const dinero = (x: unknown): string => { const n = num(x); return n === null ? NO_CONSTA : eur(n) }
export const pct = (p: number): string => `${p.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
const ppmAPct = (ppm: number | null | undefined): number | null => (typeof ppm === 'number' ? ppm / 10_000 : null)

const MOTIVOS_IRPF: Record<string, string> = {
  algoritmo: 'calculado con el algoritmo de la AEAT a partir de tu situación familiar (modelo 145)',
  sin_145_sin_circunstancias: 'calculado con el algoritmo de la AEAT SIN circunstancias personales, porque no hay modelo 145 entregado',
  minimo_exento: 'tu retribución anual queda por debajo del mínimo a partir del cual se retiene, así que no se retiene',
  sin_retribucion: 'no hay retribución sobre la que retener',
}

const AVISOS: Record<string, string> = {
  base_minima_aplicada: 'Se ha aplicado la base MÍNIMA de cotización de tu grupo: la nómina no llegaba a ese mínimo.',
  base_maxima_aplicada: 'Se ha aplicado el TOPE máximo de la base de cotización: lo cobrado lo supera.',
  'irpf:sin_modelo_145_sin_circunstancias': 'IRPF sin modelo 145: se retiene como si no tuvieras circunstancias personales ni familiares.',
  'irpf:tipo_minimo_contrato_corto': 'IRPF: contrato de menos de un año, se aplica el tipo mínimo legal.',
  'irpf:minimo_exento': 'IRPF: retribución por debajo del mínimo para retener.',
  'irpf:minimo_exento_desconocido': 'IRPF: el mínimo exento no está contrastado; revisa la retención.',
  'irpf:limite_art_85_3_aplicado': 'IRPF: se ha aplicado el límite del art. 85.3 del Reglamento (la retención no puede dejar menos que el mínimo).',
  'irpf:reduccion_hipoteca_anterior_2013': 'IRPF: reducción por préstamo de vivienda anterior a 2013.',
  'irpf:situacion_1_sin_descendientes_como_3': 'IRPF: situación 1 sin descendientes tratada como situación 3.',
}
const avisoLlano = (a: string): string => AVISOS[a] ?? (a.startsWith('bajo_smi') ? 'El salario anual a jornada completa no llega al SMI: revisa el contrato.' : `Aviso del cálculo: ${a}`)

function tablaSegura(año: number | null): TablaAnual | null {
  if (año === null) return null
  try { return tablaDelAño(año) } catch { return null }
}

function importeCuadra(base: number | null, tipoPct: number | null, importe: number | null): { cuadra: boolean; calculado: number } | null {
  if (base === null || tipoPct === null || importe === null) return null
  const calculado = Math.round(base * tipoPct) / 100
  return { cuadra: Math.abs(calculado - importe) <= 0.02, calculado }
}

/** «Contingencias comunes 4,70 % sobre la base 1.849,70€ = 86,94€» (o lo que se pueda afirmar). */
function formula(nombre: string, base: number | null, tipoPct: number | null, importe: number | null, nombreBase: string): { texto: string; avisos: string[] } {
  if (importe === null) return { texto: `${nombre}: ${NO_CONSTA}.`, avisos: [] }
  if (tipoPct === null || base === null) {
    return { texto: `${nombre}: ${dinero(importe)}. No consta ${tipoPct === null ? 'el tipo aplicado' : nombreBase}, por eso no se puede reconstruir la cuenta.`, avisos: [] }
  }
  const c = importeCuadra(base, tipoPct, importe)
  const avisos: string[] = []
  if (c && !c.cuadra) avisos.push(`No cuadra con la cuenta: ${pct(tipoPct)} sobre ${dinero(base)} serían ${dinero(c.calculado)} y la nómina lleva ${dinero(importe)}. Revisar.`)
  return { texto: `${nombre} ${pct(tipoPct)} sobre ${nombreBase} ${dinero(base)} = ${dinero(importe)}.`, avisos }
}

/** Tipo que casa con el importe guardado entre varios candidatos de la tabla (p. ej. desempleo indefinido/temporal). */
function tipoQueCuadra(base: number | null, importe: number | null, candidatos: (number | null)[]): number | null {
  const validos = candidatos.filter((c): c is number => c !== null)
  if (base === null || importe === null) return validos.length === 1 ? validos[0] : null
  return validos.find(c => importeCuadra(base, c, importe)?.cuadra) ?? null
}

export function explicarNomina(datos: Partial<NominaDesglose> | null | undefined): NominaExplicada {
  const d = datos ?? {}
  const avisosGen: string[] = []
  if (!datos || typeof datos !== 'object' || !d.devengos || !d.deducciones) {
    return { lineas: [], avisos: ['No consta el desglose de esta nómina: no se puede explicar.'] }
  }
  const año = num(d.tablasAño)
  const tabla = tablaSegura(año)
  if (año === null) avisosGen.push('No consta con qué tablas de cotización se calculó (borrador anterior a que se guardara): los tipos no se pueden contrastar.')
  else if (!tabla) avisosGen.push(`No hay tablas de cotización de ${año} cargadas: los tipos no se pueden contrastar.`)
  if (d.modo === 'simulacion') avisosGen.push('Es una SIMULACIÓN (borrador): usa cifras candidatas y no es una nómina confirmable hasta que se contrasten.')
  if (!Array.isArray(d.cifrasPendientes)) avisosGen.push('No consta si había cifras o reglas pendientes de verificar.')
  else if (d.cifrasPendientes.length) avisosGen.push(`Cifras o reglas PENDIENTE_VERIFICAR usadas en este cálculo: ${d.cifrasPendientes.join(', ')}.`)

  const avisosMotor = Array.isArray(d.avisos) ? d.avisos : []
  const tiene = (a: string) => avisosMotor.includes(a)
  const avisosIrpf = avisosMotor.filter(a => a.startsWith('irpf:'))
  for (const a of avisosMotor) if (!a.startsWith('irpf:') && a !== 'base_minima_aplicada' && a !== 'base_maxima_aplicada') avisosGen.push(avisoLlano(a))

  const dev = d.devengos, ded = d.deducciones
  const baseCC = num(d.baseCotizacion)
  const baseCP = num(d.baseContingenciasProfesionales)
  const lineas: LineaExplicada[] = []

  // ── Devengos
  const partesDev: string[] = [`Salario base ${dinero(dev.salarioBase)}`]
  for (const c of dev.complementosFijos ?? []) partesDev.push(`${c.concepto} ${dinero(c.importe)}`)
  if (num(dev.prorrataExtras)) partesDev.push(`prorrata de pagas extra ${dinero(dev.prorrataExtras)}`)
  if (num(dev.pagaExtra)) partesDev.push(`paga extraordinaria ${dinero(dev.pagaExtra)}`)
  if (num(dev.horasExtra)) partesDev.push(`horas extra ${dinero(dev.horasExtra)}`)
  for (const p of dev.pluses ?? []) partesDev.push(`${p.concepto} ${dinero(p.importe)}`)
  if (num(dev.descuentos)) partesDev.push(`menos descuentos ${dinero(dev.descuentos)}`)
  lineas.push({ id: 'devengado', grupo: 'devengos', titulo: 'Total devengado', importe: dinero(dev.total), explicacion: `Suma de: ${partesDev.join(' + ').replace('+ menos', '−')}.`, avisos: [] })

  // ── Seguridad Social del trabajador
  const t = tabla?.tipos
  const avisosBase = [tiene('base_minima_aplicada') ? avisoLlano('base_minima_aplicada') : null, tiene('base_maxima_aplicada') ? avisoLlano('base_maxima_aplicada') : null].filter((x): x is string => !!x)
  const cc = formula('Contingencias comunes', baseCC, ppmAPct(t?.contingenciasComunes.trabajador.valor), num(ded.contingencias_comunes), 'la base de cotización')
  lineas.push({ id: 'cc', grupo: 'deducciones', titulo: 'Seguridad Social: contingencias comunes', importe: dinero(ded.contingencias_comunes), explicacion: cc.texto + ' La base es lo cobrado en el mes (con la parte proporcional de las pagas extra) dentro de los límites mínimo y máximo de tu grupo.', avisos: [...cc.avisos, ...avisosBase] })

  const sinBaseCP = baseCP === null ? ' No consta la base de contingencias profesionales (borrador anterior), por eso no se reconstruye la cuenta.' : ''
  const tipoDes = tipoQueCuadra(baseCP, num(ded.desempleo), [ppmAPct(t?.desempleoIndefinido.trabajador.valor), ppmAPct(t?.desempleoTemporal.trabajador.valor)])
  const des = formula('Desempleo', baseCP, tipoDes, num(ded.desempleo), 'la base de contingencias profesionales')
  lineas.push({ id: 'desempleo', grupo: 'deducciones', titulo: 'Seguridad Social: desempleo', importe: dinero(ded.desempleo), explicacion: des.texto + sinBaseCP, avisos: des.avisos })

  const fp = formula('Formación profesional', baseCP, ppmAPct(t?.fp.trabajador.valor), num(ded.fp), 'la base de contingencias profesionales')
  lineas.push({ id: 'fp', grupo: 'deducciones', titulo: 'Seguridad Social: formación profesional', importe: dinero(ded.fp), explicacion: fp.texto + sinBaseCP, avisos: fp.avisos })

  if (num(ded.mei) !== null) {
    const mei = formula('Mecanismo de Equidad Intergeneracional (MEI)', baseCC, ppmAPct(t?.mei.trabajador.valor), num(ded.mei), 'la base de cotización')
    lineas.push({ id: 'mei', grupo: 'deducciones', titulo: 'Seguridad Social: MEI', importe: dinero(ded.mei), explicacion: mei.texto, avisos: mei.avisos })
  }
  if (num(ded.solidaridad)) {
    lineas.push({ id: 'solidaridad', grupo: 'deducciones', titulo: 'Cotización de solidaridad', importe: dinero(ded.solidaridad), explicacion: `Cotización adicional por la parte de la base que supera el tope máximo (${dinero(ded.solidaridad)}). Se reparte por tramos según la Orden de cotización del año.`, avisos: [] })
  }

  // ── IRPF
  const irpf = num(ded.irpf)
  const alg = d.irpfAlgoritmo
  const totalDev = num(dev.total)
  let expIrpf: string
  const avisosLineaIrpf = avisosIrpf.map(avisoLlano)
  if (irpf === null) expIrpf = `IRPF: ${NO_CONSTA}.`
  else if (alg === undefined) {
    expIrpf = `IRPF ${dinero(irpf)}. No consta cómo se calculó el tipo (nómina anterior a que se guardara el motivo).`
  } else if (alg === null) {
    const tipo = totalDev ? Math.round((irpf / totalDev) * 10_000) / 100 : null
    expIrpf = `Tipo plano del contrato${tipo !== null ? ` ${pct(tipo)}` : ''} sobre el total devengado ${dinero(totalDev)} = ${dinero(irpf)}. No se usó el algoritmo de la AEAT: es el porcentaje fijo que consta en el contrato.`
  } else {
    const f = formula('IRPF', totalDev, num(alg.tipoPct), irpf, 'el total devengado')
    expIrpf = `${f.texto} Tipo ${MOTIVOS_IRPF[alg.motivo] ?? `(motivo: ${alg.motivo})`}.`
    avisosLineaIrpf.push(...f.avisos)
  }
  lineas.push({ id: 'irpf', grupo: 'deducciones', titulo: 'Retención de IRPF', importe: dinero(ded.irpf), explicacion: expIrpf, avisos: avisosLineaIrpf })

  lineas.push({ id: 'deducciones', grupo: 'deducciones', titulo: 'Total deducciones', importe: dinero(ded.total), explicacion: 'Suma de Seguridad Social del trabajador e IRPF.', avisos: [] })
  lineas.push({
    id: 'neto', grupo: 'resultado', titulo: 'Líquido a percibir', importe: dinero(d.netoAPagar),
    explicacion: totalDev !== null && num(ded.total) !== null && num(d.netoAPagar) !== null
      ? `Total devengado ${dinero(totalDev)} − total deducciones ${dinero(ded.total)} = ${dinero(d.netoAPagar)}.` : `Devengado menos deducciones: ${NO_CONSTA}.`,
    avisos: [],
  })
  return { lineas, avisos: avisosGen }
}

/** Texto plano del anexo (para el PDF): una línea por concepto. */
export function explicacionPlana(e: NominaExplicada): string[] {
  const out: string[] = []
  for (const l of e.lineas) {
    out.push(`${l.titulo} (${l.importe}): ${l.explicacion}`)
    for (const a of l.avisos) out.push(`  Atención: ${a}`)
  }
  for (const a of e.avisos) out.push(`Atención: ${a}`)
  return out
}
