// Lo que el CLIENTE lee de un presupuesto: etiquetas, comparación de garantías
// y las frases que no se pueden decir de otra manera.
//
// PURO a propósito: sin BD, sin React, sin `new Date()` implícito. Aquí vive
// todo lo que decide QUÉ SE AFIRMA, para poder probarlo sin levantar nada y
// para que el cepo lo pueda leer del fuente.
//
// ─── Por qué el texto vive aquí y no dentro del JSX ──────────────────────────
// Cada una de estas frases es una afirmación regulada. «Sin franquicia» y «el
// producto no declara franquicia» se pintan igual de bien y significan cosas
// distintas; «tu precio es 412,30€» sobre un precio `estimado` es una oferta que
// ninguna compañía ha cerrado. Con el texto repartido por tres componentes, la
// segunda pantalla que alguien escriba dirá la versión cómoda.
//
// ⚠️ Debería acabar en `@central/module-seguros`, junto a `presupuesto-cliente.ts`:
// la pantalla del CORREDOR (`/correduria`) va a necesitar la misma tabla de
// garantías, y dos copias de «qué es un ▼» divergen. Se queda aquí porque el
// PR 2 solo puede tocar el portal; está escrito sin una sola dependencia del
// portal para que subir sea mover el fichero.

import { revisarCopy, explicarInfracciones, VALIDEZ_PRESUPUESTO_DIAS } from '@central/module-seguros'

export { VALIDEZ_PRESUPUESTO_DIAS }

// ─── Firmeza ─────────────────────────────────────────────────────────────────

/**
 * Cómo de cerrado está un precio. Medido el 21/09/2026: de los 211 precios
 * guardados, **211 son `estimado` y ni uno `firme`**, y 24 de ellos no traen ni
 * un aviso — o sea, la compañía manda su bandera de estimación por defecto en
 * la cotización inicial. No es un caso borde: es el caso ÚNICO.
 */
export type Firmeza = 'firme' | 'condicionado' | 'estimado'

export function leerFirmeza(v: string | null | undefined): Firmeza {
  return v === 'firme' || v === 'condicionado' ? v : 'estimado'
}

/**
 * La frase que acompaña al precio, **por tarjeta y no en una nota al pie**.
 *
 * 🚨 Nunca «tu precio es X€». Entre este número y una póliza hay un ReRate que
 * puede moverlo y un Submit que puede fallar; decirlo como precio cerrado es
 * prometer algo que la compañía no ha dicho, y el cliente que se cree cubierto
 * y no lo está no tiene un problema de UX: tiene una reclamación.
 */
export const TEXTO_FIRMEZA: Record<Firmeza, string> = {
  estimado: 'Precio calculado. Lo confirmo con la compañía antes de contratar.',
  condicionado:
    'Precio calculado con reservas de la compañía. Lo confirmo con ella antes de contratar.',
  firme: 'La compañía ha confirmado este precio. Aun así, la póliza no existe hasta que la emita.',
}

/** La etiqueta corta del distintivo, la que va pegada al importe. */
export const ETIQUETA_FIRMEZA: Record<Firmeza, string> = {
  estimado: 'calculado',
  condicionado: 'con reservas',
  firme: 'confirmado',
}

/**
 * 🚨 La advertencia que NO se puede quitar de la página, solo de una tarjeta
 * `firme` — y hoy no hay ninguna. La aceptación es un encargo al corredor para
 * tramitar; no hay cobertura hasta que la compañía emita y lo comunique.
 */
export const AVISO_NO_ES_CONTRATACION =
  'Elegir una opción no contrata nada: es encargarme que la tramite. No tienes cobertura hasta que la compañía emita la póliza y te lo comunique.'

// ─── Franquicia ──────────────────────────────────────────────────────────────

/**
 * 🚨 `null` = **el producto no declara franquicia**, jamás «sin franquicia».
 * Enseñar un todo riesgo callando 1.500€ de franquicia es la versión cara de
 * leer mal un dato que sí está; decir «sin franquicia» sobre un hueco es la
 * versión cara de leer un dato que no está.
 *
 * Va pegada al precio (§4.3), no escondida en el detalle.
 */
