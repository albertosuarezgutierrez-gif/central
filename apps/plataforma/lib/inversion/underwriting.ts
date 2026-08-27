// ────────────────────────────────────────────────────────────────────────────
// Motor de underwriting de una compra inmobiliaria para explotación turística.
// PURO: no habla con la red ni con la BD. Lo consume `/api/inversion/underwrite`
// y la pantalla solo pinta lo que sale de aquí — ninguna aritmética en el JSX.
//
// Tres cosas lo separan de una calculadora de yields:
//   1. La PUERTA LEGAL va primero. Sin licencia y número de Registro Único no se
//      calcula nada: un yield sobre una explotación que no se puede publicar no
//      es optimista, es falso.
//   2. Calcula SIEMPRE los dos escenarios —entero y segregado— porque en un
//      mercado de playa el aforo grande es más fino pero paga menos por plaza.
//   3. El veredicto dice NO por defecto, con umbral pre-registrado, y compara
//      contra lo que se puede hacer con ese dinero sin comprar nada.
// ────────────────────────────────────────────────────────────────────────────

import { eur } from '../dinero.ts'
import {
  COMISION_BOOKING,
  MOTOR_VERSION,
  PRIMA_ILIQUIDEZ,
  UMBRAL_COBERTURA,
  UMBRAL_YIELD_NETO,
  type Alternativa,
  type Costes,
  type DesgloseCostes,
  type Escenario,
  type FichaInmueble,
  type Financiacion,
  type MesMercado,
  type PuertaLegal,
  type Supuestos,
  type Underwriting,
  type Veredicto,
} from './tipos.ts'

export { COMISION_BOOKING, UMBRAL_YIELD_NETO, PRIMA_ILIQUIDEZ, UMBRAL_COBERTURA }

/** Días por mes. Sin bisiestos: el efecto es una noche sobre 365. */
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * El dinero tiene dos decimales. Se redondea al SALIR del motor (no en mitad del
 * cálculo) para que lo que se guarda y se pinta sea un importe de verdad y no un
 * 440000.00000000006 de coma flotante. Los ratios no se tocan.
 */
function centimos(n: number): number {
  return Math.round(n * 100) / 100
}

export interface MercadoPorAforo {
  aforo: number
  curva: MesMercado[]
}

export interface EntradaUnderwriting {
  ficha: FichaInmueble
  legal: PuertaLegal
  /** Una curva por cada aforo medido. Un escenario sin su curva NO se calcula a ojo. */
  mercado: MercadoPorAforo[]
  costes: Costes
  /** `null` = compra al contado. */
  financiacion: Financiacion | null
  supuestos: Supuestos
}

// ── Ingresos ────────────────────────────────────────────────────────────────

interface Ingresos {
  bruto: number
  noches: number
  mesesConOcupacionSupuesta: number[]
  mesesSinMedir: number[]
  mesesSinOcupacion: number[]
  cobertura: number
}

/**
 * Recorre los 12 meses y suma solo lo que se puede sostener con datos. Un mes sin
 * ADR medido o sin ocupación NO aporta ingreso estimado: queda anotado y baja la
 * cobertura, de modo que el resultado se presenta como SUELO en vez de como
 * estimación centrada. Los meses que faltan solo pueden sumar.
 */
function calcularIngresos(curva: MesMercado[], ocupacionPorDefecto: number | null, unidades: number): Ingresos {
  let bruto = 0
  let noches = 0
  let mesesCalculados = 0
  const supuesta: number[] = []
  const sinMedir: number[] = []
  const sinOcupacion: number[] = []

  for (let mes = 1; mes <= 12; mes++) {
    const dato = curva.find(m => m.mes === mes)
    if (!dato || dato.adrGuest == null) {
      sinMedir.push(mes)
      continue
    }
    let ocupacion = dato.ocupacionProxy
    if (ocupacion == null) {
      if (ocupacionPorDefecto == null) {
        sinOcupacion.push(mes)
        continue
      }
      ocupacion = ocupacionPorDefecto
      supuesta.push(mes)
    }
    const dias = DIAS_MES[mes - 1]
    bruto += dato.adrGuest * dias * ocupacion * unidades
    noches += dias * ocupacion * unidades
    mesesCalculados++
  }

  return {
    bruto,
    noches,
    mesesConOcupacionSupuesta: supuesta,
    mesesSinMedir: sinMedir,
    mesesSinOcupacion: sinOcupacion,
    cobertura: mesesCalculados / 12,
  }
}

