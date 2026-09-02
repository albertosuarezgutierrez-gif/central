// El estado de cobro de una póliza, que es la pregunta que Alberto hace antes
// de llamar a nadie: ¿este cliente está al corriente?
//
// 🚨 Esa pregunta tiene TRES respuestas, no dos, y la tercera es la que más se
// pierde: «no lo sé». Medido el 01/09/2026, 18 de las 109 pólizas vivas no
// tienen NI UN recibo en la base — la compañía no los ha mandado. Pintar «0
// pendientes» sobre eso le diría a Alberto que está todo cobrado justo en las
// pólizas de las que no sabe nada. Por eso `total: 0` es un estado propio y la
// UI lo dice como «sin recibos informados».

import { importeEiac, sumarImportesEiac } from './importe-eiac.ts'

/** Situaciones que significan dinero SIN cobrar todavía. */
const SITUACIONES_PENDIENTE = new Set(['pendiente', 'emitido'])
/** Situaciones que significan que el cobro se intentó y falló. */
const SITUACIONES_DEVUELTO = new Set(['devuelto', 'impagado'])

export type ReciboCrudo = {
  id: string
  situacion: string | null
  /** Importe TAL CUAL llega del EIAC: texto, no número. */
  primaTotal: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  formaPago: string | null
}

export type ReciboResumen = {
  id: string
  situacion: string
  /** `null` = el texto del EIAC no tenía forma de importe. No es 0€. */
  importe: number | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  formaPago: string | null
}

export type RecibosPoliza = {
  /** `0` = la compañía no ha informado recibos. NO es «al corriente». */
  total: number
  pendientes: number
  devueltos: number
  cobrados: number
  anulados: number
  /** Suma de los COBRADOS. `null` si no se pudo leer ni uno. */
  cobradoEur: number | null
  /** Importes con forma inesperada: se dicen, no se cuentan como 0. */
  ilegibles: number
  /** El más reciente por emisión, para pintar «último recibo» sin otra consulta. */
  ultimo: ReciboResumen | null
}

/** Qué decir de un vistazo. `sin_datos` NUNCA se pinta como «al corriente». */
export type EstadoCobro = 'sin_datos' | 'devuelto' | 'pendiente' | 'al_corriente' | 'anulados'

export function estadoCobro(r: RecibosPoliza): EstadoCobro {
  if (r.total === 0) return 'sin_datos'
  if (r.devueltos > 0) return 'devuelto'
  if (r.pendientes > 0) return 'pendiente'
  // 🚨 Todos anulados (20 de 109 vivas, 02/09/2026: pólizas canceladas o
  // sustituidas) se pintaba «🟢 0 cobrado(s)». Cero cobros no es estar al día.
  if (r.cobrados === 0 && r.anulados > 0) return 'anulados'
  return 'al_corriente'
}

/** La frase que acompaña al estado. Dice qué hacer, no solo qué pasa. */
export function explicarCobro(r: RecibosPoliza): string {
  switch (estadoCobro(r)) {
    case 'sin_datos':
      return 'La compañía no ha mandado ningún recibo de esta póliza. No significa que esté pagada: significa que no se sabe.'
    case 'devuelto':
      return `${r.devueltos} recibo(s) devuelto(s): hay que reclamar el cobro antes de que la compañía anule.`
    case 'pendiente':
      return `${r.pendientes} recibo(s) pendiente(s) de cobro.`
    case 'al_corriente':
      return `${r.cobrados} recibo(s) cobrado(s), ninguno pendiente ni devuelto.`
    case 'anulados':
      return `Los ${r.anulados} recibo(s) están anulados: la póliza se canceló o se sustituyó. No hay cobro.`
  }
}

/**
 * Resume los recibos de UNA póliza. Recibe la lista YA ordenada por emisión
 * descendente (el primero es el último recibo).
 *
 * `anulado` no entra en pendientes ni en cobrados: no es deuda ni ingreso, y
 * meterlo en cualquiera de los dos cubos falsearía las dos cifras. Se cuenta
 * aparte porque son 54 de 184 — callarlos haría que los totales no cuadren.
 */
export function resumirRecibos(lista: readonly ReciboCrudo[]): RecibosPoliza {
  let pendientes = 0
  let devueltos = 0
  let cobrados = 0
  let anulados = 0
  const textosCobrados: (string | null)[] = []
  for (const r of lista) {
    const s = (r.situacion ?? '').trim()
    if (SITUACIONES_PENDIENTE.has(s)) pendientes++
    else if (SITUACIONES_DEVUELTO.has(s)) devueltos++
    else if (s === 'cobrado') {
      cobrados++
      textosCobrados.push(r.primaTotal)
    } else if (s === 'anulado') anulados++
  }
  const suma = sumarImportesEiac(textosCobrados)
  const ultimo = lista[0] ?? null
  return {
    total: lista.length,
    pendientes,
    devueltos,
    cobrados,
    anulados,
    cobradoEur: suma.leidos === 0 ? null : suma.total,
    ilegibles: suma.ilegibles,
    ultimo:
      ultimo === null
        ? null
        : {
            id: ultimo.id,
            // Un recibo sin situación es un dato que falta, no un cobro.
            situacion: (ultimo.situacion ?? '').trim() || 'sin_informar',
            importe: importeEiac(ultimo.primaTotal),
            fechaEmision: ultimo.fechaEmision,
            fechaVencimiento: ultimo.fechaVencimiento,
            formaPago: ultimo.formaPago,
          },
  }
}
