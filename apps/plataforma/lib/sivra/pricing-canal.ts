// lib/sivra/pricing-canal.ts — la relación REAL entre nuestra base de Smoobu y lo que paga el huésped.
//
// POR QUÉ (18/08/2026, reserva de House 21-25/12). El motor tarifica anclado al mercado: mide el
// precio GUEST de los comparables y lo convierte a precio BASE dividiendo por `channel_markup`
// (1,20 = «el canal Booking suma un 20%»). Ese número era una SUPOSICIÓN que nadie había
// contrastado, y al medir el escaparate real de los CUATRO pisos con el conector resultó estar
// mal en las dos direcciones a la vez:
//
//     piso            multiplicador   cuota fija/estancia   (configurado: ×1,20 y sin cuota)
//     House            0,936            342,6€
//     Busto Reform     0,955             30,4€
//     Duplex Center    0,953             48,9€
//     Luxury Busto     0,796             56,4€
//
// Dos lecciones, y la segunda es la que de verdad cuesta dinero:
//
//   1. El multiplicador es MENOR que 1 (~0,95), no 1,20. El canal no suma: resta un poco.
//   2. **Hay una CUOTA FIJA por estancia** (la limpieza), que no es un detalle: en House son 342€.
//      Un modelo puramente multiplicativo no puede describir eso, y por eso el mismo piso «medía»
//      ×1,33 en una estancia de 2 noches y ×1,18 en una de 3 — no había cambiado nada, solo el
//      número de noches entre las que se reparte la cuota. Cualquier «markup» escalar que se
//      calcule a partir de un ratio suelto es una media de dos cosas distintas.
//
// El modelo correcto es AFÍN:  escaparate_total = m × base_total + F
//
// y el motor lo invierte por noche para saber qué base pedir si quiere un precio de huésped G:
//
//     base_noche = (G − F / noches_referencia) / m
//
// `noches_referencia` es la estancia típica del piso (mediana de `incomes.nights`): repartir la
// cuota fija entre 2 noches o entre 5 cambia el resultado, así que se usa la duración con la que
// de verdad se vende ese piso, no una constante inventada.
//
// 🚨 La cuota fija NO se ignora «porque los comparables también la llevan». Precisamente porque la
// llevan: el corpus se mide con el precio TOTAL de una ventana de N noches (`price.book`), que en
// todos los alojamientos incluye su propia limpieza. Comparar es homogéneo solo si nuestro
// escaparate se mide igual — misma duración y mismo aforo. Ese es el contrato de `pricing_escaparate`.
//
// ⚠️ LÍMITE CONOCIDO Y DELIBERADO: el ajuste es A AFORO FIJO. Booking además recarga POR PERSONA
// por encima de cierto umbral, y ese recargo (personas × noches × tarifa) no es ni proporcional a
// la base ni fijo por estancia: al ajustar con el aforo clavado se REPARTE entre `m` y `F`. Medido
// en House el 19/08/2026: a aforo 12 sale m=0,902 / F=597€ y a aforo 6, m=0,835 / F=453€ — mismo
// piso, mismo día, canal idéntico. No es un error del ajuste: son dos descripciones válidas del
// mismo canal bajo condiciones distintas.
//
// Por eso el motor usa SIEMPRE el ajuste del AFORO MÁXIMO del piso: es el mismo aforo con el que se
// normalizan los comparables (`pricing_factor_aforo`) y con el que se tarifa, así que la conversión
// describe exactamente la situación en la que se aplica. Mezclar aforos en un mismo ajuste sería
// medir el recargo por persona creyendo medir el canal, y por eso `ajusteCanal` los filtra.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/** Una medición del escaparate propio: una ventana completa, no una noche suelta. */
export interface VentanaEscaparate {
  /** YYYY-MM-DD del check-in */
  checkin: string
  /** noches de la ventana (el mismo número con el que se miden los comparables) */
  noches: number
  /** aforo con el que se consultó el portal */
  guests: number
  /** € TOTALES que veía el huésped por la ventana entera */
  precioTotal: number
  /**
   * € TOTALES de base de Smoobu de esas mismas noches. `null` = no tenemos snapshot de alguna
   * noche: la ventana no se puede usar (no es un ratio de 1, es un ratio desconocido).
   */
  baseTotal: number | null
  /**
   * Portal donde se midió. Cada canal tiene SU recta (comisión y política de limpieza propias), y
   * mezclarlos daría una media de dos escaparates distintos. Opcional solo por compatibilidad con
   * los tests históricos; el ajuste filtra por él cuando se le pide.
   */
  portal?: string
}

