import type { PuntoPrecio } from './precios-stooq'

// Reglas de SALIDA simuladas sobre la serie diaria (hipótesis H9 del pre-registro, 04/08/2026).
// Módulo PURO y testeado — sin `@/`, sin Prisma, sin red.
//
// Por qué existe: TODO lo medido hasta hoy sale por TIEMPO (retorno a 28/56/91 días) y ninguna
// regla de VENTA tiene ni una observación — el hueco que señaló Alberto («vender igual de
// importante»). Aquí se simula, punto-en-el-tiempo, qué habría devuelto la MISMA entrada bajo tres
// reglas clásicas de salida, para compararlas contra la salida por tiempo (el `ret91` que ya se
// guarda al lado en el retrovisor). NO decide nada: se recolecta, y H9 fija por adelantado qué
// tendría que salir para cablear una regla.
//
// ⚠️ Solo hay CIERRES diarios (la fuente no trae intradía): un stop que en la realidad saltaría a
// media sesión aquí salta en el primer CIERRE que lo perfora, y se «vende» a ese cierre — no al
// precio exacto del stop. Eso infravalora el nº de disparos y captura el hueco a la baja (si el
// valor abre un −30%, el stop del −10% ejecuta a −30%, como pasaría de verdad con un stop de
// mercado). Es la simulación conservadora y queda firmada así en H9.

export type SalidasSimuladas = {
  // Retorno de la operación si la salida la gobierna cada regla. TRES estados, nunca dos:
  // null = «no se puede saber» (sin precio de entrada, o la ventana aún no llegó al horizonte y la
  // regla no había saltado — típico de los snapshots más recientes). Nunca un 0 de relleno.
  salidaStop10: number | null   // stop fijo: vende en el primer cierre ≤ entrada × 0,90
  salidaStop20: number | null   // stop fijo: vende en el primer cierre ≤ entrada × 0,80
  salidaTrail15: number | null  // trailing: vende en el primer cierre ≤ máximo-desde-entrada × 0,85
  // ── H10 (firmada 28/08/2026): «ir subiendo el stop» a otra distancia, y «pérdida de media».
  // H9 refutó el trailing −15%, pero probó UNA sola distancia y NINGUNA regla de medias.
  salidaTrail25: number | null  // trailing ANCHO: primer cierre ≤ máximo-desde-entrada × 0,75
  salidaCoste10: number | null  // stop a COSTE: sin stop hasta tocar +10%; después, primer cierre ≤ entrada
  salidaSma50: number | null    // pérdida de media: primer cierre < SMA50 diaria
  salidaSma200: number | null   // pérdida de media larga: primer cierre < SMA200 diaria
}

const SIN_DATOS: SalidasSimuladas = {
  salidaStop10: null, salidaStop20: null, salidaTrail15: null,
  salidaTrail25: null, salidaCoste10: null, salidaSma50: null, salidaSma200: null,
}

const sumarDias = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// Simula las tres salidas para una entrada en `fecha` con horizonte de `dias`. La entrada es el
// último cierre ≤ fecha y el cierre del horizonte es el PRIMER cierre ≥ fecha+dias — los mismos
// criterios exactos que `precioEn`/`retornoForward`, para que la comparación con ret91 sea
// manzana-con-manzana. Si una regla no salta y la serie llega al horizonte, su retorno ES el del
// horizonte (no vender también es una decisión, y su resultado se contabiliza).
export function simularSalidas(puntos: PuntoPrecio[], fecha: string, dias = 91): SalidasSimuladas {
  let entrada: number | null = null
  for (const p of puntos) {
    if (p.fecha > fecha) break
    entrada = p.cierre
  }
  if (entrada == null || entrada <= 0) return SIN_DATOS

  const objetivo = sumarDias(fecha, dias)
  const out: SalidasSimuladas = { ...SIN_DATOS }
  let pico = entrada
  let horizonte: number | null = null
  // Ventana móvil de cierres HASTA el día que se simula (nunca la serie entera): una SMA calculada
  // con precios futuros convertiría H10 en look-ahead puro. Se arranca con lo anterior a la entrada,
  // que sí se conocía, y se va empujando día a día.
  const previos = puntos.filter(p => p.fecha <= fecha).map(p => p.cierre)
  const mediaDe = (n: number) =>
    previos.length < n ? null : previos.slice(-n).reduce((a, b) => a + b, 0) / n
  let armadoCoste = false   // ¿ha tocado ya el +10% que arma el stop a coste?

  for (const p of puntos) {
    if (p.fecha <= fecha) continue
    if (p.fecha >= objetivo) { horizonte = p.cierre / entrada - 1; break }
    const r = p.cierre / entrada - 1
    // Las medias se leen ANTES de meter el cierre de hoy en la ventana: se compara el cierre contra
    // la media de los días previos, que es la que un operador tendría delante al decidir.
    const sma50 = mediaDe(50)
    const sma200 = mediaDe(200)
    if (out.salidaStop10 == null && p.cierre <= entrada * 0.90) out.salidaStop10 = r
    if (out.salidaStop20 == null && p.cierre <= entrada * 0.80) out.salidaStop20 = r
    if (out.salidaTrail15 == null) {
      if (p.cierre > pico) pico = p.cierre
      else if (p.cierre <= pico * 0.85) out.salidaTrail15 = r
    }
    // `pico` lo mantiene el bloque de arriba (mismo máximo-desde-entrada para las dos distancias);
    // por eso trail25 se evalúa DESPUÉS y solo lee.
    if (out.salidaTrail25 == null && p.cierre <= pico * 0.75) out.salidaTrail25 = r
    if (out.salidaCoste10 == null) {
      if (!armadoCoste && p.cierre >= entrada * 1.10) armadoCoste = true
      else if (armadoCoste && p.cierre <= entrada) out.salidaCoste10 = r
    }
    if (out.salidaSma50 == null && sma50 != null && p.cierre < sma50) out.salidaSma50 = r
    if (out.salidaSma200 == null && sma200 != null && p.cierre < sma200) out.salidaSma200 = r
    previos.push(p.cierre)
  }

  // La ventana llegó al final: lo no vendido sale por tiempo. Si NO llegó (snapshot reciente),
  // los disparos ya ocurridos se conservan —son un hecho— y el resto queda en null, coherente con
  // el ret91 null de ese mismo snapshot.
  if (horizonte != null) {
    if (out.salidaStop10 == null) out.salidaStop10 = horizonte
    if (out.salidaStop20 == null) out.salidaStop20 = horizonte
    if (out.salidaTrail15 == null) out.salidaTrail15 = horizonte
    if (out.salidaTrail25 == null) out.salidaTrail25 = horizonte
    if (out.salidaCoste10 == null) out.salidaCoste10 = horizonte
    // SMA sin suficientes cierres previos (símbolo joven, serie corta) → la regla NO se pudo
    // evaluar. Rellenar con el horizonte diría «no vendió» de algo que nunca se pudo mirar: es el
    // NULL de «no se sabe», y así se queda (regla del monorepo: dato que no hay ≠ dato que no se miró).
    if (out.salidaSma50 == null && previos.length >= 50) out.salidaSma50 = horizonte
    if (out.salidaSma200 == null && previos.length >= 200) out.salidaSma200 = horizonte
  }
  return out
}