// ── Costes ──────────────────────────────────────────────────────────────────

function calcularCostes(bruto: number, noches: number, c: Costes): DesgloseCostes {
  const comisionCanal = bruto * c.comisionCanal
  const gestion = bruto * c.gestionPct
  const estancias = c.nochesPorEstancia > 0 ? noches / c.nochesPorEstancia : 0
  const limpieza = estancias * c.limpiezaPorEstancia
  const mantenimiento = bruto * c.mantenimientoPct
  const total =
    comisionCanal + gestion + limpieza + mantenimiento + c.ibiAnual + c.seguroAnual + c.suministrosAnual + c.comunidadAnual
  return {
    comisionCanal,
    gestion,
    limpieza,
    ibi: c.ibiAnual,
    seguro: c.seguroAnual,
    suministros: c.suministrosAnual,
    comunidad: c.comunidadAnual,
    mantenimiento,
    total,
  }
}

// ── Deuda ───────────────────────────────────────────────────────────────────

/** Cuota anual de un préstamo francés. Con tipo 0 es el principal repartido. */
export function anualidad(principal: number, tipo: number, anios: number): number {
  if (principal <= 0 || anios <= 0) return 0
  if (tipo === 0) return principal / anios
  return (principal * tipo) / (1 - Math.pow(1 + tipo, -anios))
}

/** Saldo vivo tras `t` años de un préstamo francés. */
export function saldoPendiente(principal: number, tipo: number, anios: number, t: number): number {
  if (principal <= 0 || anios <= 0) return 0
  if (t >= anios) return 0
  if (tipo === 0) return principal * (1 - t / anios)
  const cuota = anualidad(principal, tipo, anios)
  return principal * Math.pow(1 + tipo, t) - (cuota * (Math.pow(1 + tipo, t) - 1)) / tipo
}

// ── TIR ─────────────────────────────────────────────────────────────────────

function van(flujos: number[], tasa: number): number {
  return flujos.reduce((acc, f, t) => acc + f / Math.pow(1 + tasa, t), 0)
}

/** TIR por bisección. `null` si no hay cambio de signo: mejor sin número que con uno inventado. */
export function tir(flujos: number[]): number | null {
  let lo = -0.9
  let hi = 10
  let vLo = van(flujos, lo)
  let vHi = van(flujos, hi)
  if (!Number.isFinite(vLo) || !Number.isFinite(vHi) || vLo * vHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const medio = (lo + hi) / 2
    const v = van(flujos, medio)
    if (v * vLo <= 0) {
      hi = medio
      vHi = v
    } else {
      lo = medio
      vLo = v
    }
  }
  return (lo + hi) / 2
}

// ── Escenarios ──────────────────────────────────────────────────────────────