export type EstadoCanal = 'medido' | 'sin_muestras' | 'muestra_corta' | 'indeterminado' | 'inconsistente'

export interface AjusteCanal {
  /** multiplicador sobre la base (m). `null` si no se ha podido medir. */
  markup: number | null
  /** cuota fija por estancia en € (F). `null` si no se ha podido medir. */
  cuotaFija: number | null
  /** ventanas que han entrado en el ajuste */
  muestras: number
  /** bondad del ajuste (R²); 1 = perfecto. `null` sin ajuste. */
  r2: number | null
  estado: EstadoCanal
}

/** Ventanas mínimas para fiarnos del ajuste. Por debajo se dice «no lo sé», no se inventa un 1,20. */
export const MIN_VENTANAS_CANAL = 3
/**
 * Recorrido mínimo de la base entre ventanas (relativo a la base mayor) para poder SEPARAR el
 * multiplicador de la cuota fija. Con todas las ventanas al mismo precio, m y F son indistinguibles:
 * infinitas parejas encajan igual de bien y elegir una es inventarse la mitad del modelo.
 */
export const RECORRIDO_MINIMO = 0.25
/** R² mínimo para dar el ajuste por bueno (por debajo, el portal no está siguiendo a la base). */
export const R2_MINIMO = 0.9
/** Cotas de cordura del multiplicador medido. Fuera de esto, algo no es lo que creemos. */
export const MARKUP_MIN = 0.6
export const MARKUP_MAX = 1.6

/**
 * Ajusta `escaparate = m × base + F` por mínimos cuadrados sobre las ventanas medidas.
 *
 * Solo entran las del aforo indicado (el mismo con el que se miden los comparables del piso) y con
 * base conocida. Si la cuota fija sale negativa —que no existe: nadie descuenta una limpieza— se
 * reajusta forzando F = 0 en vez de propagar un absurdo.
 */
