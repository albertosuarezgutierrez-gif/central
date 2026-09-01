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
// CONTRASTE DIFERIDO: la 2ª fuente llega tarde, así que se juzga el AYER
// ---------------------------------------------------------------------------
//
// La regla de arriba deja el contraste inerte casi todas las noches: la pasada corre a las 20:30 UTC y
// la fuente todavía no ha publicado el cierre del día. Pero SÍ tiene el de la sesión anterior — y de esa
// sesión nosotros ya guardamos nuestro propio `precio_ref`. Contrastar eso no depende de que nadie
// publique a tiempo: el par (cierre de la fuente de la sesión D, nuestro `precio_ref` de D) está siempre
// disponible una sesión más tarde.
//
// Cambia el REMEDIO, no la pregunta: no se veta el precio de hoy (que sigue sin segunda opinión), se
// anula la tesis de ayer, que es lo que de verdad envenena — porque `trading_estrategia_stats` se
// recalcula sobre los resultados y `ajustesDeStats` los convierte en delta de confianza del torneo.
// Decisión de Alberto (11/08/2026) entre esto y un cron aparte unas horas después de la pasada.
//
// Las dos trampas que hacen que esto NO se pueda escribir como un simple «desvía >2% ⇒ anular»:
//
//  1. UN SPLIT NO ES UN PRECIO MALO. La fuente publica el histórico AJUSTADO; nuestro `precio_ref` es el
//     precio sin ajustar del día en que se guardó. Tras un split (o un dividendo extraordinario), TODAS
//     las sesiones anteriores de ese símbolo divergen a la vez y por el MISMO factor. Un precio
//     envenenado, en cambio, es de UNA sesión suelta. Por eso el juicio es por símbolo y mira la FORMA
//     del desvío, no su tamaño: si todas las sesiones de la ventana divergen con el mismo factor, es un
//     reescalado y no se anula nada — se reporta.
//  2. UN FALLO GLOBAL DE LA FUENTE NO ES UN CORPUS ENVENENADO. Si la fuente cambia de base de ajuste o
//     devuelve otra divisa, medio universo diverge de golpe. Anular en bloque el track record por lo que
//     dice una fuente que acaba de cambiar debajo de nosotros es exactamente el error que este módulo
//     existe para evitar, con el signo cambiado. Interruptor: si más de la mitad de los símbolos con dato
//     salen sospechosos, no se anula nada y se avisa.

export const REESCALADO_TOL = 0.01        // dispersión máxima entre factores para llamarlo reescalado
export const SOSPECHA_MASIVA = 0.5        // fracción de símbolos a partir de la cual no se anula nada
// El interruptor de arriba necesita una muestra para significar algo: con uno o dos símbolos, «más de la
// mitad diverge» es la descripción de un caso normal (un único precio envenenado), no la firma de una
// fuente rota. Sin este mínimo el interruptor se dispara SIEMPRE que el corpus es pequeño y la guardia
// entera queda desactivada en silencio — se descubrió porque los tres tests del caso fundacional
// devolvían cero sospechosas.
export const MIN_SIMBOLOS_MASIVA = 4

// Tercer freno: nuestro `precio_ref` con la ETIQUETA de otra sesión.
//
// Una pasada que corre ANTES del cierre de Wall Street guarda, bajo la fecha de hoy, el cierre de la
// sesión ANTERIOR — que es el último que existe cuando se le pregunta. No es un precio malo: es un
// precio bueno con la etiqueta corrida un día. Verificado contra IBKR el 12/08/2026 sobre el repaso
// manual del 06/08 (09:34 UTC, con el mercado aún cerrado): MSFT quedó con `precio_ref` 487,46 cuando
// el cierre real del 06/08 fue 499,86 — **−2,48%, por encima del umbral del 2%**, así que el contraste
// diferido habría anulado esas tesis. Y 487,46 es, al céntimo, el cierre del 05/08. Lo mismo en CVX
// (186,41 el 06/08 = cierre exacto del 05/08; ahí el desvío se quedó en −1,49% y no llegó a saltar por
// pura suerte del mercado).
//
// La firma es inconfundible y no necesita saber nada de husos horarios ni de a qué hora corrió la
// pasada: el ref se parece al cierre de la sesión ANTERIOR mucho más de lo que se parece al de la suya.
// Un precio envenenado no se parece a ninguno de los dos (CVX 590,17 no era ni el cierre del 03/08 ni
// el del 31/07). Cuando aparece esta firma NO se anula: se declara no juzgable y se canta — es la regla
// de tres estados otra vez, y es la misma lección que persigue el módulo entero, aplicada a nuestro
// propio corpus: la clave de un dato es su periodo, no la etiqueta con la que se guardó.
export const ETIQUETA_TOL = 0.005

