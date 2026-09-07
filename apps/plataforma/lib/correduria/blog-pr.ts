// Lectura del PR que deja abierto el agente del blog, para la pantalla que lo aprueba.
//
// ─── Por qué el texto del artículo viaja en el CUERPO del PR ────────────────
// La alternativa era bajar `articulos.ts` de la rama y volver a parsear el
// bloque nuevo aquí. Eso significa dos parsers del mismo formato —el que
// escribe y el que lee— que se desincronizan al primer cambio de plantilla, y
// el modo de fallo es el peor posible: la pantalla enseña un texto que no es
// exactamente el que se va a publicar, y Alberto aprueba otra cosa.
//
// El agente escribe el texto plano entre dos marcas HTML dentro del cuerpo del
// PR. La marca es invisible en GitHub y aquí es una llave exacta.
//
// ─── Y por qué `null` no es cadena vacía ────────────────────────────────────
// Si las marcas no están (un PR editado a mano, un cuerpo truncado), esto
// devuelve `null` y la pantalla dice «no puedo enseñarte el texto, ábrelo en
// GitHub». Devolver `''` pintaría un recuadro vacío junto a un botón de
// publicar, que es una invitación a aprobar a ciegas.

export const MARCA_INI = '<!-- articulo:inicio -->'
export const MARCA_FIN = '<!-- articulo:fin -->'

export function extraerArticuloDePr(cuerpo: string | null | undefined): string | null {
  if (!cuerpo) return null
  const i = cuerpo.indexOf(MARCA_INI)
  const f = cuerpo.indexOf(MARCA_FIN)
  if (i === -1 || f === -1 || f <= i) return null
  const texto = cuerpo.slice(i + MARCA_INI.length, f).trim()
  return texto.length > 0 ? texto : null
}

/**
 * En qué estado está el PR para poder mergearse.
 *
 * 🚨 `no_comprobado` NO es «no se puede publicar». GitHub calcula la
 * mergeabilidad de forma asíncrona y devuelve `mergeable: null` mientras tanto:
 * pintarlo como bloqueado escondería un artículo que está perfectamente listo,
 * y pintarlo como listo prometería un botón que va a fallar. Se dice que aún no
 * se sabe y se deja intentar.
 */
export type EstadoPr =
  | 'listo' | 'checks' | 'conflicto' | 'desactualizada' | 'borrador' | 'no_comprobado'

export function estadoPr(pr: {
  mergeable?: boolean | null
  mergeable_state?: string | null
  draft?: boolean | null
}): EstadoPr {
  if (pr.draft) return 'borrador'
  switch (pr.mergeable_state) {
    case 'clean': return 'listo'
    case 'dirty': return 'conflicto'
    case 'blocked':
    case 'unstable': return 'checks'
    case 'behind': return 'desactualizada'
    default:
      // `mergeable:false` sin estado reconocible sigue siendo un «no se puede»
      // comprobado; cualquier otra cosa es que GitHub todavía no ha contestado.
      return pr.mergeable === false ? 'conflicto' : 'no_comprobado'
  }
}

export function explicarEstadoPr(e: EstadoPr): string {
  switch (e) {
    case 'listo': return 'Listo para publicar.'
    case 'checks': return 'Los tests del repo todavía no están en verde. Se puede intentar igualmente; si GitHub lo rechaza, te lo digo.'
    case 'conflicto': return 'La rama choca con lo que ya hay publicado. Hay que resolverlo en GitHub antes de publicar.'
    case 'desactualizada': return 'La rama va por detrás de main. GitHub puede rechazar el merge hasta actualizarla.'
    case 'borrador': return 'El PR está en borrador. Sácalo de borrador en GitHub para que arranquen los tests.'
    case 'no_comprobado': return 'GitHub todavía no ha calculado si se puede mezclar. No significa que esté bloqueado: prueba a publicar.'
  }
}

/**
 * Qué ha pasado cuando GitHub rechaza el merge.
 *
 * Un «no se ha podido publicar» a secas obliga a abrir GitHub para saber si
 * falta un check, si hay conflicto o si el token no tiene permiso — tres cosas
 * que se arreglan en tres sitios distintos. El mensaje de GitHub viene en
 * inglés y se conserva DEBAJO: es el dato, esto es la traducción.
 */
export function motivoMerge(status: number, mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (status === 405 && m.includes('conflict')) return 'GitHub dice que la rama tiene conflictos con main.'
  if (status === 405 && (m.includes('check') || m.includes('required'))) {
    return 'Faltan checks del repo por pasar. Suele resolverse solo en unos minutos; vuelve a intentarlo.'
  }
  if (status === 405) return 'GitHub no deja mezclar todavía.'
  if (status === 409) return 'La rama ha cambiado desde que se cargó esta pantalla. Recarga y vuelve a mirarla.'
  if (status === 403 || status === 401) return 'El token de GitHub no tiene permiso para mezclar. Hay que revisarlo en Vercel.'
  if (status === 404) return 'El PR ya no existe (¿lo has cerrado desde GitHub?).'
  return `GitHub ha respondido ${status}.`
}
