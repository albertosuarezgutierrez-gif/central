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

// ¿Sirve lo que ha traído la 2ª fuente para contrastar el precio de `hoy`? SOLO si su cierre más
// reciente es de la MISMA sesión. El acarreo de red vive en `precios-contraste.ts`; la decisión está
// aquí porque es lo que hay que poder testear.
//
// Hasta el 10/08/2026 se aceptaba cualquier cierre de los últimos 5 días naturales: se cogía el último
// con fecha <= hoy y se usaba COMO SI fuera el de hoy. El lunes 10/08 la pasada corrió a las 20:33
// UTC, media hora después del cierre de Wall Street; Stooq/Yahoo todavía publicaban el cierre del
// VIERNES 07/08, y la guardia leyó el hueco del fin de semana de cada valor como «desacuerdo con la 2ª
// fuente»: 8 de 21 símbolos vetados en `/analizar` (CVX +4,5%, SPOT +4,9%, LLY +3,9%…) y 5 precios
// descartados en `/puntuar`. Ninguno estaba mal. El signo de cada «divergencia» era, uno a uno, el
// movimiento viernes→lunes de esa acción.
//
// Es el mismo error que persigue todo este módulo, cometido por la propia guardia: un dato REAL leído
// con el periodo equivocado. Que la fecha no cuadre con la sesión no vuelve el contraste más flojo —
// lo vuelve un contraste de OTRA cosa, y por eso `desfasado` no veta: es un «no lo sé».
//
// Consecuencia asumida: a la hora a la que corre la pasada la fuente casi nunca tendrá el cierre del
// día, así que el contraste queda inerte la mayoría de las noches. Eso hay que CANTARLO
// (`resumenDesfase`), no esconderlo: una guardia inerte y callada se confunde con una que aprueba. La
// regla es correcta por construcción y se enciende sola en cuanto la fuente publique a tiempo o la
// pasada se mueva de hora.

export type PuntoContraste = { fecha: string; cierre: number }

export type Veredicto =
  | { estado: 'vale'; fecha: string; cierre: number }
  | { estado: 'desfasado'; fecha: string; cierre: number }
  | { estado: 'sin-dato' }

export type Desfasado = { simbolo: string; fecha: string; cierre: number }

export function juzgarPuntos(puntos: PuntoContraste[], hoy: string): Veredicto {
  let ultimo: PuntoContraste | null = null
  for (const p of puntos) {
    if (p.fecha > hoy) break     // nunca se contrasta contra el futuro
    ultimo = p
  }
  if (!ultimo) return { estado: 'sin-dato' }
  if (ultimo.fecha !== hoy) return { estado: 'desfasado', fecha: ultimo.fecha, cierre: ultimo.cierre }
  return { estado: 'vale', fecha: ultimo.fecha, cierre: ultimo.cierre }
}

// Una línea para el latido/Telegram cuando la 2ª fuente va por detrás. Vacía si no hay desfase: el
// parte solo debe hablar de lo que ha pasado.
export function resumenDesfase(desfasados: Desfasado[]): string {
  if (desfasados.length === 0) return ''
  const fechas = [...new Set(desfasados.map(d => d.fecha))].sort()
  const cual = fechas.length === 1 ? fechas[0] : `${fechas[0]}…${fechas[fechas.length - 1]}`
  return `2ª fuente aún sin el cierre de hoy (${desfasados.length} símbolo(s) con dato de ${cual}): sin contrastar, no vetado`
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

// Cercanía a partir de la cual se considera que un precio «es» el de otro símbolo.
//
// 🚨 Este umbral se MIDIÓ contra el corpus real (08/08/2026), y el resultado invierte la intuición: el
// 3% con el que nació la guardia era el PEOR valor posible de los probados. Barriendo todas las pasadas
// limpias del corpus (17/07→06/08, 16 símbolos) y contando cuántos precios BUENOS habría vetado:
//
//     umbral    3%    5%    6%    8%   10%   12%
//     falsos     6     4     2     2     0     0     ← cada uno = un día perdido de un símbolo
//     ¿caza META←LLY?  no*  sí    sí    sí    sí    sí
//     (*) lo cazaba con la referencia de 31/07 por 0,1 pp de margen; con la del 06/08 ya NO.
//
// Los falsos positivos BAJAN al ampliar el umbral porque la regla exige las dos cosas a la vez: que el
// precio esté LEJOS de su propia referencia Y CERCA de la de otro. Ampliar el umbral endurece mucho más
// la primera condición (un símbolo que se movió un 6% pasa a «cuadra consigo mismo» y ni se examina) de
// lo que relaja la segunda. Por eso 10% DOMINA a 3%: cero falsos positivos Y caza el envenenamiento con
// margen. No es un equilibrio entre sensibilidad y ruido — el 3% era sencillamente un error.
//
// ⚠️ LÍMITE QUE NINGÚN UMBRAL ARREGLA, encontrado en la misma prueba: si dos símbolos cotizan al MISMO
// nivel, intercambiarlos es invisible para esta regla — el precio ajeno cuadra con la referencia propia
// y no se examina. Hoy mismo pasa con MSFT (487,46) y SPOT (482,23), a un 1,1%: son justo los dos que se
// barajaron el 17/07 y hoy no se detectarían. Eso solo lo ve el contraste con la 2ª fuente. Dicho aquí
// para que nadie suba el umbral creyendo que cierra ese hueco: no lo cierra, es de otra naturaleza.
export const CRUCE_TOLERANCIA = 0.10

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
