// Cuadre de comisiones de la correduría. PURO: sin BD ni red, testeable con
// `node --test`. La UI no decide nada; solo pinta lo que devuelve esto.
// Patrón de referencia: `lib/subastas/resumen-docs.ts`.
//
// 🚨 `null` = no ha llegado. `0` = comprobado y es cero. No se colapsan nunca:
// es la diferencia entre «Mapfre no me ha liquidado» y «Mapfre me liquidó 0 €»,
// y sobre esa diferencia decide Alberto si reclama.
//
// 🚨 Los tres números NO son el mismo número (medido 01/09/2026): la compañía
// retiene el 15 % de IRPF y lo declara en el modelo 190 —que es lo que alimenta
// el borrador de la AEAT—, así que al banco llega la REMESA = bruto − retención
// (Allianz feb/2026: 95,03 − 14,26 = 80,77 exacto). Comparar el bruto contra el
// banco descuadra SIEMPRE por ese 15 %.
//
// 🚨 Y quien retiene es la COMPAÑÍA, no Alberto: él cobra ya el neto. Para él la
// retención no es un gasto ni algo que pagar, es un pago a cuenta hecho a su
// nombre que se resta de la CUOTA del IRPF. De ahí la asimetría de este módulo:
// a la renta va el BRUTO y contra el banco se compara la REMESA. Restar el 15 %
// otra vez en cualquier punto sería contarlo dos veces.

export type EstadoCuadre =
  | 'no-comprobado'          // falló la lectura de una fuente. NO es «no hay»
  | 'sin-cobertura'          // esa compañía no tiene NINGUNA fuente de importe
  | 'sin-datos'              // hay cobertura y aún no ha llegado nada del periodo
  | 'esperado-sin-liquidar'  // devengaste y la compañía no ha liquidado
  | 'liquidado-sin-cobrar'   // te lo reconoce y no te lo ingresa
  | 'cobrado-sin-liquidar'   // entró dinero que ninguna fuente explica
  | 'deudor'                 // comisión negativa y remesa 0: saldo a favor de la cía
  | 'descuadra'              // dos fuentes del mismo periodo que no coinciden
  | 'cuadra'

export interface EntradaCuadre {
  /** `false` = alguna fuente no se pudo leer. Manda sobre todo lo demás: un
   *  fallo de red no puede acabar pintado como «la compañía no te ha pagado». */
  leidoOk: boolean
  /** ¿Existe alguna fuente de importe para esa compañía? Generali hoy no tiene
   *  ninguna: eso es una GESTIÓN pendiente, no un dato que esté por llegar. */
  tieneCobertura: boolean
  esperadoBruto: number | null
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  bancoTotal: number | null
}

/** `bruto − retención = remesa` es aritmética exacta del extracto: un céntimo
 *  de margen para redondeos, no el umbral de 5 € que usaba el cron viejo. */
export const TOLERANCIA_ARITMETICA = 0.011
/** Ventana banco↔remesa: aquí sí caben comisiones partidas o gastos de envío. */
export const TOLERANCIA_BANCO = 1

export function estadoCuadre(e: EntradaCuadre): EstadoCuadre {
  if (!e.leidoOk) return 'no-comprobado'
  if (!e.tieneCobertura) return 'sin-cobertura'

  const hayLiq = e.liqBruto != null
  const hayBanco = e.bancoTotal != null
  const hayEsperado = e.esperadoBruto != null

  if (!hayLiq && !hayBanco && !hayEsperado) return 'sin-datos'

  // Saldo deudor (Occident lleva cuatro periodos así): la compañía se queda a
  // deber y no remesa. No es un impago ni un descuadre — pintarlo en rojo sería
  // mentir sobre quién debe a quién.
  if (hayLiq && (e.liqBruto as number) < 0 && (e.liqRemesa ?? 0) === 0) return 'deudor'

  if (!hayLiq && hayEsperado) return 'esperado-sin-liquidar'
  if (!hayLiq && hayBanco) return 'cobrado-sin-liquidar'

  // Con liquidación: primero la aritmética interna del propio extracto.
  const remesaEsperada = (e.liqBruto as number) - (e.liqRetencion ?? 0)
  if (Math.abs(remesaEsperada - (e.liqRemesa ?? 0)) > TOLERANCIA_ARITMETICA) return 'descuadra'

  if (!hayBanco) return 'liquidado-sin-cobrar'
  if (Math.abs((e.liqRemesa ?? 0) - (e.bancoTotal as number)) > TOLERANCIA_BANCO) return 'descuadra'
  return 'cuadra'
}

/** Estados que significan «todavía no se sabe». Los que cuentan para decir que
 *  un total anual NO está cerrado. */
export const ESTADOS_PENDIENTES: readonly EstadoCuadre[] = ['sin-datos', 'sin-cobertura', 'no-comprobado']

/**
 * ¿El total anual se puede presentar como CERRADO? Solo si ningún periodo está
 * pendiente de dato o de comprobación.
 *
 * 🚨 Un total con huecos pintado como definitivo es justo la mentira que este
 * módulo evita: es la cifra que Alberto manda a la asesoría.
 */
export function totalEsCerrado(estados: readonly EstadoCuadre[]): boolean {
  return !estados.some(s => ESTADOS_PENDIENTES.includes(s))
}

/** Cuántos periodos están pendientes, para poder decirlo en la UI. */
export function cuantosPendientes(estados: readonly EstadoCuadre[]): number {
  return estados.filter(s => ESTADOS_PENDIENTES.includes(s)).length
}

/**
 * ¿El mes `YYYY-MM` cae dentro del periodo `inicio`..`fin` (fechas `YYYY-MM-DD`)?
 *
 * Hace falta porque el devengo se agrupa por MES natural (cuándo se cobró el
 * recibo) y la liquidación viene con el periodo REAL de la compañía, que no
 * siempre es un mes natural: CIMA trae periodos como 31/05 → 01/07. Se cuenta
 * como solape si el mes y el periodo se tocan en algún día.
 */
export function mesEnPeriodo(mes: string, inicio: string, fin: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(mes)) return false
  const [a, m] = mes.split('-').map(Number)
  const primerDia = `${mes}-01`
  const ultimoDia = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  return primerDia <= fin && ultimoDia >= inicio
}

/** Último día del mes `YYYY-MM`, como `YYYY-MM-DD`. */
export function finDeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}