export function textoFranquicia(franquiciaEur: number | null, eur: (n: number) => string): string {
  return franquiciaEur === null
    ? 'Franquicia: el producto no la declara'
    : `Franquicia: ${eur(franquiciaEur)}`
}

// ─── Los papeles de la portada ───────────────────────────────────────────────

export type PapelPortada = 'equivalente' | 'mas_barata' | 'mejor_cubierta'

export const PAPELES_CONOCIDOS: readonly PapelPortada[] = ['equivalente', 'mas_barata', 'mejor_cubierta']

export function esPapel(v: unknown): v is PapelPortada {
  return typeof v === 'string' && (PAPELES_CONOCIDOS as readonly string[]).includes(v)
}

/**
 * 🚨 Ni «la más barata» ni «el mejor precio»: los dos los prohíbe
 * `copy-regulado.ts` y los dos convierten un dato del presupuesto en una
 * promesa de precio. Lo que se dice es lo que se puede probar — que ES la de
 * menor importe DE LAS QUE HAY AQUÍ, no del mercado.
 */
const ETIQUETA_PAPEL: Record<PapelPortada, string> = {
  equivalente: 'La equivalente a lo que tienes hoy',
  mas_barata: 'La de menor importe de tu misma cobertura',
  mejor_cubierta: 'La que más cubre',
}

/**
 * Si dos papeles caen en la misma opción **se funden y se dice**, no se reparte
 * para tener tres tarjetas: una tarjeta de relleno es una recomendación que
 * nadie ha hecho.
 *
 * `coberturaDistinta` cambia la frase de `mas_barata` entera: sin equivalente,
 * la de menor importe NO comparte cobertura con la actual, y ordenar por precio
 * mezclando Terceros y Todo Riesgo es la mentira que justifica esta pantalla.
 */
export function etiquetaPapeles(papeles: readonly PapelPortada[], coberturaDistinta: boolean): string | null {
  const limpios = PAPELES_CONOCIDOS.filter((p) => papeles.includes(p))
  if (limpios.length === 0) return null
  if (coberturaDistinta && limpios.includes('mas_barata')) {
    const otros = limpios.filter((p) => p !== 'mas_barata').map((p) => ETIQUETA_PAPEL[p])
    const base = 'La de menor importe, con una cobertura DISTINTA de la tuya'
    return otros.length === 0 ? base : `${base} · ${otros.join(' · ')}`
  }
  if (limpios.length === 1) return ETIQUETA_PAPEL[limpios[0]!]
  return `Es a la vez ${limpios.map((p) => ETIQUETA_PAPEL[p].toLowerCase()).join(' y ')}`
}

// ─── Por qué no hay equivalente: DOS motivos, no uno ─────────────────────────

export type SinEquivalente = 'actual_sin_coberturas' | 'sin_equivalente'

/**
 * 🚨 Colapsar los dos es el fallo raíz del repo sobre la frase que más pesa en
 * la decisión del cliente. Uno dice «no sé leer lo tuyo» y el otro «he mirado y
 * no hay nada igual»: se arreglan en sitios distintos y llevan a decisiones
 * distintas.
 */
export const TEXTO_SIN_EQUIVALENTE: Record<SinEquivalente, string> = {
  actual_sin_coberturas:
    'No he podido comparar con lo que tienes hoy: tu compañía no me manda el desglose de tus garantías. No quiere decir que no haya nada parecido.',
  sin_equivalente:
    'He leído tu cobertura actual y ninguna compañía me ha dado un precio con esa misma cobertura.',
}

export function leerSinEquivalente(v: string | null | undefined): SinEquivalente | null {
  return v === 'actual_sin_coberturas' || v === 'sin_equivalente' ? v : null
}

// ─── La tabla de garantías: CUATRO estados por línea ─────────────────────────

export type EstadoGarantia = 'igual' | 'mejor' | 'peor' | 'no_consta'

