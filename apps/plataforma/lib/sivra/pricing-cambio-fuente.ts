// lib/sivra/pricing-cambio-fuente.ts — guarda «el mes se fue»: una fecha cuyo precio vivo lo
// escribió el motor con el bucket del MES no baja en la pasada en que ese mes se queda sin bucket.
//
// POR QUÉ (28/10/2026, Duplex 01/05/2027). La elegibilidad del bucket del mes es un ESCALÓN: con 3
// fechas medidas hay bucket, con 2 no. Mayo-2027 de Duplex pasó de 3 a 2 fechas el 11/10/2026 —no
// porque caducaran fotos, sino porque `pricing_eventos_auto` ganó una fila DESCARTADA para el 22/05 y
// la exclusión de fechas de evento del bucket no mira `estado`— y todo el mes cayó al ancla global en
// la pasada siguiente. Para las noches normales eso no bajó nada (el prior estacional ya sube la
// global a ×1,32 en mayo), pero el salto de evento SÍ se calcula sobre la base sin prior: el 01/05
// (puente, ×1,45) pasó de 176€ a 146€ (= 101 × 1,45) el 24/10 y se vendió al día siguiente.
//
// Un cambio de FUENTE no es información nueva sobre la fecha: es el contador de fechas del mes
// cruzando un umbral. Así que se trata como las otras guardas de congelación del motor: no se baja
// por eso. Subir sí puede (si el objetivo nuevo supera al vivo, se escribe y la fecha pasa a 'global').
//
// Las tres salidas, para que la congelación no sea eterna:
//   · el bucket del mes vuelve → la fuente ya no cambia y la guarda no aplica;
//   · la fecha entra en el horizonte de última hora (≤ HORIZONTE_DIAS) → manda la urgencia, igual
//     que en la guarda de outlier (mismo horizonte, `OUTLIER_HORIZON_DAYS` del motor);
//   · `libera` (el techo de mercado MEDIDO de la fecha dice que vamos caros, o el evento que la subió
//     se descartó) → hay un juicio real sobre la fecha y la congelación no puede tapar ese juicio.
//   Y `max_price` del propietario manda siempre, como en el resto de guardas.
//
// 🚨 `fuenteAnterior` a `null` = NO CONSTA (lectura caída o fecha sin escrituras con fuente): la
// guarda NO actúa. No se congela a ciegas: una lectura rota no puede bloquear el calendario entero.
//
// Módulo PURO (sin Prisma ni `@/`), testeable con `node --test`.

export type FuenteBase = 'mes' | 'global'

/** Días vista a partir de los cuales la guarda deja de proteger (manda la urgencia de última hora). */
export const HORIZONTE_DIAS = 30

/** `base_fuente` tal y como viene de `pricing_applied`. Cualquier otra cosa es «no consta». */
export function normalizarFuenteBase(v: unknown): FuenteBase | null {
  return v === 'mes' || v === 'global' ? v : null
}

export type CambioFuenteInput = {
  /** `base_fuente` de la ÚLTIMA escritura real de la fecha; `null` = no consta */
  fuenteAnterior: FuenteBase | null
  /** de dónde sale la base de la fecha EN ESTA pasada */
  fuenteActual: FuenteBase
  /** objetivo ya calculado (tras raíl, suelos y techos) */
  target: number
  /** precio vivo de la fecha; `null` = sin precio previo (no hay nada que proteger) */
  old: number | null
  /** días que faltan para la fecha (0 = hoy) */
  diasVista: number
  /** hay un juicio real sobre la fecha (techo de mercado medido, rumor caído) que debe mandar */
  libera: boolean
  /** techo del propietario; si obliga a bajar, manda él */
  maxPrice: number | null
}

/** true = esta pasada NO escribe la fecha (se queda al precio vivo). */
export function congelarPorCambioFuente(i: CambioFuenteInput, horizonteDias = HORIZONTE_DIAS): boolean {
  if (i.fuenteAnterior !== 'mes' || i.fuenteActual !== 'global') return false
  if (i.old == null || !Number.isFinite(i.old) || !Number.isFinite(i.target)) return false
  if (!(i.target < i.old)) return false
  if (!(i.diasVista > horizonteDias)) return false
  if (i.libera) return false
  if (i.maxPrice != null && i.old > i.maxPrice) return false
  return true
}
