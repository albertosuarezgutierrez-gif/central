// Ajuste de comparables por AFORO (plazas) — helper PURO, sin BD.
//
// EL PROBLEMA QUE RESUELVE (hallazgo 31/07/2026, aviso de Alberto sobre Socorro/House):
// el barrido de mercado guardaba los MISMOS comps para los 4 pisos con `guests=4` fijo, y el motor
// (`apply/route.ts`) calculaba sus percentiles SIN filtrar por `guests`. Resultado: una casa de 12
// plazas se tarificaba contra apartamentos de 4-8 plazas y salía a mitad de precio. Con el suelo de
// House en 180€ eso son 15€ por plaza y noche — precio de hostal para una casa de 290 m².
//
// EL FACTOR NO ESTÁ INVENTADO: se midió sobre `market_rates` comparando el p50 de la MISMA fecha con
// aforos distintos (única comparación honesta; entre fechas distintas manda la temporada, no el aforo).
//   · House 8 plazas vs Dúplex 4 plazas — 12 fechas independientes: ratio medio 2,20 al DOBLAR plazas.
//   · House 12 plazas vs Luxury 5 plazas — 2 fechas: ratio medio 2,52 para 2,4× plazas.
// Ajustando (plazas_piso/plazas_comp)^k sale k ≈ 1,14 y k ≈ 1,06. Se toma k = 1,1: casi lineal, un
// pelo por encima (una casa grande rinde algo más por plaza que un apartamento pequeño, porque el
// mercado de grupos tiene menos oferta). Validación cruzada: los comps de 8 plazas de House dan un p50
// de 319€ → ×1,58 = 504€, y el precio vivo real de House en Smoobu está en 450-522€.
export const ELASTICIDAD_AFORO = 1.1

// ⚠️ QUÉ PROTEGE DE VERDAD ESTE FACTOR, Y QUÉ NO (medido 03/09/2026, no supuesto).
//
// `market_rates.guests` NO es el aforo del comparable: es el aforo con el que SE BUSCÓ. Y la rutina
// de mercado busca siempre con el `max_guests` del propio piso, así que en el corpus vivo
// `factorAforo(z.max_guests, m.guests)` sale **1,000 en el 97,1% de las filas** (11.248 de 11.582) y
// solo difiere en **5** filas del corpus fiable. En la práctica, hoy, este factor NO mueve nada.
//
// Eso NO es una avería, y conviene no "arreglarlo": la homogeneidad de aforo no la da este factor,
// la da la BÚSQUEDA. Al pedirle a Booking alojamientos para 12 personas, lo que vuelve son sitios
// que duermen a 12 — ya son comparables, y por eso el factor correcto es 1. Las filas donde sí
// difiere son las del barrido antiguo, que se buscó con otro aforo (House a 8 y 9, Luxury a 4): ahí
// el factor sigue haciendo el trabajo para el que se midió y por eso se conserva.
//
// 🚨 Lo que este factor NO puede hacer, y que ninguna otra pieza hace tampoco: distinguir el tamaño
// REAL de dos comparables devueltos por la MISMA búsqueda. En una búsqueda para 12, un piso que
// duerme a 12 y otro que duerme a 16 entran los dos, al mismo peso. El portal no publica la
// capacidad por resultado y el conector no la devuelve, así que no hay dato con el que corregirlo
// — no es que esté pendiente, es que la fuente no lo trae. Antes de escribir en cualquier sitio que
// "los comparables están normalizados por aforo", léase este párrafo: lo están por la búsqueda, no
// por una medición del comparable.

// Cotas de seguridad: por muy dispar que sea el aforo, no multiplicamos ni dividimos sin freno.
export const FACTOR_MIN = 0.6
export const FACTOR_MAX = 2.5

// Muestra mínima para fiarse de los comps de un aforo concreto.
export const MUESTRA_MINIMA = 8

/**
 * Cuánto vale un piso de `plazasPiso` frente a comps de `plazasComp`.
 * Devuelve 1 si falta algún dato o si el aforo coincide (caso normal: no toca nada).
 */
export function factorAforo(plazasPiso: number | null | undefined, plazasComp: number | null | undefined): number {
  const piso = Number(plazasPiso)
  const comp = Number(plazasComp)
  if (!Number.isFinite(piso) || !Number.isFinite(comp) || piso <= 0 || comp <= 0) return 1
  if (piso === comp) return 1
  const bruto = Math.pow(piso / comp, ELASTICIDAD_AFORO)
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, bruto))
}

export type MuestraAforo = { guests: number; n: number }

/**
 * Decide contra qué aforo tarificar y con qué corrección.
 *
 * Prefiere SIEMPRE los comps del aforo exacto del piso cuando tienen muestra suficiente (factor 1).
 * Si no, coge el aforo con más muestra y devuelve el factor que lo corrige — declarando `exacto:false`
 * para que quien lo use sepa que está extrapolando. Sin muestras devuelve factor 1 y `exacto:false`:
 * el motor debe seguir con su bucket global, nunca inventarse un precio.
 */
export function elegirAforo(
  muestras: MuestraAforo[],
  plazasPiso: number | null | undefined,
  muestraMinima: number = MUESTRA_MINIMA,
): { guests: number | null; factor: number; exacto: boolean } {
  const piso = Number(plazasPiso)
  const validas = (muestras ?? []).filter((m) => Number.isFinite(m?.guests) && m.guests > 0 && m.n > 0)
  if (!validas.length) return { guests: null, factor: 1, exacto: false }

  const exacta = Number.isFinite(piso) ? validas.find((m) => m.guests === piso && m.n >= muestraMinima) : undefined
  if (exacta) return { guests: exacta.guests, factor: 1, exacto: true }

  // Sin aforo exacto utilizable: el aforo con más muestra manda, corregido por capacidad.
  const mejor = [...validas].sort((a, b) => b.n - a.n || Math.abs(a.guests - piso) - Math.abs(b.guests - piso))[0]
  return { guests: mejor.guests, factor: factorAforo(piso, mejor.guests), exacto: false }
}