function construirEscenario(
  nombre: 'entero' | 'segregado',
  curva: MesMercado[],
  unidades: number,
  plazas: number,
  e: EntradaUnderwriting,
  inversionTotal: number,
  capitalAportado: number,
  deuda: number,
): Escenario {
  const ing = calcularIngresos(curva, e.supuestos.ocupacionPorDefecto, unidades)
  const costes = calcularCostes(ing.bruto, ing.noches, e.costes)
  const noi = ing.bruto - costes.total

  const servicioDeuda = e.financiacion ? anualidad(deuda, e.financiacion.tipoInteres, e.financiacion.anios) : 0
  const flujoEstabilizado = noi - servicioDeuda

  // Año 1 con la rampa de reseñas: menos ingreso, mismos costes fijos.
  const brutoAnio1 = ing.bruto * (1 - e.supuestos.rampaAnio1)
  const costesAnio1 = calcularCostes(brutoAnio1, ing.noches * (1 - e.supuestos.rampaAnio1), e.costes)
  const flujoAnio1 = brutoAnio1 - costesAnio1.total - servicioDeuda

  const n = Math.max(1, Math.round(e.supuestos.aniosHorizonte))
  const base = (e.ficha.precio ?? 0) + (e.ficha.reforma ?? 0)
  const valorSalida = base * Math.pow(1 + e.supuestos.revalorizacionAnual, n)
  const deudaAlSalir = e.financiacion ? saldoPendiente(deuda, e.financiacion.tipoInteres, e.financiacion.anios, n) : 0

  const flujos = [-capitalAportado]
  for (let t = 1; t <= n; t++) flujos.push(t === 1 ? flujoAnio1 : flujoEstabilizado)
  flujos[n] += valorSalida - deudaAlSalir

  return {
    nombre,
    plazas,
    unidades,
    nochesVendidas: ing.noches,
    ingresoBrutoAnual: centimos(ing.bruto),
    costes: {
      comisionCanal: centimos(costes.comisionCanal),
      gestion: centimos(costes.gestion),
      limpieza: centimos(costes.limpieza),
      ibi: centimos(costes.ibi),
      seguro: centimos(costes.seguro),
      suministros: centimos(costes.suministros),
      comunidad: centimos(costes.comunidad),
      mantenimiento: centimos(costes.mantenimiento),
      total: centimos(costes.total),
    },
    noi: centimos(noi),
    yieldBruto: inversionTotal > 0 ? ing.bruto / inversionTotal : 0,
    yieldNeto: inversionTotal > 0 ? noi / inversionTotal : 0,
    cashOnCash: e.financiacion && capitalAportado > 0 ? flujoEstabilizado / capitalAportado : null,
    paybackAnios: flujoEstabilizado > 0 ? capitalAportado / flujoEstabilizado : null,
    tir: tir(flujos),
    mesesConOcupacionSupuesta: ing.mesesConOcupacionSupuesta,
    mesesSinMedir: ing.mesesSinMedir,
    mesesSinOcupacion: ing.mesesSinOcupacion,
    cobertura: ing.cobertura,
    esSuelo: ing.cobertura < 1,
  }
}

// ── Puerta legal ────────────────────────────────────────────────────────────

function revisarPuertaLegal(legal: PuertaLegal): { pasa: boolean; faltan: string[]; motivos: string[] } {
  const faltan: string[] = []
  const motivos: string[] = []

  if (legal.licenciaVUT === 'sin_verificar') {
    faltan.push('licencia VUT')
    motivos.push('La licencia turística está SIN VERIFICAR: hasta confirmarla no hay explotación que valorar.')
  } else if (legal.licenciaVUT === 'no_tiene') {
    motivos.push('El inmueble NO tiene licencia turística: hoy la explotación VUT no es posible.')
  }

  if (legal.registroUnico === 'sin_verificar') {
    faltan.push('nº de Registro Único')
    motivos.push('El nº de Registro Único está SIN VERIFICAR: sin él, ni Booking ni Airbnb publican el anuncio.')
  } else if (legal.registroUnico === 'no_tiene') {
    motivos.push('El inmueble NO tiene nº de Registro Único: el anuncio no se puede publicar en ningún portal.')
  }

  // BOE-A-2026-5827 (caso de Conil): el registro se deniega sin acuerdo de la
  // comunidad cuando la licencia es posterior al 3/4/2025. Comprar el edificio
  // entero elimina ese veto — es una ventaja estructural, no un detalle.
  if (legal.edificioCompleto === true) {
    motivos.push('Se compra el edificio completo: no hay comunidad de propietarios que pueda vetar el registro (LPH 3/5).')
  } else if (legal.edificioCompleto === false) {
    motivos.push('Hay comunidad de propietarios: desde la reforma de la LPH, 3/5 de los vecinos pueden vetar el registro.')
  } else {
    motivos.push('No consta si se compra el edificio completo: de ello depende que la comunidad pueda vetar el registro.')
  }

  return {
    pasa: legal.licenciaVUT === 'confirmada' && legal.registroUnico === 'confirmada',
    faltan,
    motivos,
  }
}

// ── Alternativas ────────────────────────────────────────────────────────────

