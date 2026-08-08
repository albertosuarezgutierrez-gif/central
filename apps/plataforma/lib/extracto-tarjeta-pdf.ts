// Importador del PDF de "Movimientos de tarjeta" de Kutxabank (visa dual). Produce el
// MISMO tipo `ExtractoN43` que Norma 43 / Excel, así la persistencia (lib/banca.ts) y el
// dedupe no cambian. El parseo del TEXTO es puro (testeable con `node --test`); la
// extracción PDF→texto usa pdf-parse en un wrapper aparte.
//
// Formato de línea (texto extraído del PDF):
//   cargo:  `19/06/2026 ******2019650302 COMPRA EN LEROY MERLIN SEVILLA -192,39 €`
//   abono:  `01/07/2026 ******2019650302 1.355,24 €PAGO RECIBO 4662032019650302`
// (en los abonos el importe va DELANTE del concepto y el € puede ir pegado al texto).
//
// 🚨 08/08/2026 — el PDF REAL de Kutxabank NO trae esos espacios: sale todo PEGADO,
//   `01/07/2026******2019750300COMPRA EN ZAPATERIA CERRAJERIA-8,00 €`
// y en los abonos el importe se pega al número de tarjeta (`******201975030035,00 €DEVOLUCION…`).
// El parser exigía `\s+` entre la fecha y la tarjeta, así que devolvía CERO movimientos con el
// documento real: el extracto de julio no se pudo importar y el agente, al recibirlo por el chat,
// lo trataba como una factura ilegible («no distingo el importe») — Alberto lo subió tres veces.
// Se validó contra un fixture escrito a mano con la separación que se SUPONÍA, no contra un PDF de
// verdad, que es justo el fallo de método que avisa el CLAUDE.md. Ahora se admiten las dos formas y
// el fixture de abajo es texto EXTRAÍDO de un PDF real.
// Clave para separar los campos cuando va todo pegado: se localiza PRIMERO el importe (es el único
// número anclado a `€`) y solo DESPUÉS se quita el prefijo de la tarjeta; al revés, el `\d+` del
// número de tarjeta se comería los dígitos del importe del abono y la línea se perdía.
//
// Claves de diseño:
// - `ccc` = `TARJETA-KUTXA-<últimos 4 del PAN>` → casa con la cuenta ya creada de la
//   tarjeta (unique sociedad_id+iban en cuentas_bancarias), p. ej. `TARJETA-KUTXA-0302`.
// - `fechaValor` = `fechaOperacion` y conceptoComun/referencia/saldo VACÍOS: así el
//   `dedupeHash` coincide byte a byte con las filas ya cargadas de la tarjeta y
//   reimportar el mismo PDF no duplica nada (ON CONFLICT (cuenta, dedupe_hash)).
// - `banco` se deja en null salvo override: el upsert de importarExtracto hace COALESCE,
//   así un reimport NO renombra la cuenta existente (p. ej. `💳 Tarjeta Kutxabank Pilar`).

import type { ExtractoN43, MovimientoN43 } from './norma43'

