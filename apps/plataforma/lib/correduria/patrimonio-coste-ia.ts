// Panel de conversión de Patrimonio (27/10/2026, ESTUDIO-PATRIMONIO-MERCADO §7 punto 10) — coste ESTIMADO de la IA.
//
// 🚨 ORIGEN DE LAS CIFRAS (dilo siempre en pantalla: «estimado»): NO hay en el repo un precio fiable por lectura.
//   · El portal lee facturas/volcados con `modelosLecturaPoliza()` (principal Gemini Flash, suplente Claude Sonnet) por
//     `openrouterVision` SIN registrar el coste en `ai_usos` (la pasarela de plataforma sí lo hace; el portal no pasa por ella).
//   · Estas dos constantes son un SUPUESTO de orden de magnitud (una factura de 1-2 páginas con un modelo «flash» de visión;
//     un volcado, varias páginas o un Excel entero), NO una medición. Alberto las cambia AQUÍ y solo aquí.
//   · Cuando el portal registre el coste real de cada lectura, este helper se sustituye por la suma real y el rótulo
//     «estimado» desaparece.
// PURO: sin BD, sin red, sin reloj.

/** € estimados por factura leída con IA (supuesto, no medido). */
export const COSTE_LECTURA_FACTURA_EUR = 0.01
/** € estimados por volcado inicial leído con IA (supuesto, no medido: lee varias páginas). */
export const COSTE_LECTURA_VOLCADO_EUR = 0.05

export type LecturasIa = {
  facturas: number
  /** `null` = no se sabe (la columna `volcado` aún no existe en la BD): el coste es entonces un SUELO. */
  volcados: number | null
}

export type CosteEstimadoIa = {
  euros: number
  /** `true` si falta el recuento de volcados: la cifra real puede ser MAYOR (se pinta «≥»). */
  esSuelo: boolean
}

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

/** `null` si el recuento de facturas no es un entero válido (no se inventa un coste). Redondeado a céntimos. */
export function costeEstimadoIa(l: LecturasIa): CosteEstimadoIa | null {
  if (!entero(l.facturas)) return null
  const volcados = entero(l.volcados) ? l.volcados : 0
  const bruto = l.facturas * COSTE_LECTURA_FACTURA_EUR + volcados * COSTE_LECTURA_VOLCADO_EUR
  return { euros: Math.round(bruto * 100) / 100, esSuelo: !entero(l.volcados) }
}