export type ParDiferido = {
  fecha: string
  fuente: number
  propio: number
  // Cierre que la fuente publica para la sesión ANTERIOR a `fecha`. `null` cuando no hay sesión previa
  // en la ventana consultada: sin ella no se puede distinguir la etiqueta corrida, y se juzga igual.
  fuentePrevia?: number | null
}
export type Sospecha = { simbolo: string; fecha: string; fuente: number; propio: number; desvio: number }
export type Reescalado = { simbolo: string; factor: number; sesiones: number }
export type Etiquetada = { simbolo: string; fecha: string; propio: number; cierrePrevio: number }

export type Diferido = {
  sospechosas: Sospecha[]
  reescalados: Reescalado[]
  etiquetadas: Etiquetada[]   // ref bueno con la fecha corrida: no se juzga ni se anula
  simbolosConDato: number
  masiva: boolean          // true = se sospecha de la FUENTE, no del corpus: no se ha anulado nada
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function juzgarDiferido(
  porSimbolo: Record<string, ParDiferido[]>,
  maxDesvio = DIVERGENCIA_MAX,
  tolReescalado = REESCALADO_TOL,
  umbralMasiva = SOSPECHA_MASIVA,
  tolEtiqueta = ETIQUETA_TOL,
): Diferido {
  const sospechosas: Sospecha[] = []
  const reescalados: Reescalado[] = []
  const etiquetadas: Etiquetada[] = []
  let simbolosConDato = 0
  const conSospecha = new Set<string>()

  for (const [simbolo, todos] of Object.entries(porSimbolo)) {
    const validos = todos.filter(p => p.fuente > 0 && p.propio > 0)
    if (validos.length === 0) continue
    simbolosConDato++

    // Se apartan ANTES de cualquier otro juicio los pares cuya etiqueta está corrida (ver `ETIQUETA_TOL`):
    // de esos NO sabemos si el precio cuadra con su sesión, porque no es de su sesión. Dejarlos dentro
    // contaminaría también el juicio de reescalado, que cuenta cuántas sesiones desvían.
    const pares: ParDiferido[] = []
    for (const p of validos) {
      const desvia = Math.abs(p.fuente / p.propio - 1) > maxDesvio
      const previa = p.fuentePrevia
      if (desvia && previa != null && previa > 0 && Math.abs(p.propio / previa - 1) <= tolEtiqueta) {
        etiquetadas.push({ simbolo, fecha: p.fecha, propio: p.propio, cierrePrevio: previa })
        continue
      }
      pares.push(p)
    }
    if (pares.length === 0) continue

    const desviados = pares.filter(p => Math.abs(p.fuente / p.propio - 1) > maxDesvio)
    if (desviados.length === 0) continue

    // Reescalado: TODAS las sesiones de la ventana desplazadas por el mismo factor. Con una sola sesión
    // no hay forma de distinguirlo de un precio malo, así que no se concede el beneficio de la duda —
    // perder una tesis buena cuesta un dato; conservar una envenenada mueve el torneo.
    const factores = pares.map(p => p.fuente / p.propio)
    const f = mediana(factores)
    const uniforme = desviados.length === pares.length && pares.length >= 2 &&
      factores.every(x => Math.abs(x / f - 1) <= tolReescalado)
    if (uniforme) {
      reescalados.push({ simbolo, factor: f, sesiones: pares.length })
      continue
    }

    conSospecha.add(simbolo)
    for (const p of desviados) {
      sospechosas.push({ simbolo, fecha: p.fecha, fuente: p.fuente, propio: p.propio, desvio: p.fuente / p.propio - 1 })
    }
  }

  const masiva = simbolosConDato >= MIN_SIMBOLOS_MASIVA && conSospecha.size / simbolosConDato > umbralMasiva
  return { sospechosas: masiva ? [] : sospechosas, reescalados, etiquetadas, simbolosConDato, masiva }
}

export function resumenDiferido(d: Diferido): string {
  const partes: string[] = []
  if (d.masiva) {
    partes.push(`⚠️ la 2ª fuente discrepa en MÁS de la mitad de los símbolos (${d.simbolosConDato} con dato): no se anula nada, revisar la FUENTE`)
  } else if (d.sospechosas.length > 0) {
    const lista = d.sospechosas
      .map(s => `${s.simbolo} ${s.fecha} ${s.propio} vs ${s.fuente} (${(s.desvio * 100).toFixed(1)}%)`)
      .join(' · ')
    partes.push(`${d.sospechosas.length} precio(s) de sesiones pasadas que la 2ª fuente desmiente: ${lista}`)
  }
  if (d.reescalados.length > 0) {
    const lista = d.reescalados.map(r => `${r.simbolo} ×${r.factor.toFixed(3)}`).join(' · ')
    partes.push(`${d.reescalados.length} reescalado(s) (split/ajuste, NO envenenamiento): ${lista}`)
  }
  if (d.etiquetadas.length > 0) {
    const lista = d.etiquetadas.map(e => `${e.simbolo} ${e.fecha}`).join(' · ')
    partes.push(`${d.etiquetadas.length} precio_ref con la fecha corrida (es el cierre de la sesión anterior; pasada ejecutada antes del cierre): sin juzgar, NO anulado — ${lista}`)
  }
  return partes.join(' · ')
}

// ---------------------------------------------------------------------------
// TESIS HUÉRFANA: venció, pero su símbolo ya no viene en la pasada
// ---------------------------------------------------------------------------
//
// 🚨 LANDMINE (12/08/2026) — el track record tenía SESGO DE SUPERVIVENCIA y no se veía por ningún lado.
// `/puntuar` solo sabe puntuar con el precio que trae la pasada de hoy (`conformes[simbolo]`), así que
// una tesis cuyo símbolo SALIÓ del universo no se puntúa nunca: se queda `resultado: null` para siempre,
// sin contar, sin aparecer en ningún recuento y sin que nadie la eche de menos. Encontradas 16 así
// (CEG, ISRG, SYM y UEC, tesis del 18/07 vencidas el 28/07) al revisar la pasada del 12/08.
//
// Es el error de siempre con otro disfraz: no es que sepamos que esas tesis fallaron o acertaron — es
// que NO LO PREGUNTAMOS, y el silencio se lee como «no había nada». Y el sesgo no es neutro: un símbolo
// se cae del universo por dejar de dar señal, por desplomarse o por ser adquirido, no al azar, así que
// las tesis que desaparecen no son una muestra aleatoria de las que se quedan.
//
// El desenlace de esas tesis SÍ existe: es el cierre de su sesión de vencimiento, y la 2ª fuente lo
// publica. Se puntúan con él, no con el precio de hoy — medir una ventana de 10 días con el precio de 25
// días después sería otra vez un dato bueno leído con el periodo equivocado.
//
// Dos guardas, porque la serie de la 2ª fuente no es intercambiable con nuestro corpus:
//
//  1. ANCLA. La fuente publica el histórico AJUSTADO por splits y dividendos; nuestro `precio_ref` es el
//     precio SIN ajustar del día que se guardó. Cruzarlos a ciegas tras un split da un retorno inventado
//     de ±50% que además parece perfectamente plausible. Antes de usar nada de la serie se comprueba que
//     nuestro `precio_ref` coincide (±`DIVERGENCIA_MAX`) con lo que la fuente publica alrededor de la
//     sesión de la tesis: eso valida a la vez la escala y la identidad del símbolo (un ticker reciclado
//     por otra empresa no cuadra). Si no ancla, no se puntúa — y se dice por qué.
//
//     🚨 El ancla NO puede pedir la fecha EXACTA de la tesis. La fecha de una tesis es la de la PASADA,
//     y las pasadas no siempre caen en sesión: las 16 huérfanas que destaparon todo esto son del SÁBADO
//     18/07/2026, y sus cuatro `precio_ref` (CEG 252,39 · ISRG 345,42 · SYM 41,25 · UEC 9,28) son, al
//     céntimo, el cierre del VIERNES 17/07 — verificado contra IBKR. Un ancla por fecha exacta las habría
//     dejado a las cuatro sin resolver y el arreglo no habría arreglado nada. Se aceptan por eso las DOS
//     últimas sesiones publicadas hasta la fecha de la tesis: la última (caso normal y caso fin de
//     semana) y la anterior (pasada lanzada antes del cierre, la firma de `ETIQUETA_TOL`). Es todo lo que
//     el ancla necesita: no data la tesis, solo confirma que la serie habla de nuestro mismo valor y en
//     nuestra misma escala.
//  2. VENTANA. Vale el PRIMER cierre publicado en o tras el vencimiento, y solo si llega dentro del
//     margen (fin de semana o festivo). Más tarde ya no mide la ventana de la tesis sino la deriva
//     posterior, exactamente el mismo corte que el proxy de deslizamiento.
//
// Lo que no se pueda puntuar se CUENTA y se canta. Ese es el arreglo de fondo: el defecto no era no
// poder puntuarlas, era que desaparecían sin dejar rastro.

// Margen tras el vencimiento en el que el primer cierre publicado sigue siendo «el de la ventana»
// (cubre fin de semana largo). Mismo criterio que el ≤5 días del proxy de deslizamiento.
export const HUERFANA_MARGEN_DIAS = 5

// Días tras el vencimiento antes de recurrir a la 2ª fuente. Un símbolo puede faltar una noche suelta y
// volver mañana; en ese caso el camino normal (precio de la sesión, ya contrastado) es preferible y esto
// no debe adelantarse. Solo se rescata lo que lleva parado de verdad.
export const HUERFANA_GRACIA_DIAS = 3

// Tope de reintento. Pasado ese plazo la fuente ya ha dicho lo que tenía que decir y volver a preguntar
// cada noche es gasto sin desenlace. Dejan de intentarse, pero NO dejan de contarse: siguen saliendo en
// el parte como lo que son, un hueco conocido del track record.
export const HUERFANA_MAX_DIAS = 60

export type Huerfana = { simbolo: string; fecha: string; vence: string; precioRef: number }

export type VeredictoHuerfana =
  | { estado: 'puntuable'; precio: number; fecha: string; ventanaDias: number }
  | { estado: 'sin-ancla'; motivo: string }
  | { estado: 'sin-cierre'; motivo: string }

// Aritmética de fechas en días naturales UTC. Aquí y no en un util compartido porque este módulo no
// importa NADA a propósito: es lo que permite testearlo con `node --test --experimental-strip-types`.
export function fechaMas(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`)
  if (!Number.isFinite(t)) return fecha
  return new Date(t + dias * 86_400_000).toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
  return Math.round((b - a) / 86_400_000)
}

// Ventana (en días) que hay que pedir a la 2ª fuente para que la serie alcance el ANCLA de
// `juzgarHuerfana`: la sesión <= `h.fecha`. `h.fecha` es la fecha de APERTURA (tesis o posición), NUNCA
// la de vencimiento — pasar el vencimiento deja la ventana corta por `horizonteDias` días y el ancla no
// encuentra nunca con qué comparar, así que la puntuación queda "sin-ancla" para siempre por mucho que
// se reintente. Bug real (31/08/2026): una posición de MSFT abierta el 04/08 (horizonte 10, vencida el
// 14/08) pedía la ventana desde el 14/08 en vez de desde el 04/08 y llevaba 17 días sin poder cerrarse.
export function ventanaHastaApertura(fechasApertura: string[], hoy: string, margenDias: number): number {
  const masVieja = [...fechasApertura].sort()[0]
  return diasEntre(masVieja, hoy) + margenDias
}

// `serie` = cierres publicados por la 2ª fuente en orden ascendente (lo que devuelven tanto el CSV de
// Stooq como el chart de Yahoo, y lo que ya asume `juzgarPuntos`).
export function juzgarHuerfana(
  h: Huerfana,
  serie: PuntoContraste[],
  maxDesvio = DIVERGENCIA_MAX,
  margenDias = HUERFANA_MARGEN_DIAS,
): VeredictoHuerfana {
  // Las dos últimas sesiones publicadas HASTA la fecha de la tesis (ver el porqué en la cabecera).
  const hasta = serie.filter(p => p.fecha <= h.fecha)
  const candidatas = hasta.slice(-2)
  if (candidatas.length === 0) return { estado: 'sin-ancla', motivo: `la 2ª fuente no publica ninguna sesión hasta el ${h.fecha}` }
  const ultima = candidatas[candidatas.length - 1]
  const hueco = diasEntre(ultima.fecha, h.fecha)
  if (hueco > margenDias) {
    return { estado: 'sin-ancla', motivo: `la última sesión publicada antes de la tesis (${ultima.fecha}) queda a ${hueco} días: la serie no cubre el ${h.fecha}` }
  }
  if (!(h.precioRef > 0) || !candidatas.some(p => Math.abs(p.cierre / h.precioRef - 1) <= maxDesvio)) {
    const vistas = candidatas.map(p => `${p.fecha}=${p.cierre}`).join(', ')
    return {
      estado: 'sin-ancla',
      motivo: `el precio_ref ${h.precioRef} no cuadra con la serie (${vistas}): otra escala (split/ajuste) u otro valor`,
    }
  }
  const cierre = serie.find(p => p.fecha >= h.vence)
  if (!cierre) return { estado: 'sin-cierre', motivo: `la 2ª fuente no llega al vencimiento (${h.vence})` }
  const retraso = diasEntre(h.vence, cierre.fecha)
  if (retraso > margenDias) {
    return {
      estado: 'sin-cierre',
      motivo: `el primer cierre tras el vencimiento (${cierre.fecha}) llega ${retraso} días tarde: mediría deriva, no la ventana`,
    }
  }
  return { estado: 'puntuable', precio: cierre.cierre, fecha: cierre.fecha, ventanaDias: diasEntre(h.fecha, cierre.fecha) }
}

export type HuerfanaNoResuelta = { simbolo: string; fecha: string; vence: string; motivo: string }

// Parte de una línea. Vacío solo si no hubo NINGUNA huérfana: en cuanto hay una, se dice — aunque no se
// haya podido hacer nada con ella, que es justo el caso que se pasó cuatro semanas callado.
export function resumenHuerfanas(
  puntuadas: number,
  sinResolver: HuerfanaNoResuelta[],
  fueraDePlazo: number,
): string {
  const partes: string[] = []
  if (puntuadas > 0) partes.push(`${puntuadas} tesis huérfana(s) puntuada(s) con el cierre de su vencimiento (2ª fuente)`)
  if (sinResolver.length > 0) {
    const lista = sinResolver.map(h => `${h.simbolo} ${h.fecha}→${h.vence} (${h.motivo})`).join(' · ')
    partes.push(`${sinResolver.length} huérfana(s) sin resolver: ${lista}`)
  }
  if (fueraDePlazo > 0) {
    partes.push(`${fueraDePlazo} huérfana(s) fuera de plazo (>${HUERFANA_MAX_DIAS} días): ya no se reintentan y quedan como hueco conocido del track record`)
  }
  return partes.join(' · ')
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