// '1.234,56' / '-4,17' (formato es-ES) → número. null si no parsea.
function importeEs(s: string): number | null {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// 'DD/MM/YYYY' → 'YYYY-MM-DD'.
function fechaIso(d: string, m: string, y: string): string {
  return `${y}-${m}-${d}`
}

// Fecha al principio de la línea + el resto (con o sin espacio antes del nº de tarjeta enmascarado).
const RE_LINEA = /^(\d{2})\/(\d{2})\/(\d{4})\s*(\*{2,}[\d\s].*)$/
// Importe en formato es-ES anclado al símbolo €. OJO: solo es fiable DESPUÉS de haber quitado el
// número de tarjeta (ver `digitosEnmascarados`): pegado a los dígitos del PAN, el grupo de millar se
// traga hasta 3 de ellos — `******20196503021.355,24 €` daría 21.355,24€ en vez de 1.355,24€.
const RE_IMPORTE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€/
// Dígitos del nº de tarjeta que SÍ se pueden delimitar sin ambigüedad: los que van seguidos de algo
// que no puede ser parte de un importe (una letra del concepto). Las líneas de abono, donde el
// importe va pegado detrás, no votan aquí precisamente porque ahí no se sabe dónde acaba el PAN.
const RE_TARJETA_INEQUIVOCA = /\*{2,}(\d+)(?=[^\d.,])/
const RE_PAN = /N[uú]mero:\s*(\d{15,19})/i

/**
 * Los dígitos que el extracto enseña del nº de tarjeta (`******2019750300` → `2019750300`). Son los
 * MISMOS en todas las líneas, así que basta con delimitarlos una vez para poder recortarlos de todas
 * y leer el importe sobre un texto ya limpio.
 *
 * Dos fuentes, en este orden, las dos deterministas:
 *   1. una línea de cargo, donde tras los dígitos viene una letra (`…2019750300COMPRA EN…`);
 *   2. el PAN de la cabecera (`Número: 4662032019750300`): se prueba su sufijo más largo que encaje
 *      con los dígitos que siguen a los asteriscos.
 * Si ninguna resuelve, se devuelve null y las líneas se DESCARTAN: escribir un importe adivinado en
 * el banco es peor que no importar (un 21.355,24€ inventado no lo detecta nadie aguas abajo).
 */
function digitosEnmascarados(lineas: string[], pan: string | null): string | null {
  for (const l of lineas) {
    const d = l.match(RE_TARJETA_INEQUIVOCA)?.[1]
    if (d) return d
  }
  if (!pan) return null
  const tras = lineas.map(l => l.match(/\*{2,}(\d+)/)?.[1]).filter(Boolean) as string[]
  for (let n = pan.length; n >= 4; n--) {
    const suf = pan.slice(-n)
    if (tras.some(t => t.startsWith(suf))) return suf
  }
  return null
}

export function parseTarjetaPdfTexto(
  texto: string,
  opts: { iban?: string; banco?: string } = {},
): ExtractoN43[] {
  const pan = texto.match(RE_PAN)?.[1] ?? null
  const lineas = texto.split(/\r?\n/).map(l => l.trim())
  const digitos = digitosEnmascarados(lineas, pan)
  const movimientos: MovimientoN43[] = []
  let fechaMin: string | null = null
  let fechaMax: string | null = null

  // Prefijo EXACTO a recortar de cada línea: los asteriscos + los dígitos que enseña esta tarjeta.
  const rePrefijo = digitos ? new RegExp(`^\\s*\\*+${digitos}\\s*`) : null

  for (const linea of lineas) {
    const m = linea.match(RE_LINEA)
    if (!m || !rePrefijo) continue
    const [, dd, mm, yyyy, conTarjeta] = m
    // Fuera el nº de tarjeta ANTES de leer nada: si no casa, la línea es de otra tarjeta o de otro
    // formato y no se adivina.
    if (!rePrefijo.test(conTarjeta)) continue
    const resto = conTarjeta.replace(rePrefijo, '')
    const imp = resto.match(RE_IMPORTE)
    if (!imp) continue
    const importe = importeEs(imp[1])
    if (importe === null) continue
    const concepto = resto.replace(imp[0], ' ').replace(/\s+/g, ' ').trim()
    if (!concepto) continue
    const fecha = fechaIso(dd, mm, yyyy)
    if (!fechaMin || fecha < fechaMin) fechaMin = fecha
    if (!fechaMax || fecha > fechaMax) fechaMax = fecha
    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: fecha,
      importe,
      conceptoComun: '',
      concepto,
      contraparte: '',
      referencia: '',
    })
  }

  if (movimientos.length === 0) return []

  const ccc = opts.iban || (pan ? `TARJETA-KUTXA-${pan.slice(-4)}` : 'TARJETA-PDF')
  return [{
    ccc,
    banco: opts.banco || '',
    divisa: 'EUR',
    saldoInicial: 0,
    saldoFinal: null,
    fechaInicio: fechaMin,
    fechaFin: fechaMax,
    movimientos,
  }]
}

// Wrapper con red de E/S: PDF (Buffer) → texto → parseo puro. Import perezoso del
// implementador interno de pdf-parse (mismo patrón que lib/concursos.ts: la raíz del
// paquete tiene un index con efectos secundarios que rompe el build).
export async function parseExtractoTarjetaPdf(
  buf: Buffer,
  opts: { iban?: string; banco?: string } = {},
): Promise<ExtractoN43[]> {
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const { text } = await pdfParse(buf)
  return parseTarjetaPdfTexto(String(text ?? ''), opts)
}

