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
const RE_LINEA = /^(\d{2})\/(\d{2})\/(\d{4})\s*(\*{2,}\d.*)$/
// Importe: el ÚNICO número anclado al símbolo €. `\d{1,3}` + grupos de millar impide que se trague
// los dígitos del nº de tarjeta pegado por delante (a lo sumo se cuela un cero a la izquierda).
const RE_IMPORTE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€/
// Prefijo de tarjeta enmascarada al principio del resto: `******2019750300`.
const RE_TARJETA_PREFIJO = /^\s*\*+\d*/
const RE_PAN = /N[uú]mero:\s*(\d{15,19})/i

export function parseTarjetaPdfTexto(
  texto: string,
  opts: { iban?: string; banco?: string } = {},
): ExtractoN43[] {
  const pan = texto.match(RE_PAN)?.[1] ?? null
  const movimientos: MovimientoN43[] = []
  let fechaMin: string | null = null
  let fechaMax: string | null = null

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim()
    const m = linea.match(RE_LINEA)
    if (!m) continue
    const [, dd, mm, yyyy, resto] = m
    const imp = resto.match(RE_IMPORTE)
    if (!imp) continue
    const importe = importeEs(imp[1])
    if (importe === null) continue
    // Importe fuera PRIMERO (ver cabecera), y solo entonces el prefijo de la tarjeta.
    const concepto = resto
      .replace(imp[0], ' ')
      .replace(RE_TARJETA_PREFIJO, ' ')
      .replace(/\s+/g, ' ')
      .trim()
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
  const verificable = liquidacion !== null && !cicloAnterior
  const diferencia = verificable ? Math.abs(liquidacion! - esperado) : 0
  const cuadra = !verificable || diferencia < tol
  return { liquidacion, sumaCompras, sumaDevoluciones, esperado, diferencia, cuadra, verificable }
}
