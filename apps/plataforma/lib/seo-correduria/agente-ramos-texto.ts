// lib/seo-correduria/agente-ramos-texto.ts — edición de texto QUIRÚRGICA sobre el contenido
// (string) de apps/asegura-web/lib/ramos.ts. Puro: no toca disco ni red — recibe el contenido
// ya leído (de GitHub, ver agente-github.ts) y devuelve el contenido modificado.
//
// Por qué edición de texto y no un parser TS: `ramos.ts` es la fuente que YA vigila
// `ramos.test.ts` (65/165 chars, sin precio, ámbito nacional…) en el propio repo de
// asegura-web — el agente solo tiene que cambiar dos campos de UN objeto sin tocar el resto
// del fichero un carácter, y una edición de texto acotada dice exactamente qué tocó (útil en
// el diff del PR). Un AST completo sería más robusto pero also más opaco en el diff.
//
// 🚨 NUNCA falla en silencio: si el slug o el campo no aparecen con la forma esperada, lanza.
// Un "no encontré nada que cambiar" que devolviera el contenido intacto haría que el PR se
// abriera vacío y el cambio se diera por aplicado sin haberlo estado.

export type CambioRamo = { title?: string; description?: string }

/** Ventana del array que corresponde a UN ramo: desde su `slug: '<slug>'` hasta el `slug:`
 *  siguiente (o el cierre del array `\n]`). Lanza si el slug no aparece. */
function ventanaDeSlug(contenido: string, slug: string): { inicio: number; fin: number } {
  const marca = `slug: '${slug}',`
  const inicio = contenido.indexOf(marca)
  if (inicio === -1) throw new Error(`agente-ramos-texto: no se encuentra el ramo '${slug}' en ramos.ts (marca «${marca}» ausente)`)
  const siguienteSlug = contenido.indexOf(`\n  {`, inicio + marca.length)
  const cierreArray = contenido.indexOf('\n]', inicio + marca.length)
  const candidatos = [siguienteSlug, cierreArray].filter((n) => n !== -1)
  const fin = candidatos.length ? Math.min(...candidatos) : contenido.length
  return { inicio, fin }
}

/** Lee el `title`/`description` ACTUALES de un ramo (para el "antes" de la auditoría y para
 *  dar contexto al prompt de la IA). Lanza si no encuentra el ramo o el campo. */
export function leerCampoRamo(contenido: string, slug: string, campo: 'title' | 'description'): string {
  const { inicio, fin } = ventanaDeSlug(contenido, slug)
  const ventana = contenido.slice(inicio, fin)
  if (campo === 'title') {
    const m = ventana.match(/title: '((?:[^'\\]|\\.)*)',/)
    if (!m) throw new Error(`agente-ramos-texto: '${slug}' no tiene un 'title' con la forma esperada`)
    return desescaparComilla(m[1])
  }
  const m = ventana.match(/description:\s*\n\s*'((?:[^'\\]|\\.)*)',/)
  if (!m) throw new Error(`agente-ramos-texto: '${slug}' no tiene una 'description' con la forma esperada`)
  return desescaparComilla(m[1])
}

function escaparComilla(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Inversa de `escaparComilla`, para que leer lo que se acaba de escribir dé el texto real. */
function desescaparComilla(texto: string): string {
  return texto.replace(/\\(.)/g, '$1')
}

/** Aplica `cambios.title`/`cambios.description` al ramo `slug` dentro de `contenido` y
 *  devuelve el fichero completo modificado. Lanza si no hay nada reconocible que cambiar —
 *  nunca devuelve el contenido intacto en silencio. */
export function aplicarCambioRamo(contenido: string, slug: string, cambios: CambioRamo): string {
  if (!cambios.title && !cambios.description) {
    throw new Error('agente-ramos-texto: aplicarCambioRamo sin ningún campo que cambiar')
  }
  const { inicio, fin } = ventanaDeSlug(contenido, slug)
  let ventana = contenido.slice(inicio, fin)

  if (cambios.title !== undefined) {
    const re = /title: '(?:[^'\\]|\\.)*',/
    if (!re.test(ventana)) throw new Error(`agente-ramos-texto: '${slug}' no tiene un 'title' con la forma esperada`)
    ventana = ventana.replace(re, `title: '${escaparComilla(cambios.title)}',`)
  }
  if (cambios.description !== undefined) {
    const re = /description:\s*\n(\s*)'(?:[^'\\]|\\.)*',/
    const m = ventana.match(re)
    if (!m) throw new Error(`agente-ramos-texto: '${slug}' no tiene una 'description' con la forma esperada`)
    const sangria = m[1]
    ventana = ventana.replace(re, `description:\n${sangria}'${escaparComilla(cambios.description)}',`)
  }

  return contenido.slice(0, inicio) + ventana + contenido.slice(fin)
}