// ¿El texto de un PDF ya extraído parece un "Movimientos de tarjeta"? Reutiliza el propio
// parser: es extracto si detecta ≥3 líneas de movimiento con el formato `DD/MM/YYYY ******PAN …`.
// El umbral evita confundirlo con una factura suelta que traiga una fecha aislada. Puro/testeable.
export function esExtractoTarjeta(texto: string): boolean {
  if (!texto) return false
  const ex = parseTarjetaPdfTexto(texto)
  return ex.length > 0 && ex[0].movimientos.length >= 3
}

// Línea de LIQUIDACIÓN de la tarjeta dentro del propio extracto: el abono "PAGO RECIBO 4662…"
// que paga el saldo del mes (espejo del cargo TARJ.CRDTO de la cuenta corriente). NO es una
// compra ni una devolución — se excluye del cómputo de gasto y del emparejado de devoluciones.
export function esPagoReciboTarjeta(concepto: string | null | undefined): boolean {
  return /PAGO\s+RECIBO/i.test(concepto || '')
}

export interface CuadreTarjeta {
  liquidacion: number | null   // Σ de las líneas PAGO RECIBO (null si el extracto no la trae → no verificable)
  sumaCompras: number          // Σ |importe| de los cargos (importe < 0)
  sumaDevoluciones: number     // Σ importe de los abonos que NO son PAGO RECIBO (devoluciones)
  esperado: number             // sumaCompras − sumaDevoluciones (lo que debería liquidar la tarjeta)
  diferencia: number           // |liquidacion − esperado| (0 si no hay liquidación que contrastar)
  cuadra: boolean              // true si cuadra dentro de tolerancia (o si no hay nada que verificar)
  /** false = este extracto NO permite comprobar el cuadre; no se puede afirmar ni ✅ ni ⚠️. */
  verificable: boolean
}

// Comprueba la consistencia interna del extracto: la liquidación (PAGO RECIBO) debe igualar
// Σ compras − Σ devoluciones. Si no cuadra, faltan páginas / es el mes equivocado / PDF parcial.
// Puro/testeable. Si el extracto no trae la línea de liquidación, no se puede verificar → cuadra=true.
//
// 🚨 La liquidación paga el ciclo ANTERIOR: en el extracto real de Kutxabank el `PAGO RECIBO` es la
// PRIMERA línea del mes (el 01/07 se cobra lo gastado en junio) y las compras del fichero son
// POSTERIORES. Contrastar una contra otras daba un «⚠️ el desglose NO cuadra, ¿faltan páginas?» que
// era falso en TODOS los extractos reales. Cuando la liquidación no puede corresponder a estas
// compras (va antes de la primera), el cuadre se marca NO verificable en vez de gritar.
export function cuadrarExtractoTarjeta(ex: ExtractoN43, tol = 0.02): CuadreTarjeta {
  let liquidacion: number | null = null
  let sumaCompras = 0
  let sumaDevoluciones = 0
  let fechaLiquidacion: string | null = null
  let primeraCompra: string | null = null
  for (const m of ex.movimientos) {
    if (esPagoReciboTarjeta(m.concepto)) {
      liquidacion = (liquidacion ?? 0) + Math.abs(m.importe)
      if (!fechaLiquidacion || m.fechaOperacion < fechaLiquidacion) fechaLiquidacion = m.fechaOperacion
    } else if (m.importe < 0) {
      sumaCompras += Math.abs(m.importe)
      if (!primeraCompra || m.fechaOperacion < primeraCompra) primeraCompra = m.fechaOperacion
    } else if (m.importe > 0) {
      sumaDevoluciones += m.importe
    }
  }
  const esperado = sumaCompras - sumaDevoluciones
  const cicloAnterior = !!(fechaLiquidacion && primeraCompra && fechaLiquidacion <= primeraCompra)
  // Sin una sola compra no hay nada que contrastar (mes solo con la liquidación, o PDF a medias):
  // afirmar un descuadre de "Σ compras = 0 vs la liquidación" sería inventarse un problema.
  const verificable = liquidacion !== null && primeraCompra !== null && !cicloAnterior
  const diferencia = verificable ? Math.abs(liquidacion! - esperado) : 0
  const cuadra = !verificable || diferencia < tol
  return { liquidacion, sumaCompras, sumaDevoluciones, esperado, diferencia, cuadra, verificable }
}