export type LineaGarantia = {
  etiqueta: string
  estado: EstadoGarantia
}

/**
 * Qué se puede decir de la comparación, ANTES de mirar línea a línea.
 *
 * - `sin_poliza`        — no hay póliza actual (venta nueva). No se compara nada
 *                         y NO se calcula ningún ahorro.
 * - `actual_sin_desglose` — hay póliza y su compañía no manda las garantías.
 * - `opcion_sin_desglose` — la opción congelada no trae garantías. Hoy es el
 *                         caso de TODAS (ver la nota de `compararGarantias`).
 * - `comparada`         — se puede pintar línea a línea.
 */
export type EstadoComparacion = 'sin_poliza' | 'actual_sin_desglose' | 'opcion_sin_desglose' | 'comparada'

export type Comparacion = {
  estado: EstadoComparacion
  lineas: LineaGarantia[]
  /** Cuántas líneas salen PEOR. Se pinta siempre, aunque estropee la venta. */
  peores: number
}

export const TEXTO_COMPARACION: Record<Exclude<EstadoComparacion, 'comparada'>, string> = {
  sin_poliza:
    'No tengo tu seguro actual, así que no hay nada con lo que comparar. Lo que ves abajo es lo que te ofrecen las compañías, a secas.',
  actual_sin_desglose:
    'Tu compañía no me manda el desglose de tus garantías, así que no puedo compararlas una a una. Que no aparezcan aquí no significa que no las tengas.',
  opcion_sin_desglose:
    'De esta opción todavía no tengo el desglose de garantías, así que no puedo compararla línea a línea con la tuya. Pregúntame y te lo detallo.',
}

/** Para casar «Responsabilidad civil» con «RESPONSABILIDAD CIVIL  ». */
export function normalizarGarantia(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Compara las garantías de una opción con las de la póliza actual.
 *
 * 🚨 **`no_consta` NO se pinta como `igual`.** Una garantía que no se sabe si
 * está es lo contrario de una que se sabe que está, y pintarlas igual convierte
 * un hueco en una afirmación tranquilizadora — que es justo la clase de frase
 * sobre la que alguien decide cambiar de seguro.
 *
 * 🚨 **`peor` va PRIMERO en la lista**, no ordenado por nombre. Lo que puede
 * dejar a alguien peor cubierto no se entierra en la línea catorce, aunque
 * estropee la venta.
 *
 * ⚠️ Limitación real y declarada: hoy se comparan NOMBRES de garantía, no
 * capitales. «o con más capital» del §4.3 de la spec no se puede evaluar
 * mientras el snapshot congele las coberturas como textos sueltos. Una garantía
 * que está en las dos con la mitad de capital sale `igual`, y eso es un
 * `no_consta` disfrazado — por eso la pantalla acompaña la tabla con la frase
 * de que el condicionado manda.
 *
 * ⚠️ Y el `[]` de `nuevas` es AMBIGUO en la BD: `presupuesto_opcion.coberturas`
 * nace con `'[]'::jsonb` por defecto y hoy nadie lo rellena, así que «vacío» es
 * «no se congeló», nunca «esta opción no cubre nada». Se trata como
 * `opcion_sin_desglose`, que es lo único que se puede afirmar.
 */
export function compararGarantias(
  actuales: readonly string[] | null,
  nuevas: readonly string[],
  /**
   * 🚨 OBLIGATORIO y no inferido de `actuales`: «no hay póliza que comparar» y
   * «hay póliza y no se le ha podido leer el desglose» son los DOS estados que
   * esta función existe para no confundir, y los dos llegan aquí con
   * `actuales === null`. Adivinarlo con un `??` haría que el caso que importa
   * —el cliente que SÍ tiene un seguro cuya compañía no manda las garantías—
   * se pintara como «no tienes seguro».
   */
  opciones: { hayPolizaActual: boolean },
): Comparacion {
  const hayPoliza = opciones.hayPolizaActual
  const limpiasNuevas = limpiar(nuevas)
  const limpiasActuales = actuales === null ? null : limpiar(actuales)

  if (limpiasNuevas.length === 0) {
    const lineas = (limpiasActuales ?? []).map((etiqueta) => ({ etiqueta, estado: 'no_consta' as const }))
    return { estado: 'opcion_sin_desglose', lineas, peores: 0 }
  }

  if (!hayPoliza) {
    const lineas = limpiasNuevas.map((etiqueta) => ({ etiqueta, estado: 'no_consta' as const }))
    return { estado: 'sin_poliza', lineas, peores: 0 }
  }

  if (limpiasActuales === null || limpiasActuales.length === 0) {
    const lineas = limpiasNuevas.map((etiqueta) => ({ etiqueta, estado: 'no_consta' as const }))
    return { estado: 'actual_sin_desglose', lineas, peores: 0 }
  }

  const clavesNuevas = new Set(limpiasNuevas.map(normalizarGarantia))
  const clavesActuales = new Set(limpiasActuales.map(normalizarGarantia))

  const peor: LineaGarantia[] = []
  const igual: LineaGarantia[] = []
  const mejor: LineaGarantia[] = []

  for (const etiqueta of limpiasActuales) {
    if (clavesNuevas.has(normalizarGarantia(etiqueta))) igual.push({ etiqueta, estado: 'igual' })
    else peor.push({ etiqueta, estado: 'peor' })
  }
  for (const etiqueta of limpiasNuevas) {
    if (!clavesActuales.has(normalizarGarantia(etiqueta))) mejor.push({ etiqueta, estado: 'mejor' })
  }

  return { estado: 'comparada', lineas: [...peor, ...mejor, ...igual], peores: peor.length }
}

function limpiar(xs: readonly string[]): string[] {
  const vistas = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    if (typeof x !== 'string') continue
    const t = x.trim()
    if (t === '') continue
    const clave = normalizarGarantia(t)
    // Un valor que al normalizar se queda en nada («—», «...») no es una
    // garantía: es ruido del EIAC con forma de dato.
    if (clave === '' || vistas.has(clave)) continue
    vistas.add(clave)
    out.push(t)
  }
  return out
}