export function ajusteCanal(
  ventanas: VentanaEscaparate[],
  opts: { aforo: number; minVentanas?: number; portal?: string },
): AjusteCanal {
  const minVentanas = opts.minVentanas ?? MIN_VENTANAS_CANAL
  const utiles = (ventanas ?? []).filter(v =>
    Number(v.guests) === Number(opts.aforo) &&
    // Un solo canal por ajuste: la recta de Booking no describe la de Airbnb.
    (!opts.portal || !v.portal || v.portal === opts.portal) &&
    Number(v.noches) > 0 &&
    Number.isFinite(Number(v.precioTotal)) && Number(v.precioTotal) > 0 &&
    v.baseTotal != null && Number.isFinite(Number(v.baseTotal)) && Number(v.baseTotal) > 0)

  const vacio = { markup: null, cuotaFija: null, r2: null }
  if (utiles.length === 0) return { ...vacio, muestras: 0, estado: 'sin_muestras' }
  if (utiles.length < minVentanas) return { ...vacio, muestras: utiles.length, estado: 'muestra_corta' }

  const xs = utiles.map(v => Number(v.baseTotal))
  const ys = utiles.map(v => Number(v.precioTotal))
  const maxX = Math.max(...xs), minX = Math.min(...xs)
  if (maxX <= 0 || (maxX - minX) / maxX < RECORRIDO_MINIMO) {
    // Todas las ventanas cuestan casi lo mismo: la recta no tiene apoyo para separar m de F.
    return { ...vacio, muestras: utiles.length, estado: 'indeterminado' }
  }

  const n = xs.length
  const mediaX = xs.reduce((a, b) => a + b, 0) / n
  const mediaY = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mediaX) * (ys[i] - mediaY); sxx += (xs[i] - mediaX) ** 2 }
  if (sxx <= 0) return { ...vacio, muestras: n, estado: 'indeterminado' }

  let m = sxy / sxx
  let f = mediaY - m * mediaX
  if (f < 0) { f = 0; m = ys.reduce((a, b) => a + b, 0) / xs.reduce((a, b) => a + b, 0) }

  const pred = xs.map(x => m * x + f)
  const ssRes = ys.reduce((a, y, i) => a + (y - pred[i]) ** 2, 0)
  const ssTot = ys.reduce((a, y) => a + (y - mediaY) ** 2, 0)
  const r2 = ssTot > 0 ? Number((1 - ssRes / ssTot).toFixed(4)) : 1

  const salida = { markup: Number(m.toFixed(3)), cuotaFija: Number(f.toFixed(1)), muestras: n, r2 }
  if (r2 < R2_MINIMO) return { ...salida, estado: 'inconsistente' }
  if (m < MARKUP_MIN || m > MARKUP_MAX) return { ...salida, estado: 'inconsistente' }
  return { ...salida, estado: 'medido' }
}

export interface ParametrosCanal {
  /** multiplicador sobre la base */
  markup: number
  /** cuota fija por estancia (€) */
  cuotaFija: number
  /** noches de la estancia típica del piso: entre ellas se reparte la cuota fija */
  nochesRef: number
}

/** Cuota fija repartida por noche. Es lo que hace que el modelo sea afín y no una regla de tres. */
export function fijoPorNoche(p: ParametrosCanal): number {
  const noches = Number(p.nochesRef) > 0 ? Number(p.nochesRef) : 2
  const fija = Number(p.cuotaFija) > 0 ? Number(p.cuotaFija) : 0
  return fija / noches
}

/**
 * Precio BASE por noche que hay que poner en Smoobu para que el huésped vea `guestNoche`.
 *
 * Es la inversa del modelo afín. Nunca devuelve ≤0: si la cuota fija ya se come el objetivo (un
 * mercado por debajo de la propia limpieza), devuelve 1 — la decisión de no vender a ese precio es
 * del suelo del piso (`min_price`), no de esta conversión.
 */
export function baseDesdeGuest(guestNoche: number, p: ParametrosCanal): number {
  return baseDesdeGuestConFijo(guestNoche, Number(p.markup), fijoPorNoche(p))
}

/**
 * La misma inversión con la cuota YA repartida por noche.
 *
 * Existe para los helpers del motor (`pricing-ancla-fecha`, `pricing-premio-mercado`), que trabajan
 * con precios por noche y no conocen la duración de la estancia. Es la MISMA fórmula, en un solo
 * sitio: cuando se tocó `channel_markup` a mano en 2026 el error viajó a cinco divisiones sueltas
 * repartidas por el motor, y arreglar una no arreglaba las otras.
 */
export function baseDesdeGuestConFijo(guestNoche: number, markup: number, fijoNoche: number): number {
  const m = Number(markup) > 0 ? Number(markup) : 1
  const fijo = Number(fijoNoche) > 0 ? Number(fijoNoche) : 0
  return Math.max(1, Math.round((Number(guestNoche) - fijo) / m))
}

/** Precio que verá el huésped por noche con una base dada. La ida del modelo afín. */
export function guestDesdeBase(baseNoche: number, p: ParametrosCanal): number {
  const m = Number(p.markup) > 0 ? Number(p.markup) : 1
  return Math.round(Number(baseNoche) * m + fijoPorNoche(p))
}

