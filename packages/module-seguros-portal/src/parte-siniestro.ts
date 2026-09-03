/**
 * El parte de siniestro que abre el CLIENTE desde el portal.
 *
 * Puro: sin BD, sin red, sin Next. Aquí vive lo único que no puede depender de
 * la pantalla ni del proveedor de correo: qué es un parte válido, qué plazo
 * corre, y —sobre todo— **qué NO se le puede decir al cliente**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LA REGLA QUE SOSTIENE ESTE FICHERO: un parte enviado NO es un siniestro
 * comunicado a la compañía.
 *
 * Una correduría es mediadora del CLIENTE, no del asegurador: contárnoslo a
 * nosotros no es, jurídicamente, comunicárselo a la compañía. Entre que el
 * cliente pulsa «enviar» y que Alberto abre el siniestro en la entidad hay un
 * hueco de horas o de días, y en ese hueco el cliente cree que ya está hecho.
 * Es exactamente el fallo que persigue la regla de la raíz «dato que NO hay ≠
 * dato que NO se ha mirado», con la vuelta de tuerca de que aquí el estado
 * intermedio SÍ existe y es plausible: «enviado» se lee como «hecho».
 *
 * Por eso el vocabulario de estados es explícito y hay una función —
 * `comunicadoACompania()`— para que la pantalla no lo deduzca a ojo de un
 * `estado !== 'enviado'`. Solo `abierto_en_compania` significa que la entidad
 * lo sabe, y ese estado lo pone Alberto cuando existe el siniestro de verdad.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * El ciclo de vida del parte, del lado de la correduría.
 *
 * - `enviado`             el cliente lo mandó; nadie lo ha mirado todavía.
 * - `recibido`            Alberto lo ha visto. Sigue SIN estar en la compañía.
 * - `abierto_en_compania` existe siniestro en la entidad. Lo único que se puede
 *                         contar al cliente como «comunicado».
 * - `descartado`          no procede (no había cobertura, era consulta, duplicado).
 */
export const PARTE_ESTADOS = ['enviado', 'recibido', 'abierto_en_compania', 'descartado'] as const
export type ParteEstado = (typeof PARTE_ESTADOS)[number]

/**
 * 🚨 La única fuente de la frase «tu compañía ya lo sabe». No se sustituye por
 * `estado !== 'enviado'`: `recibido` es «lo hemos leído nosotros», que es justo
 * el estado que se confunde con estar comunicado.
 */
export function comunicadoACompania(estado: ParteEstado): boolean {
  return estado === 'abierto_en_compania'
}

/**
 * Art. 16 LCS: siete días desde que se conoció el siniestro para comunicarlo.
 *
 * Se RE-EXPORTA de `@central/module-seguros`, no se declara aquí. El panel del
 * corredor ya cuenta este plazo (`siniestros.ts`), y dos constantes con el
 * mismo nombre legal en el mismo monorepo es el fallo de la casa: alguien
 * cambia una, la otra se queda, y las dos pantallas dicen cosas distintas del
 * mismo siniestro sin que nada falle.
 */
export { DIAS_COMUNICACION_LCS } from '@central/module-seguros'

/** Por debajo no es una descripción: es un «me han dado» que no sirve para abrir nada. */
export const DESCRIPCION_MIN = 15
export const DESCRIPCION_MAX = 2000
export const LUGAR_MAX = 200
/** Más atrás no se abre un parte por el portal: eso es una conversación con Alberto. */
export const ANIOS_MAXIMOS_ATRAS = 5

import { DIAS_COMUNICACION_LCS, plazoComunicacion as plazoBase } from '@central/module-seguros'