/** Lee el jsonb de `coberturas` sin fiarse de su forma. */
export function coberturasDeJson(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x === 'string') out.push(x)
    else if (x && typeof x === 'object') {
      const d = (x as Record<string, unknown>).descripcion ?? (x as Record<string, unknown>).nombre
      if (typeof d === 'string') out.push(d)
    }
  }
  return out
}

// ─── Caducidad ───────────────────────────────────────────────────────────────

/**
 * 🚨 **Nunca «válido hasta el X» a secas**: eso suena a compromiso de la
 * compañía, y la compañía no ha comprometido nada (`expirationDate` solo llega
 * tras el ReRate, y hoy no llega). La fecha la ponemos nosotros.
 */
export function textoCaducidad(calculadoEl: string, venceEl: string, caducado: boolean): string {
  return caducado
    ? `Estos precios los calculé el ${calculadoEl} y la fecha que me di para ellos (${venceEl}) ya ha pasado. No los doy por buenos: pídeme un precio actualizado.`
    : `Precios calculados el ${calculadoEl}. Los confirmo con la compañía antes de contratar; si tardas más de ${VALIDEZ_PRESUPUESTO_DIAS} días pueden cambiar (me los guardo hasta el ${venceEl}).`
}

// ─── Cuántas compañías se consultaron: lo que NO se puede afirmar ────────────

/**
 * 🚨 El snapshot **no guarda** cuántas compañías se consultaron ni cuántas no
 * dieron precio: `prepararPresupuesto()` congela solo las opciones de portada y
 * su `preciosTotales` no se escribe en ninguna columna. Así que la pantalla
 * dice lo único que puede probar —de cuántas compañías son las opciones que
 * tiene delante— y declara que el recuento de consultadas no consta aquí.
 *
 * Inventarlo a partir de las compañías de la portada diría «consulté 2» sobre
 * una tarificación de ocho, y es justo el número que sostiene el
 * «asesoramiento basado en análisis objetivo». Un dato que sostiene una
 * afirmación legal no se estima.
 */