export interface DesviacionCanal {
  estado: 'sin_datos' | 'ok' | 'desviado'
  configurado: ParametrosCanal
  medido: { markup: number; cuotaFija: number } | null
  /**
   * Cuánto se desplaza el precio listado por creerse los parámetros equivocados, en tanto por uno
   * sobre una noche de referencia: >0 = listamos POR DEBAJO del mercado que medimos. `null` sin
   * medición.
   */
  sesgo: number | null
  /**
   * El PEOR sesgo sobre el rango de precios REALMENTE medido, no solo en la referencia. Es el que
   * decide `estado`: con un modelo afín el sesgo NO es plano, así que mirar un punto solo puede
   * decir «ok» justo donde las dos rectas se cruzan. `null` sin medición o sin rango.
   */
  sesgoMax: number | null
}

/**
 * ¿Describen los parámetros configurados lo que ve el huésped?
 *
 * El sesgo se evalúa sobre un precio de mercado de referencia (`guestRef`) porque con una cuota
 * fija el error NO es un porcentaje plano: pesa mucho más en las noches baratas. Sin medición
 * devuelve `sin_datos` — nunca `ok`: un check que se pone verde porque no ha podido mirar es el
 * fallo más caro que hay (regla de CLAUDE.md).
 */
export function desviacionCanal(p: {
  configurado: ParametrosCanal
  medido: { markup: number; cuotaFija: number } | null
  guestRef: number
  tolerancia?: number
  /** extremos del rango de precio/noche REALMENTE medido; sin ellos degrada al punto de siempre */
  guestMin?: number
  guestMax?: number
}): DesviacionCanal {
  const tol = p.tolerancia ?? 0.05
  if (!p.medido || !(p.medido.markup > 0)) {
    return { estado: 'sin_datos', configurado: p.configurado, medido: null, sesgo: null, sesgoMax: null }
  }
  const medido = { ...p.medido, nochesRef: p.configurado.nochesRef }
  const sesgoEn = (g: number) =>
    Number((baseDesdeGuest(g, medido) / baseDesdeGuest(g, p.configurado) - 1).toFixed(4))

  const sesgo = sesgoEn(p.guestRef)
  // 🚨 Con cuota fija el sesgo NO es un porcentaje plano: las dos rectas se CRUZAN, y cerca del
  // cruce hasta dos canales totalmente distintos parecen el mismo. Evaluar solo en la mediana es
  // un markup escalar disfrazado — justo lo que este módulo existe para no volver a hacer.
  // Como el modelo es afín, el peor sesgo del rango está SIEMPRE en un extremo: basta con mirarlos.
  // Caso fundacional (21/08/2026): House medía 1,032 + 318€/estancia contra un 1,20 vigente y salía
  // «ok» con −4,6% en su mediana (881€/noche), mientras se desviaba −23,5% a 465€ y +9,5% a 2.743€.
  // El calibrado se saltó el piso entero, en silencio y por segundo día.
  const extremos = [p.guestMin, p.guestMax].filter((g): g is number => typeof g === 'number' && g > 0)
  const candidatos = [sesgo, ...extremos.map(sesgoEn)]
  const sesgoMax = candidatos.reduce((peor, x) => (Math.abs(x) > Math.abs(peor) ? x : peor), 0)
  return {
    estado: Math.abs(sesgoMax) > tol ? 'desviado' : 'ok',
    configurado: p.configurado,
    medido: p.medido,
    sesgo,
    sesgoMax,
  }
}

/**
 * Cuánto puede moverse el precio BASE en UNA aplicación de parámetros nuevos, en tanto por uno.
 *
 * No se acota el multiplicador ni la cuota por separado —eso no significa nada— sino su EFECTO: lo
 * que cambia la base que el motor pediría para el mismo precio de mercado. Es lo que se juega.
 */
export const MAX_SALTO_CANAL = 0.15

