/**
 * Simulador de COSTE DE CONTRATACIÓN (captación, web pública). Puro, en CÉNTIMOS, sin BD/red/reloj.
 * Reutiliza el motor: 12 nóminas `calcularNominaCentimos` en modo «simulacion» (bases, topes, pagas extra, cuota
 * patronal) + `calcularTipoIrpf` (algoritmo AEAT, RIRPF arts. 82-86) sobre la retribución anual.
 *
 * Seguro de salud como RETRIBUCIÓN FLEXIBLE (el trabajador cambia salario en dinero por la prima, mismo bruto total):
 *   - IRPF: exenta la prima hasta 500 €/año por persona (trabajador, cónyuge, descendientes), 1.500 € con discapacidad;
 *     el exceso es retribución en especie. LIRPF art. 42.3.c) (BOE-A-2006-20764, consolidado 07/10/2026, leído en boe.es).
 *   - Seguridad Social: NO exenta. LGSS art. 147.1 (base = remuneración «en metálico como en especie») y 147.2
 *     («Únicamente no se computarán…»: la lista no incluye primas de seguro de enfermedad). BOE-A-2015-11724,
 *     consolidado 21/10/2026, leído en boe.es. → la prima entra en la base de cotización, prorrateada en 12 meses.
 *   - Límite ET art. 26.1 (BOE-A-2015-11430): la especie ≤ 30 % de las percepciones salariales y no puede rebajar el
 *     SMI en dinero → aviso, no corrige.
 * Supuestos (avisos): prima repartida a partes iguales entre los asegurados; ingreso a cuenta de la especie
 * repercutido al trabajador al mismo tipo de retención.
 *
 * Fail-closed: lo PENDIENTE_VERIFICAR del motor/IRPF y las reglas de aquí → `cifrasPendientes` + `aproximado: true`.
 */
import { cifra } from './cifras'
import { aplicarTipo, fraccionAPpm, type Centimos, type Ppm } from './dinero'
import { atEpPorCnae } from './at-ep'
import { calcularTipoIrpf, type DetalleIrpf } from './irpf'
import { calcularNominaCentimos, type NominaCentimos } from './motor'
import { validarSituacionFamiliar, type SituacionFamiliar } from './situacion-familiar'
import { TablaNoDisponibleError } from './cifras'
import { añosConTabla, añosConTablaIrpf, tablaDelAño, type TablaAnual, type TablaIrpf } from './tablas'
import type { GrupoCotizacion } from './tipos'

/**
 * Año de las tablas para una fecha de cálculo («AAAA-MM-DD», la inyecta quien llama: el simulador no lee el reloj): el
 * MÁS RECIENTE ≤ año de la fecha que tenga tablas de cotización Y de IRPF. Si las del año en curso aún no están
 * cargadas, se usan las del anterior y la salida lo avisa (`tablasDeAñoAnterior`). Sin ninguna ≤ ese año → error.
 */
export function añoTablasSimulador(fechaCalculo: string): number {
  const año = añoDeFecha(fechaCalculo)
  const irpf = new Set(añosConTablaIrpf())
  const candidatos = añosConTabla().filter(a => a <= año && irpf.has(a))
  if (!candidatos.length) throw new TablaNoDisponibleError(año)
  return Math.max(...candidatos)
}

function añoDeFecha(f: string): number {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`fechaCalculo inválida (AAAA-MM-DD): ${f}`)
  return Number(f.slice(0, 4))
}

export const EXENCION_SEGURO_SALUD = {
  porPersona: cifra('lirpf_42_3_c_por_persona', 50_000, 'seguro', 'LIRPF art. 42.3.c) 2.º (BOE-A-2006-20764)'),
  porPersonaDiscapacidad: cifra('lirpf_42_3_c_discapacidad', 150_000, 'seguro', 'LIRPF art. 42.3.c) 2.º (BOE-A-2006-20764)'),
} as const

/** El que usa el motor con `atEp: null` (motor.ts, regla `at_ep_empresa`): 1,50 % provisional. */
const AT_EP_PROVISIONAL_MOTOR: Ppm = 15_000

/** Límite del salario en especie sobre las percepciones salariales (ET art. 26.1): 30 %. */
export const LIMITE_ESPECIE_ET_PCT = 30
const LIMITE_ESPECIE_ET_PPM: Ppm = 300_000