export function textoCompaniasConsultadas(companiasEnPortada: number): string {
  const de =
    companiasEnPortada === 1
      ? 'Las opciones que te pongo delante son de 1 compañía.'
      : `Las opciones que te pongo delante son de ${companiasEnPortada} compañías.`
  return `${de} Consulté más de las que aparecen aquí; el detalle de cuáles y cuáles no dieron precio te lo doy cuando quieras.`
}

// ─── El cepo de copy, aplicado a lo de aquí ──────────────────────────────────

/**
 * Todo el texto FIJO de esta pantalla, en un sitio, para que el guardián lo
 * pase por `revisarCopy()` sin tener que leer el JSX. Lo que viene de la BD
 * (nombre de compañía, garantías del EIAC) no entra: no lo escribimos nosotros
 * y no se puede corregir desde aquí.
 */
export function copyFijo(): string[] {
  return [
    ...Object.values(TEXTO_FIRMEZA),
    ...Object.values(ETIQUETA_FIRMEZA),
    ...Object.values(ETIQUETA_PAPEL),
    ...Object.values(TEXTO_SIN_EQUIVALENTE),
    ...Object.values(TEXTO_COMPARACION),
    AVISO_NO_ES_CONTRATACION,
    TEXTO_CARATULA.titulo,
    TEXTO_CARATULA.cuerpo,
    TEXTO_CARATULA.enlaceMuerto,
    TEXTO_AJENO,
    TEXTO_VINCULO_AMBIGUO,
    etiquetaPapeles(['mas_barata'], true) ?? '',
    etiquetaPapeles(['equivalente', 'mas_barata'], false) ?? '',
    textoFranquicia(null, () => ''),
    textoCaducidad('1 de enero', '16 de enero', false),
    textoCaducidad('1 de enero', '16 de enero', true),
    textoCompaniasConsultadas(2),
  ]
}

/** `''` si está limpio; si no, la lista de infracciones lista para un `assert`. */
export function revisarCopyFijo(): string {
  return copyFijo()
    .map((t) => explicarInfracciones(revisarCopy(t)))
    .filter((s) => s !== '')
    .join(' | ')
}

// ─── Las frases de las puertas ───────────────────────────────────────────────

/**
 * 🚨 La carátula pública NO cuenta NADA del contenido: ni precio, ni compañía,
 * ni el bien asegurado, ni de quién es. Un enlace de correo se reenvía y se
 * queda en buzones compartidos, y en salud, vida o decesos el bien asegurado
 * roza un dato de categoría especial (§7 Q2).
 *
 * Es además la línea que ya tomó la invitación al portal el 08/09/2026: decirle
 * «te han preparado un presupuesto para tu coche» a quien todavía no ha probado
 * ser nadie ya es contar algo del presupuesto.
 */
export const TEXTO_CARATULA = {
  titulo: 'Tienes un presupuesto preparado',
  cuerpo:
    'Alberto Suárez, de Grupo ASegura, te ha preparado un presupuesto. Es personal, así que no se enseña aquí: entra con tu correo y te mando un código de un solo uso para verlo.',
  enlaceMuerto:
    'Este enlace ya no sirve. Puede que haya caducado o que se haya retirado. Escríbeme y te preparo otro.',
} as const

/**
 * 🚨 Texto NEUTRO: no se dice de quién es el presupuesto, ni si existe siquiera
 * para esa persona. Decirlo convertiría la URL en un oráculo de la cartera —
 * mismo razonamiento que `peticion-acceso.ts` y que el enlace de invitación.
 */
export const TEXTO_AJENO =
  'Este presupuesto es personal y no es de la cuenta con la que has entrado. Si es tuyo, sal y vuelve a entrar con el correo al que te llegó.'

/** La misma frase que ya usa la bóveda cuando el vínculo sale `ambiguo`. */
export const TEXTO_VINCULO_AMBIGUO =
  'Tu correo aparece en más de una ficha, así que lo está revisando el corredor. En cuanto lo resuelva podrás verlo aquí.'