export type ParteEntrada = {
  descripcion?: unknown
  /** `YYYY-MM-DD`. Obligatoria: sin fecha no hay plazo que contar (art. 16 LCS). */
  fechaHecho?: unknown
  /** `HH:MM`, opcional: mucha gente sabe el día y no la hora, y no se inventa. */
  horaAproximada?: unknown
  lugar?: unknown
  /** Póliza de la CARTERA. Excluyente con `polizaDeclaradaId`. */
  polizaId?: unknown
  /** Póliza que el cliente aportó al portal. Excluyente con `polizaId`. */
  polizaDeclaradaId?: unknown
  /** Tri-estado a propósito: ver `normalizarTriestado`. */
  hayHeridos?: unknown
  hayTerceros?: unknown
}

export type ParteNormalizado = {
  descripcion: string
  fechaHecho: string
  horaAproximada: string | null
  lugar: string | null
  polizaId: string | null
  polizaDeclaradaId: string | null
  hayHeridos: boolean | null
  hayTerceros: boolean | null
}

export type ResultadoParte =
  | { ok: true; valor: ParteNormalizado }
  | { ok: false; errores: Record<string, string> }

/**
 * `null` = «no lo ha contestado». **No se colapsa a `false`.**
 *
 * Es la misma regla del NULL de la raíz aplicada al peor sitio posible: si un
 * «no me lo ha dicho» se guarda como `false`, la ficha que le llega a Alberto
 * dice «sin heridos» de un accidente sobre el que nadie preguntó. Un parte con
 * heridos se tramita en horas y otro no, así que este colapso no es cosmético.
 */
function normalizarTriestado(v: unknown): boolean | null {
  if (v === true || v === false) return v
  if (typeof v !== 'string') return null
  // Se normaliza acento, caja y espacios ANTES de comparar. No es cosmético:
  // un `<select>` que emita `'Sí'` con mayúscula y tilde contra una lista de
  // `'si'` en minúscula devolvería `null` para TODOS los partes, y como `null`
  // es un estado legítimo («no lo ha contestado») nadie vería nunca un error.
  // La pregunta sobre heridos dejaría de contestarse sin que fallara nada.
  const t = v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (t === 'si' || t === 'true') return true
  if (t === 'no' || t === 'false') return false
  return null
}

/** Medianoche UTC del día de `d`. */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * `YYYY-MM-DD` → `Date` a medianoche UTC, o `null`.
 *
 * Reconstruye la cadena desde el `Date` y la compara: `new Date('2026-02-31')`
 * no falla, JavaScript la desborda a marzo sin avisar y guardaría un día que el
 * cliente no escribió.
 */