function construirAlternativas(e: EntradaUnderwriting, inversionTotal: number): Alternativa[] {
  const alternativas: Alternativa[] = [
    {
      nombre: 'Bolsa (alternativa líquida)',
      rentabilidad: e.supuestos.alternativaLiquida,
      nota: 'Supuesto declarado, no medido. Se vende en un día: por eso el ladrillo tiene que batirla con prima.',
    },
  ]

  alternativas.push(
    e.financiacion
      ? {
          nombre: 'Amortizar hipoteca',
          rentabilidad: e.financiacion.tipoInteres,
          nota: 'Rentabilidad libre de riesgo e impuestos: cada euro amortizado ahorra exactamente el tipo.',
        }
      : { nombre: 'Amortizar hipoteca', rentabilidad: null, nota: 'No hay financiación declarada que amortizar.' },
  )

  if (e.supuestos.largaDuracionMensual != null && inversionTotal > 0) {
    const brutoLD = e.supuestos.largaDuracionMensual * 12
    const noiLD =
      brutoLD - e.costes.ibiAnual - e.costes.seguroAnual - e.costes.comunidadAnual - brutoLD * e.costes.mantenimientoPct
    alternativas.push({
      nombre: 'Larga duración',
      rentabilidad: noiLD / inversionTotal,
      nota: 'Mismo inmueble sin comisión de canal, sin limpiezas y sin estacionalidad.',
    })
  } else {
    alternativas.push({
      nombre: 'Larga duración',
      rentabilidad: null,
      nota: 'No se ha declarado el alquiler de larga duración: sin ese dato no se puede comparar.',
    })
  }

  alternativas.push({
    nombre: 'Recuperar la comisión de Booking en los pisos actuales',
    rentabilidad: null,
    nota:
      e.supuestos.comisionRecuperableAnual != null
        ? `${eur(e.supuestos.comisionRecuperableAnual)} al año sin invertir un euro. No es un yield sobre esta compra: es dinero que ya se está pagando.`
        : 'Sin cuantificar. Es la alternativa que el veredicto de agosto de 2026 dejó como la más rentable disponible.',
  })

  return alternativas
}

// ── Veredicto ───────────────────────────────────────────────────────────────

function decidir(
  mejor: Escenario | null,
  alternativas: Alternativa[],
  faltan: string[],
  motivos: string[],
): Veredicto {
  const rentabilidades = alternativas.map(a => a.rentabilidad).filter((r): r is number => r != null)
  const listonAnual = rentabilidades.length ? Math.max(...rentabilidades) + PRIMA_ILIQUIDEZ : null

  if (faltan.length || !mejor) {
    return { decision: 'no_calculable', faltan, motivos, alternativas, listonAnual }
  }

  const comparable = mejor.cashOnCash ?? mejor.yieldNeto
  // 🚨 Nombrar la métrica que DE VERDAD se compara. Con hipoteca es el
  // cash-on-cash, no el yield neto: citar el yield al lado del listón producía
  // frases falsas del tipo «yield 8,27% … bate el listón de 9,00%».
  const nombreComparable = mejor.cashOnCash != null ? 'cash-on-cash' : 'yield neto'
  const razones = [...motivos]

  // La ocupación supuesta no es ocupación medida, y el veredicto no puede
  // presentarla como si lo fuera solo porque el ADR sí esté medido.
  if (mejor.mesesConOcupacionSupuesta.length) {
    razones.push(
      `⚠️ La ocupación NO está medida: ${mejor.mesesConOcupacionSupuesta.length} de 12 meses usan la ocupación supuesta. Los ingresos dependen por completo de ese supuesto.`,
    )
  }

  if (mejor.yieldNeto < UMBRAL_YIELD_NETO) {
    razones.push(
      `Yield neto ${(mejor.yieldNeto * 100).toFixed(2)}% por debajo del umbral pre-registrado ${(UMBRAL_YIELD_NETO * 100).toFixed(1)}%.`,
    )
    return { decision: 'no', faltan, motivos: razones, alternativas, listonAnual }
  }

  if (listonAnual != null && comparable < listonAnual) {
    razones.push(
      `${nombreComparable} ${(comparable * 100).toFixed(2)}% por debajo del listón ${(listonAnual * 100).toFixed(2)}% (mejor alternativa + ${(PRIMA_ILIQUIDEZ * 100).toFixed(0)} pp de prima de iliquidez).`,
    )
    return { decision: 'no', faltan, motivos: razones, alternativas, listonAnual }
  }

  if (mejor.esSuelo) {
    razones.push(
      `Los números son un SUELO: solo ${Math.round(mejor.cobertura * 12)} de 12 meses están medidos. Supera el listón ya con lo medido, pero completar la medición es condición para decidir.`,
    )
    return { decision: 'condicional', faltan, motivos: razones, alternativas, listonAnual }
  }

  razones.push(
    `${nombreComparable} ${(comparable * 100).toFixed(2)}% con el ADR medido los 12 meses, y bate el listón de ${(listonAnual! * 100).toFixed(2)}%.`,
  )
  return { decision: 'si', faltan, motivos: razones, alternativas, listonAnual }
}