/** Reglas propias del simulador que hacen la cifra APROXIMADA (se listan como `regla:<clave>`). */
export const REGLAS_SIMULADOR_PENDIENTES = {
  at_ep_tabla_cnae: 'AT/EP tomado de la tabla interna por CNAE (at-ep.ts), no contrastada con la tarifa de primas (DA 4.ª Ley 42/2006)',
  duracion_temporal_desconocida: 'Contrato temporal sin saber si dura menos de un año: no se aplica el tipo mínimo de retención del 2 % (art. 86.2 RIRPF)',
  tablas_de_año_anterior: 'Las tablas de cotización/IRPF del año de la fecha de cálculo no están cargadas: se han usado las del último año disponible',
} as const

export interface EntradaSimulador {
  /** Bruto anual REAL (ya a la jornada indicada), céntimos. Con flexible, incluye la prima (mismo paquete). */
  brutoAnual: Centimos
  pagas: 12 | 14
  /** Solo con 14 pagas. Por defecto false. */
  prorrataExtras?: boolean
  grupo: GrupoCotizacion
  contrato: 'indefinido' | 'temporal'
  /** 100 = completa. */
  jornadaPct: number
  /** Temporal de duración inferior al año (tipo mínimo 2 %). Ausente con temporal = «no se sabe» → aproximado. */
  duracionInferiorAño?: boolean
  /** Modelo 145. Ausente o null → art. 88.2 RIRPF (sin circunstancias personales ni familiares). */
  situacion?: SituacionFamiliar | null
  /** Tipo AT/EP: explícito (ppm) gana; si no, CNAE de la tabla interna (aproximado); si no, 1,50 % provisional del motor. */
  atEpPpm?: Ppm
  cnae?: string
  retribucionFlexible?: {
    seguroSaludAnual: Centimos
    /** Personas cubiertas (trabajador, cónyuge, descendientes). ≥ 1. */
    beneficiarios: number
    /** Cuántas de ellas tienen discapacidad (límite 1.500 €). */
    discapacidad?: number
  }
  /** Fecha del cálculo («AAAA-MM-DD», hoy en Madrid en la web). Elige el año de las tablas (`añoTablasSimulador`). */
  fechaCalculo?: string
  /** Año de tablas EXPLÍCITO (gana a `fechaCalculo`). Hace falta uno de los dos. */
  año?: number
  /** Para tests. */
  tabla?: TablaAnual
  tablaIrpf?: TablaIrpf
}

export interface CuotaPatronalAnual {
  contingenciasComunes: Centimos
  desempleo: Centimos
  fogasa: Centimos
  fp: Centimos
  mei: Centimos
  atEp: Centimos
  solidaridad: Centimos
  total: Centimos
}

export interface EscenarioCoste {
  /** Bruto en dinero (devengado del año según el motor). */
  brutoDinerario: Centimos
  /** Prima del seguro pagada por la empresa (0 sin flexible). */
  especie: Centimos
  especieExenta: Centimos
  especieSujeta: Centimos
  cuotaPatronal: CuotaPatronalAnual
  costeEmpresaAnual: Centimos
  costeEmpresaMensual: Centimos
  cotizacionTrabajadorAnual: Centimos
  /** Retribución sujeta a IRPF (dinero + especie no exenta). */
  baseIrpfAnual: Centimos
  irpfTipoPpm: Ppm
  irpfPct: number
  irpfAnual: Centimos
  /** Dinero que cobra en el año (sin el seguro). */
  netoAnual: Centimos
  /** Por paga ordinaria (12 ó 14 pagas cobradas). */
  netoMensual: Centimos
  pagasCobradas: 12 | 14
}

export interface ResultadoSimulador {
  /** Año de las tablas usadas. */
  año: number
  /** Año de la fecha de cálculo (null si solo se dio `año`). */
  añoCalculo: number | null
  /** true = las tablas son de un año ANTERIOR al de la fecha de cálculo (aviso visible y cifra aproximada). */
  tablasDeAñoAnterior: boolean
  atEpPpm: Ppm
  atEpOrigen: 'explicito' | 'cnae' | 'provisional'
  /** Sin flexible (siempre). */
  base: EscenarioCoste
  /** Con el seguro de salud como retribución flexible (si se pidió). */
  flexible: EscenarioCoste | null
  /** netoCon + seguro − netoSin: lo que gana el trabajador frente a pagarse él el mismo seguro con su neto. */
  ahorroAnualTrabajador: Centimos | null
  cifrasPendientes: string[]
  avisos: string[]
  aproximado: boolean
}

const entero = (n: unknown, min: number): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min

/** Reparte `total` en `n` partes enteras que suman exactamente `total` (el resto, en las últimas). */
function repartir(total: Centimos, n: number): Centimos[] {
  const q = Math.floor(total / n)
  const r = total - q * n
  return Array.from({ length: n }, (_, i) => q + (i >= n - r ? 1 : 0))
}

