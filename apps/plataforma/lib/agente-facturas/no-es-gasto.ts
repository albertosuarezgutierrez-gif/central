// Documentos que están en la bandeja de GASTOS pero no son un gasto.
//
// Caso fundacional (29/08/2026). Alberto, revisando la bandeja: «Allianz son comisiones cobradas,
// tiene que cuadrar con ingresos de mi correduría». Tenía en la bandeja dos documentos de Allianz
// —un «Extracto de Cuenta Mediador. Mes de Julio de 2026» de 291,73 € y una «Anulación de pólizas
// por impago» de 301,70 €— presentados como facturas de proveedor a confirmar.
//
// No lo son: son la LIQUIDACIÓN de las comisiones que Allianz le PAGA a él. Confirmarlos habría
// metido 593,43 € de INGRESO como gasto deducible, y además habría nacido la regla que manda ahí
// todos los extractos futuros de esa compañía. El ingreso ya vive donde tiene que vivir: el abono
// en BBVA con `destino='seguros'`, que es de lo que come `/correduria`.
//
// El agente de correo lee cualquier PDF con importes y lo da de alta como gasto; el sentido del
// documento (¿me lo cobran o me lo pagan?) no lo mira nadie. Hasta que eso se arregle en la
// ingesta, esto es el aviso en la pantalla: no bloquea nada —Alberto decide—, pero un documento
// así no se confirma por inercia.
//
// 🚨 Solo se avisa con señales que DISTINGUEN. Un vigilante que marca de más entrena a ignorarlo:
// «comisión» a secas aparece en facturas de gasto legítimas (la comisión que cobra Booking o
// Stripe SÍ es un gasto), así que no basta. Lo que distingue es el vocabulario de la relación de
// mediación —extracto de cuenta mediador, liquidación de comisiones, saldo de agente— o una
// anulación/retrocesión, que es un descuento contra lo cobrado.
//
// Módulo PURO (sin imports ni BD) para poder testearlo con `node --test`.

export interface SospechaIngreso {
  /** `true` = no debe confirmarse como gasto. */
  esSospechoso: boolean
  /** Qué lo ha activado, para poder decirlo en pantalla. `null` si no hay sospecha. */
  motivo: string | null
  /** Por qué no es un gasto: cambia el texto de la ficha, porque el motivo es distinto. */
  tipo: 'ingreso_correduria' | 'ya_descontado' | null
}

/**
 * Comisiones que la plataforma de reservas COBRA POR DESCUENTO, no por domiciliación.
 *
 * Alberto, sobre las cuatro facturas de Booking de su bandeja (1.371,94 €): «comisiones no son
 * importes ingresados en cuenta de Booking, tiene que cuadrar con ingresos de reservas». Tenía
 * razón, y la consecuencia es más grave de lo que parecía: `lib/financiero.ts` suma
 * `SUM(amount)` de `incomes`, que es el importe **NETO** — la comisión YA está descontada ahí.
 *
 * Así que confirmar esa factura como gasto resta la comisión DOS VECES y hunde el resultado del
 * piso sin que nada lo delate: es un gasto real, con su PDF y su importe correcto, que
 * sencillamente ya está contado.
 *
 * (La alternativa ortodoxa —ingreso BRUTO + comisión como gasto deducible— es igual de válida y
 * fiscalmente equivalente, pero exige cambiar `SUM(amount)` por `SUM(amount_gross)` en todo el
 * módulo. Lo que no puede haber es la mezcla, que es lo que este aviso evita.)
 */
const PLATAFORMAS_QUE_DESCUENTAN: Array<[RegExp, string]> = [
  [/\bbooking\.?com\b/i, 'Booking'],
  [/\bairbnb\b/i, 'Airbnb'],
  [/\bexpedia\b/i, 'Expedia'],
  [/\bagoda\b/i, 'Agoda'],
]

/** Señales de que el documento es la COMISIÓN de la plataforma, no otro servicio suyo. */
const RE_COMISION_RESERVAS = /\bcomisi[oó]n|\bcommission\b|\bpor\s+reservas\b/i

/**
 * Vocabulario propio de la LIQUIDACIÓN de un mediador de seguros. Son expresiones que solo
 * aparecen cuando la compañía rinde cuentas al agente, no en una factura que le cobran.
 */
const SENALES_LIQUIDACION: Array<[RegExp, string]> = [
  [/\bextracto\s+de\s+cuenta\b/i, 'es un extracto de cuenta de mediador'],
  [/\bcuenta\s+(de\s+)?mediador\b/i, 'es un extracto de cuenta de mediador'],
  [/\bliquidaci[oó]n\s+de\s+comisiones\b/i, 'es una liquidación de comisiones'],
  [/\bsaldo\s+(de\s+)?agente\b/i, 'es un saldo de agente'],
  [/\bcuenta\s+corriente\s+(de\s+)?agente\b/i, 'es una cuenta corriente de agente'],
  [/\brecibo\s+de\s+comisiones\b/i, 'es un recibo de comisiones'],
  // «Cartera No Vida del mes de Noviembre de 2026», 1.446,52 € — el listado de la cartera de
  // pólizas del mediador y sus comisiones, no una factura. Apareció en la misma bandeja que las
  // otras dos de Allianz, y encima fechado en un mes futuro: no es un gasto de agosto.
  [/\bcartera\s+(no\s+)?vida\b/i, 'es un listado de cartera de mediador'],
]

/**
 * Una anulación o retrocesión no es un gasto: es un descuento contra las comisiones ya cobradas.
 * Se trata aparte porque la palabra sola es ambigua (se anulan también facturas de proveedor), y
 * por eso exige el contexto de póliza/comisión.
 */
const SENALES_RETROCESION: Array<[RegExp, string]> = [
  [/\banulaci[oó]n\s+de\s+p[oó]lizas?\b/i, 'es una anulación de pólizas (descuento de comisiones, no un gasto)'],
  [/\bretrocesi[oó]n\b/i, 'es una retrocesión de comisiones'],
  [/\bextorno\b/i, 'es un extorno'],
]

/**
 * ¿Este documento parece un ingreso de la correduría en vez de un gasto?
 *
 * Se mira el concepto y el nombre del proveedor, que es donde el extractor deja el título del
 * documento. Devuelve SIEMPRE los dos estados explícitos: no hay un tercer «no lo sé» porque esto
 * es un aviso, no una clasificación — si no reconoce nada, simplemente no dice nada.
 */
export function pareceIngresoDeCorreduria(f: {
  proveedor?: string | null
  concepto?: string | null
}): SospechaIngreso {
  const texto = `${f.proveedor ?? ''} ${f.concepto ?? ''}`
  for (const [re, motivo] of [...SENALES_LIQUIDACION, ...SENALES_RETROCESION]) {
    if (re.test(texto)) return { esSospechoso: true, motivo, tipo: 'ingreso_correduria' }
  }

  // La comisión de la plataforma exige LAS DOS señales: quién la emite y que sea la comisión.
  // Booking factura también servicios que SÍ se pagan aparte, y marcarlos todos sería el ruido
  // que hace que se deje de leer el aviso.
  for (const [re, nombre] of PLATAFORMAS_QUE_DESCUENTAN) {
    if (re.test(texto) && RE_COMISION_RESERVAS.test(texto)) {
      return {
        esSospechoso: true,
        tipo: 'ya_descontado',
        motivo: `${nombre} descuenta su comisión del pago de la reserva, y el ingreso que contamos ya es el NETO`,
      }
    }
  }
  return { esSospechoso: false, motivo: null, tipo: null }
}