// ── Entrada principal ───────────────────────────────────────────────────────

export function analizarInversion(e: EntradaUnderwriting): Underwriting {
  const { ficha } = e
  const legal = revisarPuertaLegal(e.legal)

  const precioPorM2 = ficha.precio != null && ficha.m2 != null && ficha.m2 > 0 ? ficha.precio / ficha.m2 : null
  const inversionTotal =
    ficha.precio != null ? centimos(ficha.precio * (1 + ficha.gastosCompraPct) + (ficha.reforma ?? 0)) : null
  const deuda = ficha.precio != null && e.financiacion ? centimos(ficha.precio * e.financiacion.porcentaje) : 0
  const capitalAportado = inversionTotal != null ? centimos(inversionTotal - deuda) : null

  const faltan: string[] = [...legal.faltan]
  if (ficha.precio == null) faltan.push('precio')

  // La puerta legal es un corte duro: sin ella no se publican números de una
  // explotación que no se puede anunciar. La falta de precio, igual.
  if (!legal.pasa || inversionTotal == null || capitalAportado == null) {
    return {
      motorVersion: MOTOR_VERSION,
      legal: e.legal,
      precioPorM2,
      inversionTotal,
      capitalAportado,
      escenarios: null,
      recomendado: null,
      veredicto: decidir(null, construirAlternativas(e, inversionTotal ?? 0), faltan, legal.motivos),
    }
  }

  const escenarios: Escenario[] = []

  const plazasEnteras = ficha.plazasTotales ?? ficha.unidades.reduce((s, u) => s + u.plazas, 0)
  const curvaEntero = e.mercado.find(m => m.aforo === plazasEnteras)
  if (plazasEnteras > 0 && curvaEntero) {
    escenarios.push(
      construirEscenario('entero', curvaEntero.curva, 1, plazasEnteras, e, inversionTotal, capitalAportado, deuda),
    )
  }

  // Segregado: todas las unidades tienen que tener el MISMO aforo medido; si no,
  // habría que medir una curva por tamaño y aquí no se inventa ninguna.
  if (ficha.unidades.length >= 2) {
    const aforoUnidad = ficha.unidades[0].plazas
    const mismasPlazas = ficha.unidades.every(u => u.plazas === aforoUnidad)
    const curvaUnidad = e.mercado.find(m => m.aforo === aforoUnidad)
    if (mismasPlazas && curvaUnidad) {
      escenarios.push(
        construirEscenario(
          'segregado',
          curvaUnidad.curva,
          ficha.unidades.length,
          aforoUnidad * ficha.unidades.length,
          e,
          inversionTotal,
          capitalAportado,
          deuda,
        ),
      )
    }
  }

  if (!escenarios.length) faltan.push('mercado: no hay curva medida para el aforo del inmueble')

  const mejor = escenarios.length
    ? escenarios.reduce((a, b) => ((a.cashOnCash ?? a.yieldNeto) >= (b.cashOnCash ?? b.yieldNeto) ? a : b))
    : null

  if (mejor && mejor.cobertura < UMBRAL_COBERTURA) {
    faltan.push(`mercado: solo ${Math.round(mejor.cobertura * 12)} de 12 meses medidos`)
  }

  return {
    motorVersion: MOTOR_VERSION,
    legal: e.legal,
    precioPorM2,
    inversionTotal,
    capitalAportado,
    escenarios,
    recomendado: mejor ? mejor.nombre : null,
    veredicto: decidir(mejor, construirAlternativas(e, inversionTotal), faltan, legal.motivos),
  }
}