/** Exención art. 42.3.c) con la prima repartida a partes iguales entre los asegurados. */
export function exencionSeguroSalud(prima: Centimos, beneficiarios: number, discapacidad = 0): Centimos {
  if (!entero(prima, 0)) throw new Error('seguroSaludAnual debe ser céntimos enteros ≥ 0')
  if (!entero(beneficiarios, 1)) throw new Error('beneficiarios debe ser un entero ≥ 1')
  if (!entero(discapacidad, 0) || discapacidad > beneficiarios) throw new Error('discapacidad debe ser un entero entre 0 y beneficiarios')
  const lim = EXENCION_SEGURO_SALUD.porPersona.valor!
  const limD = EXENCION_SEGURO_SALUD.porPersonaDiscapacidad.valor!
  return repartir(prima, beneficiarios).reduce((s, p, i) => s + Math.min(p, i < discapacidad ? limD : lim), 0)
}

export function simularCosteContratacion(e: EntradaSimulador): ResultadoSimulador {
  if (!entero(e.brutoAnual, 1)) throw new Error('brutoAnual debe ser céntimos enteros > 0')
  if (e.pagas !== 12 && e.pagas !== 14) throw new Error('pagas debe ser 12 ó 14')
  if (!(e.jornadaPct > 0 && e.jornadaPct <= 100)) throw new Error(`Jornada inválida: ${e.jornadaPct}`)
  if (e.situacion) {
    const errs = validarSituacionFamiliar(e.situacion)
    if (errs.length) throw new Error(`Situación familiar inválida: ${errs.join('; ')}`)
  }
  if (e.año === undefined && e.fechaCalculo === undefined) throw new Error('Falta fechaCalculo (o año de tablas)')
  const añoCalculo = e.fechaCalculo !== undefined ? añoDeFecha(e.fechaCalculo) : null
  const año = e.año ?? añoTablasSimulador(e.fechaCalculo!)
  const tabla = e.tabla ?? tablaDelAño(año)
  const pendientes = new Set<string>()
  const avisos = new Set<string>()
  const tablasDeAñoAnterior = añoCalculo !== null && año < añoCalculo
  if (tablasDeAñoAnterior) {
    avisos.add(`tablas_de_año_anterior:${año}`)
    pendientes.add('regla:tablas_de_año_anterior')
  }

  let atEpPpm: Ppm | null = null
  let atEpOrigen: ResultadoSimulador['atEpOrigen'] = 'provisional'
  if (e.atEpPpm !== undefined) {
    if (!entero(e.atEpPpm, 0)) throw new Error('atEpPpm debe ser un entero ≥ 0')
    atEpPpm = e.atEpPpm
    atEpOrigen = 'explicito'
  } else if (e.cnae) {
    const f = atEpPorCnae(e.cnae.trim())
    if (f !== undefined) {
      atEpPpm = fraccionAPpm(f)
      atEpOrigen = 'cnae'
      pendientes.add('regla:at_ep_tabla_cnae')
    } else avisos.add('cnae_sin_tarifa_at_ep')
  }

  let duracionInferiorAño = e.duracionInferiorAño
  if (e.contrato === 'temporal' && duracionInferiorAño === undefined) {
    pendientes.add('regla:duracion_temporal_desconocida')
    duracionInferiorAño = false
  }
  if (e.contrato === 'indefinido') duracionInferiorAño = false

  const prorrata = e.pagas === 14 && (e.prorrataExtras ?? false)
  const pagasCobradas: 12 | 14 = e.pagas === 14 && !prorrata ? 14 : 12

  const escenario = (especie: Centimos, exenta: Centimos): { esc: EscenarioCoste; atEpUsado: Ppm } => {
    const dinero = e.brutoAnual - especie
    if (dinero <= 0) throw new Error('El seguro no puede ser igual o mayor que el bruto anual')
    // Mensualidad efectiva (a la jornada) → salario de jornada completa que espera el motor.
    const mensualEf = Math.round(dinero / e.pagas)
    const salarioBase = Math.round(mensualEf / (e.jornadaPct / 100))
    const especieMes = repartir(especie, 12)
    const meses: NominaCentimos[] = []
    for (let m = 1; m <= 12; m++) {
      const n = calcularNominaCentimos(
        {
          periodo: `${año}-${String(m).padStart(2, '0')}`,
          grupo: e.grupo,
          duracion: e.contrato,
          jornadaPct: e.jornadaPct,
          salarioBase,
          // La prima cotiza (LGSS art. 147): entra en el devengado como especie prorrateada.
          complementosFijos: especie > 0 ? [{ concepto: 'Seguro de salud (especie)', importe: especieMes[m - 1] }] : [],
          pagas: e.pagas,
          prorrataExtras: prorrata,
          irpfPct: 0, // el IRPF se calcula aparte, sobre la retribución SUJETA
          atEp: atEpPpm,
          incidencias: [],
        },
        { modo: 'simulacion', tabla },
      )
      for (const c of n.cifrasPendientes) pendientes.add(c)
      for (const a of n.avisos) avisos.add(a)
      meses.push(n)
    }
    const suma = (f: (n: NominaCentimos) => number) => meses.reduce((s, n) => s + f(n), 0)
    const devengado = suma(n => n.devengos.total)
    const brutoDinerario = devengado - especie
    const cuota: CuotaPatronalAnual = {
      contingenciasComunes: suma(n => n.empresa.contingenciasComunes),
      desempleo: suma(n => n.empresa.desempleo),
      fogasa: suma(n => n.empresa.fogasa),
      fp: suma(n => n.empresa.fp),
      mei: suma(n => n.empresa.mei),
      atEp: suma(n => n.empresa.atEp),
      solidaridad: suma(n => n.empresa.solidaridad),
      total: suma(n => n.empresa.total),
    }
    const cotTrab = suma(n => n.trabajador.total) // irpfPct 0 → solo cotizaciones
    const cotIrpf = suma(n => n.trabajador.contingenciasComunes + n.trabajador.desempleo + n.trabajador.fp + n.trabajador.mei)
    const sujeta = brutoDinerario + (especie - exenta)
    const irpf: DetalleIrpf = calcularTipoIrpf(
      { retribucionAnual: sujeta, cotizacionesAnual: cotIrpf, situacion: e.situacion ?? null, duracionInferiorAño },
      { año, modo: 'simulacion', tabla: e.tablaIrpf },
    )
    for (const c of irpf.cifrasPendientes) pendientes.add(c)
    for (const a of irpf.avisos) avisos.add(`irpf:${a}`)
    const irpfAnual = aplicarTipo(sujeta, irpf.tipoPpm)
    const netoAnual = brutoDinerario - cotTrab - irpfAnual
    const coste = devengado + cuota.total
    return {
      atEpUsado: atEpPpm ?? AT_EP_PROVISIONAL_MOTOR,
      esc: {
        brutoDinerario,
        especie,
        especieExenta: exenta,
        especieSujeta: especie - exenta,
        cuotaPatronal: cuota,
        costeEmpresaAnual: coste,
        costeEmpresaMensual: Math.round(coste / 12),
        cotizacionTrabajadorAnual: cotTrab,
        baseIrpfAnual: sujeta,
        irpfTipoPpm: irpf.tipoPpm,
        irpfPct: irpf.tipoPpm / 10_000,
        irpfAnual,
        netoAnual,
        netoMensual: Math.round(netoAnual / pagasCobradas),
        pagasCobradas,
      },
    }
  }

  const { esc: base, atEpUsado } = escenario(0, 0)

  let flexible: EscenarioCoste | null = null
  let ahorro: Centimos | null = null
  const rf = e.retribucionFlexible
  if (rf) {
    const exenta = exencionSeguroSalud(rf.seguroSaludAnual, rf.beneficiarios, rf.discapacidad ?? 0)
    if (rf.seguroSaludAnual > 0) {
      flexible = escenario(rf.seguroSaludAnual, exenta).esc
      ahorro = flexible.netoAnual + rf.seguroSaludAnual - base.netoAnual
      avisos.add('flexible:prima_repartida_por_igual_entre_asegurados')
      avisos.add('flexible:ingreso_a_cuenta_repercutido')
      avisos.add('flexible:seguro_salud_cotiza_lgss_147')
      if (rf.seguroSaludAnual - exenta > 0) avisos.add('flexible:exceso_tributa_como_especie')
      if (rf.seguroSaludAnual > aplicarTipo(e.brutoAnual, LIMITE_ESPECIE_ET_PPM)) avisos.add('flexible:especie_supera_30pct_et_26_1')
      const smi = tabla.smi.anual.valor
      if (smi !== null && flexible.brutoDinerario < Math.round((smi * e.jornadaPct) / 100)) avisos.add('flexible:dinero_bajo_smi_et_26_1')
    }
  }

  const cifrasPendientes = [...pendientes].sort()
  return {
    año,
    añoCalculo,
    tablasDeAñoAnterior,
    atEpPpm: atEpUsado,
    atEpOrigen,
    base,
    flexible,
    ahorroAnualTrabajador: ahorro,
    cifrasPendientes,
    avisos: [...avisos].sort(),
    aproximado: cifrasPendientes.length > 0,
  }
}
