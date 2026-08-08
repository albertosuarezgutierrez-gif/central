// Guardia de cordura de los precios que la pasada de trading manda a `/api/trading/puntuar`.
//
// 🚨 LANDMINE FUNDACIONAL (08/08/2026) — el track record se envenenó con UN dato. El 03/08 la pasada
// mandó `CVX = 590,17` cuando Chevron cerró a 193,18 (contrastado contra IBKR): un ×3,06. El endpoint
// cogía `precios[simbolo]` tal cual, sin preguntarse nada, así que ese número:
//   · fue el `precio_ref` de las tesis de CVX de ese día (tesis construidas sobre un precio falso), y
//   · fue el `precio_despues` con el que se puntuaron 12 tesis ya vencidas → tres de ellas a +205 pp.
// Efecto en las estadísticas por estrategia, que son el walk-forward del que depende desplegar dinero
// real: «momentum alcista» pasaba de +0,91 pp a **+88,09 pp** de media, y «reversión bajista» cambiaba
// de SIGNO (−21,08 pp con el dato malo, +2,01 pp sin él). Un solo precio daba la vuelta al veredicto.
//
// Es el hermano diario del `serieDiscontinua` de `velas.ts` y la misma lección del PR #1189 (ORCL): un
// número plausible no delata nada por sí solo, hay que contrastarlo contra lo que ya se sabía.
//
// Tres estados, como manda la regla del repo:
//   · sin referencia reciente del símbolo → **no se juzga** y el precio pasa. No saber si el salto es
//     raro NO autoriza a descartar un dato bueno (un símbolo nuevo no tiene con qué compararse).
//   · referencia + salto dentro de rango → el precio se usa.
//   · referencia + salto fuera de rango → se DESCARTA. La tesis se queda sin puntuar (pendiente), que
//     es un «todavía no lo sé» recuperable en la pasada siguiente; un +205 pp falso no se recupera:
//     se cuela en las stats y decide.
//
// Un split/contrasplit sin ajustar cae aquí a propósito: el precio es real pero el RETORNO que saldría
// de cruzarlo con un `precio_ref` pre-split es ficticio, así que tampoco se debe puntuar a ciegas.

// Salto máximo de un día contra la última referencia conocida. Más estricto que el ×3 de
// `SALTO_PRECIO_MAX` (velas.ts) porque aquel mide barras mensuales/semanales y esto es un día suelto.
export const SALTO_PRECIO_DIA_MAX = 2

// Antigüedad máxima de la referencia. Con un hueco mayor (símbolo que lleva semanas fuera de la
// watchlist) un ×2 ya puede ser movimiento legítimo y la comparación dejaría de significar nada.
export const DIAS_REFERENCIA_MAX = 10

export type PrecioDescartado = {
  simbolo: string
  precio: number
  referencia: number | null   // null = el precio es inválido de por sí (≤0 o no finito)
  ratio: number | null
  motivo: string
}

export type FiltroPrecios = {
  limpios: Record<string, number>
  descartados: PrecioDescartado[]
}

// Separa los precios usables de los que no superan la guardia. `referencias` = último precio conocido
// por símbolo ANTERIOR a la fecha de la pasada (nunca el de hoy: si la pasada viene envenenada, el
// precio de hoy está envenenado en las dos puntas y la comparación se validaría a sí misma).
export function filtrarPreciosAnomalos(
  precios: Record<string, number>,
  referencias: Record<string, number>,
  saltoMax = SALTO_PRECIO_DIA_MAX,
): FiltroPrecios {
  const limpios: Record<string, number> = {}
  const descartados: PrecioDescartado[] = []

  for (const [simbolo, precio] of Object.entries(precios)) {
    if (!Number.isFinite(precio) || precio <= 0) {
      descartados.push({ simbolo, precio, referencia: null, ratio: null, motivo: 'precio no positivo o no finito' })
      continue
    }
    const referencia = referencias[simbolo]
    if (!Number.isFinite(referencia) || !(referencia > 0)) {
      limpios[simbolo] = precio   // sin con qué comparar: no se juzga
      continue
    }
    const ratio = precio / referencia
    if (ratio >= saltoMax || ratio <= 1 / saltoMax) {
      descartados.push({
        simbolo, precio, referencia, ratio,
        motivo: `×${ratio.toFixed(2)} sobre la última referencia (${referencia})`,
      })
      continue
    }
    limpios[simbolo] = precio
  }

  return { limpios, descartados }
}

// Resumen de una línea para el latido y el aviso. Cadena vacía si no se descartó nada — así el que la
// consume no tiene que acordarse de comprobarlo.
export function resumenDescartes(descartados: PrecioDescartado[]): string {
  if (descartados.length === 0) return ''
  const lista = descartados.map(d => `${d.simbolo} ${d.precio} (${d.motivo})`).join(' · ')
  return `${descartados.length} precio(s) descartado(s): ${lista}`
}

