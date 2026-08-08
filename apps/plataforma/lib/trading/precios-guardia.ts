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
// SUPLANTACIÓN: el precio es real, pero es de OTRA empresa
// ---------------------------------------------------------------------------
//
// 🚨 LANDMINE (08/08/2026, auditoría del corpus) — las dos guardias de arriba dan por hecho que el
// precio que llega bajo la etiqueta `AAPL` intenta ser el de Apple, y solo discuten si el NÚMERO es
// creíble. El fallo real que ha vivido este repo es otro y peor: el número es PERFECTAMENTE creíble
// porque es un cierre de verdad — solo que de otra compañía. Verificado contra IBKR:
//
//   17/07/2026  META←MSFT (393,82) · MSFT←SPOT (478,14) · SPOT←NFLX (68,95) · NFLX←LLY (1179,11)
//   03/08/2026  LLY←CVX (193,18) · META←LLY (1121,09)
//   04/08/2026  NFLX←PLTR (162,61)
//
// El origen está fuera del servidor: la sesión pide los `get_price_history` de los ~13 símbolos en
// paralelo y los resultados NO vuelven en el orden en que se pidieron, así que transcribirlos por
// posición los baraja. El protocolo de la skill ya lo prohibía desde el 04/08 y aun así volvió a
// pasar el mismo día — por eso esto no puede seguir siendo una regla de disciplina del que llama:
// tiene que ser una comprobación del que recibe.
//
// Dos firmas distintas, porque el barajado se manifiesta de dos maneras:
//
//  1) DUPLICADO en la misma pasada. Si dos símbolos traen exactamente el mismo número, uno de los dos
//     copió al otro (17/07: NFLX y LLY a 1179,11 — 04/08: NFLX y PLTR a 162,61). No hace falta
//     histórico, y por eso es la ÚNICA que funciona en la primera pasada de un símbolo, que es
//     justamente cuando no hay con qué comparar. Dos cierres reales al mismo céntimo el mismo día
//     existen, pero son mucho más raros que este bug: se vetan los dos y mañana se recupera.
//
//  2) CRUCE contra las referencias. El precio no cuadra con lo que ese símbolo valía ayer, pero cuadra
//     con lo que valía OTRO. Es la firma del 03/08 y la que sobrevive aunque los números no coincidan
//     al céntimo (LLY se movió un 2,9% entre su referencia y el valor que acabó en META).
//
// Se exige que el símbolo TENGA referencia propia y que esa referencia discrepe: sin referencia no se
// sabe, y no saber no autoriza a vetar (misma regla de tres estados que el resto del archivo). El
// hueco que deja —símbolo estrenándose Y suplantado sin duplicar a nadie— lo cubre el contraste con
// la 2ª fuente, que no depende de nada de esto.

// Cercanía a partir de la cual se considera que un precio «es» el de otro símbolo. Tiene que ser más
// ancha que un día de mercado: el valor suplantado es el cierre de HOY del culpable y la referencia
// con la que se compara es su cierre de AYER, así que entre medias cabe su movimiento diario (el caso
// META←LLY del 03/08 fue del 2,9% y con un umbral más fino se habría escapado).
export const CRUCE_TOLERANCIA = 0.03

export type Suplantacion = {
  simbolo: string
  precio: number
  propia: number | null    // su propia referencia; null = no tenía (solo puede pasar en el caso duplicado)
  culpable: string         // el símbolo del que parece venir el precio
  motivo: string
}

export type Suplantaciones = {
  limpios: Record<string, number>
  suplantados: Suplantacion[]
}

function cerca(a: number, b: number, tol: number): boolean {
  return b > 0 && Math.abs(a / b - 1) <= tol
}

// Detecta precios que pertenecen a otro símbolo. `referencias` = mismo mapa que `filtrarPreciosAnomalos`
// (último `precio_ref` conocido ANTERIOR a la pasada, por símbolo).
export function detectarSuplantaciones(
  precios: Record<string, number>,
  referencias: Record<string, number>,
  tol = CRUCE_TOLERANCIA,
): Suplantaciones {
  const entradas = Object.entries(precios)
  const sospechosos = new Map<string, Suplantacion>()

  // 1) Duplicados exactos dentro de la propia pasada.
  const porPrecio = new Map<number, string[]>()
  for (const [simbolo, precio] of entradas) {
    if (!Number.isFinite(precio)) continue
    porPrecio.set(precio, [...(porPrecio.get(precio) ?? []), simbolo])
  }
  for (const [precio, simbolos] of porPrecio) {
    if (simbolos.length < 2) continue
    for (const simbolo of simbolos) {
      const propia = referencias[simbolo]
      sospechosos.set(simbolo, {
        simbolo, precio,
        propia: Number.isFinite(propia) ? propia : null,
        culpable: simbolos.filter(s => s !== simbolo).join('+'),
        motivo: `precio idéntico al de ${simbolos.filter(s => s !== simbolo).join(', ')} en la misma pasada`,
      })
    }
  }

  // 2) Cruce: cuadra con la referencia de otro y NO con la suya.
  for (const [simbolo, precio] of entradas) {
    if (sospechosos.has(simbolo) || !Number.isFinite(precio) || precio <= 0) continue
    const propia = referencias[simbolo]
    if (!Number.isFinite(propia) || !(propia > 0)) continue   // sin referencia propia no se juzga
    if (cerca(precio, propia, tol)) continue                  // cuadra consigo mismo: nada que discutir
    const culpable = Object.keys(referencias).find(
      otro => otro !== simbolo && cerca(precio, referencias[otro], tol),
    )
    if (!culpable) continue
    sospechosos.set(simbolo, {
      simbolo, precio, propia, culpable,
      motivo: `no cuadra con su referencia (${propia}) pero sí con la de ${culpable} (${referencias[culpable]})`,
    })
  }

  const limpios: Record<string, number> = {}
  for (const [simbolo, precio] of entradas) if (!sospechosos.has(simbolo)) limpios[simbolo] = precio
  return { limpios, suplantados: [...sospechosos.values()] }
}

// Resumen de una línea. Cadena vacía si no hay nada — el consumidor no tiene que comprobarlo.
export function resumenSuplantaciones(suplantados: Suplantacion[]): string {
  if (suplantados.length === 0) return ''
  const lista = suplantados.map(s => `${s.simbolo} ${s.precio} (${s.motivo})`).join(' · ')
  return `${suplantados.length} precio(s) que parecen de otro símbolo: ${lista}`
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