export interface PasoCanal {
  /** parámetros a escribir en esta pasada */
  aplicar: ParametrosCanal
  /** efecto real sobre la base de referencia, en tanto por uno (ya acotado) */
  efecto: number
  /** true = el salto completo no cabía y se ha dado solo un tramo (quedan pasadas) */
  topado: boolean
}

/**
 * Un PASO desde los parámetros configurados hacia los medidos, sin mover el precio más de
 * `maxSalto` en una sola pasada.
 *
 * Por qué un paso y no el salto entero: los parámetros del canal mueven TODAS las fechas del piso a
 * la vez. Si la medición estuviera mal (un portal en obras, una promoción puntual), el error se
 * cobra en el calendario completo. Con el paso acotado, una medición mala cuesta como mucho un
 * `maxSalto` y la pasada siguiente —ya con más ventanas— corrige; con el salto entero, cuesta todo.
 *
 * Se interpola entre configurado y medido y se busca el tramo más largo que cabe en el tope. La
 * búsqueda es binaria porque el efecto NO es lineal en los parámetros (el multiplicador divide).
 */
export function pasoCanal(p: {
  configurado: ParametrosCanal
  medido: { markup: number; cuotaFija: number }
  guestRef: number
  maxSalto?: number
  /** extremos del rango de precio/noche medido: el salto se acota por el PEOR de ellos */
  guestMin?: number
  guestMax?: number
}): PasoCanal {
  const maxSalto = p.maxSalto ?? MAX_SALTO_CANAL
  const nochesRef = Number(p.configurado.nochesRef) > 0 ? Number(p.configurado.nochesRef) : 2
  const mezcla = (t: number): ParametrosCanal => ({
    markup: p.configurado.markup + (p.medido.markup - p.configurado.markup) * t,
    cuotaFija: p.configurado.cuotaFija + (p.medido.cuotaFija - p.configurado.cuotaFija) * t,
    nochesRef,
  })
  // 🚨 El raíl acota el salto por su EFECTO sobre el precio, y ese efecto tampoco es plano cuando
  // hay cuota fija: el mismo cambio de parámetros vale −4,6% en la mediana de House y −23,5% en sus
  // fechas baratas. Acotar mirando solo la mediana deja pasar de una vez un salto que el tope del
  // ±15% existe para impedir. Se mide en la referencia Y en los extremos, y manda el peor.
  // (21/08/2026, misma raíz que el punto ciego de `desviacionCanal`.)
  const puntos = [p.guestRef, p.guestMin, p.guestMax]
    .filter((g): g is number => typeof g === 'number' && g > 0)
  const efectosDe = (t: number) => puntos.map(g => baseDesdeGuest(g, mezcla(t)) / baseDesdeGuest(g, p.configurado) - 1)
  /** el efecto que MANDA: el mayor en valor absoluto de todo el rango medido */
  const efectoDe = (t: number) =>
    efectosDe(t).reduce((peor, x) => (Math.abs(x) > Math.abs(peor) ? x : peor), 0)

  const efectoTotal = efectoDe(1)
  if (Math.abs(efectoTotal) <= maxSalto) {
    return { aplicar: mezcla(1), efecto: Number(efectoTotal.toFixed(4)), topado: false }
  }
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (Math.abs(efectoDe(mid)) <= maxSalto) lo = mid; else hi = mid
  }
  const aplicar = mezcla(lo)
  return {
    aplicar: { ...aplicar, markup: Number(aplicar.markup.toFixed(4)), cuotaFija: Number(aplicar.cuotaFija.toFixed(1)) },
    efecto: Number(efectoDe(lo).toFixed(4)),
    topado: true,
  }
}