// ---------------------------------------------------------------------------
// SEGUNDO PAR DE OJOS: contraste contra una fuente independiente
// ---------------------------------------------------------------------------
//
// La guardia de arriba compara el precio con el de AYER del mismo símbolo, así que solo caza lo
// escandaloso: un ×2 en un día. Un error del 10% pasa limpio, porque un 10% diario es un movimiento
// real perfectamente posible — no hay forma de distinguirlo mirando una sola fuente. Y un 10% mal
// medido en `precio_ref` mueve el retorno de la tesis 10 puntos: el mismo daño del CVX de 590,17,
// solo que sin gritar. Lo único que lo delata es preguntarle el MISMO día a alguien distinto.
//
// El servidor ya tiene esa segunda fuente y es gratis: `precios-stooq.ts` (Stooq con respaldo Yahoo).
//
// La comparación es válida solo si ambos hablan del MISMO cierre. La pasada nocturna corre a las
// 06:30 UTC, con el mercado de EEUU cerrado, así que el «último» de IBKR y el último cierre de Stooq
// son la misma sesión. Si la pasada se lanza a mano con el mercado ABIERTO, IBKR da precio vivo y
// Stooq el cierre anterior: divergerán en cualquier valor que se mueva, y descartar es lo correcto
// —mezclar un precio intradía con un corpus de cierres es exactamente el error de periodo que este
// repo ya ha pagado dos veces—. Por eso las divergencias se reportan enteras: si un día salen muchas,
// el dato a mirar es a qué hora corrió la pasada, no el umbral.

// Desvío máximo tolerado entre las dos fuentes. Por encima, ninguna de las dos es «la buena»: es que
// no se sabe cuál lo es, y eso es un «no lo sé», no un precio.
export const DIVERGENCIA_MAX = 0.02

export type Divergencia = {
  simbolo: string
  precio: number
  contraste: number
  desvio: number      // (precio − contraste) / contraste, con signo
}

export type Contraste = {
  conformes: Record<string, number>
  divergentes: Divergencia[]
  sinContraste: string[]   // la segunda fuente no dio dato: NO se juzga, el precio pasa
}

// Contrasta cada precio con el de la fuente independiente. Tres estados, igual que el resto:
// sin contraste → pasa sin juzgar · dentro de tolerancia → conforme · fuera → divergente (se cae).
export function contrastarFuentes(
  precios: Record<string, number>,
  contraste: Record<string, number>,
  maxDesvio = DIVERGENCIA_MAX,
): Contraste {
  const conformes: Record<string, number> = {}
  const divergentes: Divergencia[] = []
  const sinContraste: string[] = []

  for (const [simbolo, precio] of Object.entries(precios)) {
    const ref = contraste[simbolo]
    if (!Number.isFinite(ref) || !(ref > 0)) {
      conformes[simbolo] = precio
      sinContraste.push(simbolo)
      continue
    }
    const desvio = (precio - ref) / ref
    if (Math.abs(desvio) > maxDesvio) {
      divergentes.push({ simbolo, precio, contraste: ref, desvio })
      continue
    }
    conformes[simbolo] = precio
  }

  return { conformes, divergentes, sinContraste }
}

// Resumen de una línea. Cadena vacía si no hay divergencias — el consumidor no tiene que comprobarlo.
export function resumenDivergencias(divergentes: Divergencia[]): string {
  if (divergentes.length === 0) return ''
  const lista = divergentes
    .map(d => `${d.simbolo} ${d.precio} vs ${d.contraste} (${(d.desvio * 100).toFixed(1)}%)`)
    .join(' · ')
  return `${divergentes.length} precio(s) en desacuerdo con la 2ª fuente: ${lista}`
}

// ---------------------------------------------------------------------------
// El MISMO problema, un número distinto: el NAV
// ---------------------------------------------------------------------------
//
// `/api/trading/saldo` recibe el patrimonio del bróker de la sesión y solo comprobaba que fuera un
// número finito. Con él se dimensiona cada posición (`dimensionar(nav, …)`) y se mide la
// concentración, así que un NAV con un cero de más multiplica el tamaño de todas las compras.
//
// Aquí NO se puede descartar como con un precio: un salto grande puede ser un ingreso o una retirada
// de Alberto, que es dinero real y debe quedar registrado. Bloquearlo congelaría el seguimiento. Pero
// callarlo tampoco vale, porque las dos explicaciones —ingreso o error de lectura— son indistinguibles
// desde el servidor y solo Alberto sabe cuál es. Así que se registra SIEMPRE y se avisa: la decisión
// es suya, y el aviso es lo que convierte un dato raro en una pregunta en vez de en un hecho.

export const SALTO_NAV_AVISO = 0.15

export type SaltoSaldo = { avisa: boolean; variacion: number | null }

// `variacion` = (nuevo − anterior) / anterior. Sin anterior no hay nada que comparar (primer saldo):
// no se avisa, que es distinto de «no ha cambiado».
export function saltoDeSaldo(nuevo: number, anterior: number | null, umbral = SALTO_NAV_AVISO): SaltoSaldo {
  if (anterior == null || !Number.isFinite(anterior) || anterior <= 0) return { avisa: false, variacion: null }
  const variacion = (nuevo - anterior) / anterior
  return { avisa: Math.abs(variacion) > umbral, variacion }
}