export function parsearFechaHecho(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null
  const d = new Date(`${valor}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) === valor ? d : null
}

export type PlazoComunicacion = {
  diasTranscurridos: number
  /** Días que quedan de los 7. Negativo cuando ya pasaron. */
  diasRestantes: number
  /**
   * 🚨 `true` = han pasado más de 7 días. **NO significa que haya perdido la
   * cobertura**, y la pantalla no puede decir eso: el art. 16 LCS solo permite
   * a la compañía reclamar los daños que le cause el retraso, y la pérdida del
   * derecho exige dolo o culpa grave. Un portal que le diga «ya no te cubren»
   * a quien avisa tarde consigue que no avise nunca — y avisar tarde sigue
   * siendo muchísimo mejor que no avisar.
   */
  fueraDePlazo: boolean
}

/**
 * La MISMA cuenta que hace el panel del corredor, con la forma que necesita el
 * portal. La aritmética NO se reimplementa: se delega en `plazoComunicacion()`
 * de `@central/module-seguros` y aquí solo se le da la vuelta a los campos.
 *
 * Es deliberado y no es ceremonia: si el portal contara los días por su cuenta,
 * el día que alguien tocara el redondeo o el huso en una de las dos, el cliente
 * y Alberto verían plazos distintos del mismo siniestro y **ninguna de las dos
 * pantallas fallaría**.
 *
 * ⚠️ No se defiende de una `fechaHecho` futura: devolvería días negativos y más
 * de 7 restantes. Es aritmética honesta, no una guarda que falte —
 * `normalizarParte` ya rechaza el futuro, así que a la BD no llega ninguna. Si
 * algún día se llama con una fecha que no ha pasado por ahí, el sitio de
 * arreglarlo es esa llamada.
 */
export function plazoComunicacion(x: { fechaHecho: Date; hoy: Date }): PlazoComunicacion {
  // `plazoBase` solo devuelve `null` con una fecha nula o inválida; aquí el tipo
  // ya garantiza un `Date`, así que el `?? ` no tapa ningún caso real.
  const base = plazoBase(x.fechaHecho, x.hoy)
  const diasRestantes = base?.diasRestantes ?? 0
  return {
    diasTranscurridos: DIAS_COMUNICACION_LCS - diasRestantes,
    diasRestantes,
    fueraDePlazo: base?.vencido ?? false,
  }
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Valida y normaliza lo que llega del formulario. Devuelve TODOS los errores a
 * la vez (uno por campo): corregir de uno en uno en el móvil, con un accidente
 * recién ocurrido delante, es la forma más rápida de que alguien abandone.
 */
export function normalizarParte(entrada: ParteEntrada, hoy: Date = new Date()): ResultadoParte {
  const errores: Record<string, string> = {}

  const descripcion = texto(entrada.descripcion)
  if (descripcion === null) errores.descripcion = 'falta'
  else if (descripcion.length < DESCRIPCION_MIN) errores.descripcion = 'corta'
  else if (descripcion.length > DESCRIPCION_MAX) errores.descripcion = 'larga'

  // La fecha es obligatoria y aquí sí lo es de verdad: no se puede contar un
  // plazo sin ella, y un parte sin fecha obliga a Alberto a perseguir al
  // cliente para preguntársela. (Contrasta con el vencimiento de una póliza
  // declarada, que se destaca pero NO se exige: allí el dato lo tiene la
  // compañía, aquí solo lo tiene quien lo vivió.)
  const fechaTexto = texto(entrada.fechaHecho)
  let fechaHecho: Date | null = null
  if (fechaTexto === null) errores.fechaHecho = 'falta'
  else {
    fechaHecho = parsearFechaHecho(fechaTexto)
    if (fechaHecho === null) errores.fechaHecho = 'formato'
    else if (fechaHecho.getTime() > diaUtc(hoy).getTime()) errores.fechaHecho = 'futura'
    else {
      const limite = diaUtc(hoy)
      limite.setUTCFullYear(limite.getUTCFullYear() - ANIOS_MAXIMOS_ATRAS)
      if (fechaHecho.getTime() < limite.getTime()) errores.fechaHecho = 'antigua'
    }
  }

  const horaTexto = texto(entrada.horaAproximada)
  if (horaTexto !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaTexto)) errores.horaAproximada = 'formato'

  const lugar = texto(entrada.lugar)
  if (lugar !== null && lugar.length > LUGAR_MAX) errores.lugar = 'larga'

  const polizaId = texto(entrada.polizaId)
  const polizaDeclaradaId = texto(entrada.polizaDeclaradaId)
  // Las dos a la vez sería un parte colgado de dos pólizas distintas. Ninguna
  // de las dos SÍ vale: «no sé cuál me cubre esto» es justo el caso en el que
  // el cliente necesita a Alberto, y exigirle que elija le deja fuera.
  if (polizaId !== null && polizaDeclaradaId !== null) errores.poliza = 'ambigua'

  if (Object.keys(errores).length > 0) return { ok: false, errores }

  return {
    ok: true,
    valor: {
      descripcion: descripcion as string,
      fechaHecho: (fechaHecho as Date).toISOString().slice(0, 10),
      horaAproximada: horaTexto,
      lugar,
      polizaId,
      polizaDeclaradaId,
      hayHeridos: normalizarTriestado(entrada.hayHeridos),
      hayTerceros: normalizarTriestado(entrada.hayTerceros),
    },
  }
}
