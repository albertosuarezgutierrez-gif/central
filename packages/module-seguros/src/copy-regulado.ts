// Lo que la correduría NO puede decir en una comunicación pública, en UN sitio.
//
// ─── Por qué existe este módulo ────────────────────────────────────────────
// La regla regulatoria es la misma escriba donde escriba: RDL 3/2020 (arts.
// 173-178) distingue INFORMAR de ASESORAR, y en cuanto un texto promete un
// precio, un ahorro o un superlativo sobre el resultado, deja de ser
// información comercial y pasa a ser asesoramiento — que arrastra análisis
// objetivo documentado e IPID entregado ANTES de contratar. Eso no se puede
// prometer desde una landing, y tampoco desde un post.
//
// Hasta el 07/09/2026 esa lista vivía SOLO dentro de `lib/ramos.test.ts` de
// `apps/asegura-web`, así que solo protegía a la web. En el momento en que la
// correduría empieza a publicar en redes, una segunda copia de estos patrones
// sería el fallo que este repo persigue en todas partes: dos listas que
// divergen y una de las dos deja de vigilar sin que nada falle.
//
// 🚨 Y en redes el daño no es simétrico: **una página se corrige y un post
// publicado no**. Un texto que promete precio en una web se edita en un
// commit; en LinkedIn ya lo ha visto quien lo iba a ver, se ha repartido y
// puede estar citado. Por eso el mismo cepo se aplica ANTES de publicar, no
// después.
//
// ─── Lo que este módulo NO hace ────────────────────────────────────────────
// No decide si un texto es BUENO. Solo caza las frases que convertirían la
// comunicación en asesoramiento o que acotarían la oferta. Un texto que pasa
// estos filtros puede seguir siendo un mal texto.

/** Una regla: el patrón que se busca y por qué está prohibido. */
export type ReglaCopy = {
  patron: RegExp
  porque: string
}

/**
 * Promesas de precio y superlativos sobre el resultado.
 *
 * 🚨 Los patrones NO llevan la bandera `g` a propósito: un `RegExp` global
 * guarda `lastIndex` entre llamadas, así que reutilizar la misma constante
 * sobre varios textos devolvería resultados distintos según el orden. Es un
 * fallo silencioso: el segundo texto sale limpio sin haberse mirado entero.
 */
export const PROHIBIDO: readonly ReglaCopy[] = [
  { patron: /\bahorr\w*\s+(hasta\s+)?(un\s+)?\d/i, porque: 'cifra de ahorro prometida' },
  { patron: /\bhasta\s+un\s+\d+\s*%/i, porque: 'porcentaje de ahorro prometido' },
  { patron: /\b(el|la)\s+mejor\s+(precio|p[óo]liza|seguro|oferta|prima)\b/i, porque: 'superlativo sobre el resultado' },
  { patron: /\bm[áa]s\s+barat\w+\b/i, porque: 'promesa de precio' },
  { patron: /\bprecio\s+m[áa]s\s+baj\w+\b/i, porque: 'promesa de precio' },
  { patron: /\bgarantizamos\b/i, porque: 'garantía que la correduría no puede dar' },
  { patron: /\bte\s+ahorramos\b/i, porque: 'promesa de ahorro' },
  { patron: /\bsin\s+letra\s+peque[ñn]a\b/i, porque: 'promesa sobre el condicionado de un tercero' },
]

/**
 * Frases que acotan el ÁMBITO del servicio.
 *
 * Un corredor inscrito en la DGSFP media en todo el territorio nacional, y así
 * se trabaja (dictado de Alberto, 07/09/2026). Escribir «en Sevilla» en un
 * encabezado no acota la palabra clave: acota la OFERTA — quien lee desde otra
 * provincia entiende en el primer renglón que no es cliente.
 *
 * El anclaje local no se pierde por esto: vive en la dirección postal de la
 * ficha `InsuranceAgency` y en el perfil de Google Business, que es de donde
 * sale la señal del pack local.
 */
export const ACOTA_AMBITO: readonly ReglaCopy[] = [
  { patron: /\ben\s+Sevilla\b/i, porque: 'acota el servicio a una ciudad' },
  { patron: /\bSevilla\s+y\s+(su\s+)?provincia\b/i, porque: 'acota el servicio a una provincia' },
  { patron: /\ben\s+Andaluc[íi]a\b/i, porque: 'acota el servicio a una comunidad' },
  { patron: /\bs[óo]lo\s+en\s+\w+/i, porque: 'exclusividad geográfica' },
]

/** Una infracción encontrada, con el TROZO real que la disparó. */
export type Infraccion = {
  /** El patrón, como texto, para poder citarlo en el mensaje de error. */
  patron: string
  porque: string
  /**
   * Lo que casó de verdad. Sin esto, un fallo dice «hay una promesa de precio
   * en el post 3» y hay que leerse el post entero para encontrarla.
   */
  fragmento: string
}

/**
 * Revisa un texto contra las reglas y devuelve TODAS las infracciones.
 *
 * Devuelve la lista completa, no la primera: quien escribe quiere corregir de
 * una pasada, y un cepo que se para en el primer fallo obliga a N vueltas.
 *
 * @param ambito - si además se comprueba que no acota la geografía (por
 *   defecto sí). Se puede apagar para un texto donde nombrar la ciudad ES el
 *   dato —el fuero de un aviso legal, la dirección de la oficina— y no una
 *   promesa comercial.
 */
export function revisarCopy(texto: string, opciones?: { ambito?: boolean }): Infraccion[] {
  const reglas = [...PROHIBIDO, ...(opciones?.ambito === false ? [] : ACOTA_AMBITO)]
  const encontradas: Infraccion[] = []
  for (const { patron, porque } of reglas) {
    const m = patron.exec(texto)
    if (m) encontradas.push({ patron: String(patron), porque, fragmento: m[0] })
  }
  return encontradas
}

/** Frase lista para el mensaje de un test o de un aviso. `''` si está limpio. */
export function explicarInfracciones(infracciones: readonly Infraccion[]): string {
  if (infracciones.length === 0) return ''
  return infracciones.map((i) => `«${i.fragmento}» → ${i.porque}`).join(' · ')
}