// ─── Validación FUERA DE MUESTRA ──────────────────────────────────────────────────────────────
//
// 🚨 POR QUÉ NO BASTA CON EL R² (19/08/2026). `ajusteCanal` devuelve un R² altísimo, pero ese R²
// mide lo bien que la recta describe LAS VENTANAS CON LAS QUE SE AJUSTÓ. Es circular: si Booking
// cambia mañana su política de comisión o de limpieza, la pasada siguiente vuelve a ajustar sobre
// las ventanas nuevas, vuelve a salir R²=0,99 y NADIE se entera de que el modelo de ayer estaba
// equivocado. Un ajuste siempre encaja consigo mismo.
//
// Lo que de verdad dice si el modelo sirve es la PREDICCIÓN: con los parámetros que están hoy en
// producción, ¿cuánto se acerca el precio que anticipamos al que el portal enseña en una ventana
// que ese ajuste no había visto? Por eso `pricing_escaparate.usada_en_ajuste_at` marca las
// ventanas ya consumidas: las que están a NULL son las únicas que pueden juzgar al modelo.

export interface ValidacionCanal {
  /** ventanas nuevas (no usadas en el ajuste vigente) que han podido juzgarse */
  muestras: number
  /** error medio ABSOLUTO de predicción, en tanto por uno sobre el precio real */
  errorMedio: number | null
  /** peor error absoluto de la muestra */
  errorMaximo: number | null
  /**
   * error medio CON SIGNO: >0 = el portal cobra MÁS de lo que predecimos. Es el que importa: un
   * error grande pero sin sesgo es ruido de la muestra; un error pequeño y siempre en la misma
   * dirección es el modelo equivocándose de forma sistemática, y eso viaja a todas las fechas.
   */
  sesgo: number | null
  estado: 'sin_muestras' | 'ok' | 'desviado'
}

/** Sesgo sistemático tolerado antes de declarar el modelo desviado. */
export const TOL_SESGO_CANAL = 0.06
/** Error medio absoluto tolerado (más laxo: absorbe el ruido de una muestra pequeña). */
export const TOL_ERROR_CANAL = 0.12

/**
 * ¿Acierta la recta que está en producción sobre ventanas que NO se usaron para ajustarla?
 *
 * Sin muestras devuelve `sin_muestras`, nunca `ok`: un validador que se pone verde porque no ha
 * podido comparar nada es el fallo más caro que hay (regla de CLAUDE.md).
 */
export function validarCanal(
  nuevas: VentanaEscaparate[],
  vigentes: { markup: number; cuotaFija: number },
  opts: { aforo: number; tolSesgo?: number; tolError?: number } = { aforo: 0 },
): ValidacionCanal {
  const tolSesgo = opts.tolSesgo ?? TOL_SESGO_CANAL
  const tolError = opts.tolError ?? TOL_ERROR_CANAL
  const utiles = (nuevas ?? []).filter(v =>
    (!opts.aforo || Number(v.guests) === Number(opts.aforo)) &&
    v.baseTotal != null && Number(v.baseTotal) > 0 &&
    Number.isFinite(Number(v.precioTotal)) && Number(v.precioTotal) > 0)

  if (!utiles.length || !(vigentes?.markup > 0)) {
    return { muestras: 0, errorMedio: null, errorMaximo: null, sesgo: null, estado: 'sin_muestras' }
  }
  const errores = utiles.map(v => {
    const predicho = vigentes.markup * Number(v.baseTotal) + (vigentes.cuotaFija > 0 ? vigentes.cuotaFija : 0)
    return (Number(v.precioTotal) - predicho) / Number(v.precioTotal)
  })
  const sesgo = errores.reduce((a, b) => a + b, 0) / errores.length
  const abs = errores.map(Math.abs)
  const errorMedio = abs.reduce((a, b) => a + b, 0) / abs.length
  const errorMaximo = Math.max(...abs)
  return {
    muestras: utiles.length,
    errorMedio: Number(errorMedio.toFixed(4)),
    errorMaximo: Number(errorMaximo.toFixed(4)),
    sesgo: Number(sesgo.toFixed(4)),
    estado: Math.abs(sesgo) > tolSesgo || errorMedio > tolError ? 'desviado' : 'ok',
  }
}
