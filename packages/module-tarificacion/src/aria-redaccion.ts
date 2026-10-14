// Redacción del árbol de accesibilidad (`ariaSnapshot`) del tarificador (14/10/2026). PURA y COMPARTIDA: el worker la aplica
// al capturar y el servidor la re-aplica a lo que recibe (no se fía del worker). Fuente única.
//
// PRIVACIDAD: el snapshot lleva VALORES de campos (`- textbox "NIF" [ref=e4]: 12345678Z`) y OPCIONES ELEGIDAS
// (`- option "Sevilla" [selected]`, `- radio "Mujer" [checked]`): ambos son datos del cliente. Los campos pierden su valor y
// las opciones elegidas su NOMBRE (las no elegidas son el catálogo del portal y se conservan). Un `checkbox "Acepto" [checked]`
// conserva su nombre: es la etiqueta de un booleano, no un valor elegido (el estado `[checked]` ya es todo lo que dice).

import { redactarDatosPersonales } from './formador.ts'

export const MARCA_VALOR_ARIA = '«valor»'
const MARCA_DATO = '[DATO]'

/** Roles cuyo VALOR (lo escrito/elegido) va tras los dos puntos y se sustituye siempre. */
const ROL_CON_VALOR = '(?:textbox|combobox|spinbutton|searchbox|slider)'
/** Roles de OPCIÓN: su nombre ES el valor cuando están elegidos/marcados. */
const ROL_OPCION = '(?:option|radio|treeitem|listitem|menuitemradio)'
const NOMBRE = '"(?:[^"\\\\]|\\\\.)*"'
// `- textbox "Nombre" [ref=e3] [disabled]: valor` (nombre entre comillas con escapes, atributos entre corchetes). El valor es
// SOLO lo que va tras los `:` que siguen a los atributos / a la comilla de cierre del nombre: un «:» DENTRO del nombre no cuenta.
const LINEA_CAMPO = new RegExp(`^(\\s*-\\s+${ROL_CON_VALOR})((?:\\s+${NOMBRE})?(?:\\s*\\[[^\\]]*\\])*)(?:\\s*:(.*))?$`)
const LINEA_CAMPO_SUELTA = new RegExp(`^(\\s*-\\s+${ROL_CON_VALOR})\\b`)
// Opción (nombre entre comillas o ya redactado/sin comillas) + atributos; si entre ellos hay `selected`/`checked`, se tapa el nombre.
const LINEA_OPCION = new RegExp(`^(\\s*-\\s+${ROL_OPCION})\\s+(?:${NOMBRE}|[^\\[:"]*?)\\s*((?:\\[[^\\]]*\\]\\s*)+)(?::(.*))?$`)
const ATRIBUTO_ELEGIDA = /\[(?:selected|checked)(?:=(?!false\b)[^\]]*)?\]/
const LINEA_URL = /^(\s*-\s+\/url:\s*)(\S*?)(?:[?#].*)?$/
const FECHAS = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/g, // dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa
  /\b(?:19|20)\d{2}[/.-]\d{1,2}[/.-]\d{1,2}\b/g, // aaaa-mm-dd
]

/**
 * Neutraliza TODO `<` y `>` (→ `‹` `›`): el YAML del aria no los necesita y así el texto del portal (no confiable) no puede
 * abrir ni cerrar etiquetas del prompt (`</arbol_accesibilidad >`, mayúsculas, anidadas…). Idempotente.
 */
export function neutralizarAngulos(texto: string): string {
  return texto.replace(/</g, '‹').replace(/>/g, '›')
}

const sangria = (l: string): number => l.length - l.trimStart().length

/**
 * Redacta el texto de `ariaSnapshot`. Conserva roles, nombres accesibles, refs y estructura. Fail-closed: una línea de campo
 * que no se sabe interpretar pierde todo lo que sigue al rol. Idempotente.
 */
export function redactarAriaSnapshot(texto: string): string {
  const lineas = neutralizarAngulos(String(texto)).split('\n')
  const out: string[] = []
  let sangriaCampo = -1 // sangría de un campo con valor en bloque (`|`/`>`): se descartan sus líneas de continuación
  for (const l of lineas) {
    if (sangriaCampo >= 0) {
      if (l.trim() !== '' && sangria(l) > sangriaCampo && !/^\s*-\s/.test(l)) continue
      sangriaCampo = -1
    }
    const m = LINEA_CAMPO.exec(l)
    if (m) {
      const valor = m[3]
      if (valor !== undefined && valor.trim() !== '') {
        if (/^\s*[|>]/.test(valor)) sangriaCampo = sangria(l)
        out.push(`${m[1]}${m[2]}: ${MARCA_VALOR_ARIA}`)
      } else out.push(`${m[1]}${m[2]}${valor !== undefined ? ':' : ''}`)
      continue
    }
    const suelta = LINEA_CAMPO_SUELTA.exec(l)
    if (suelta) { out.push(`${suelta[1]}: ${MARCA_VALOR_ARIA}`); continue } // no interpretable: se tapa todo tras el rol
    const o = LINEA_OPCION.exec(l)
    if (o && ATRIBUTO_ELEGIDA.test(o[2])) {
      const valor = o[3]
      if (valor !== undefined && valor.trim() !== '' && /^\s*[|>]/.test(valor)) sangriaCampo = sangria(l)
      out.push(`${o[1]} ${MARCA_VALOR_ARIA} ${o[2].trim()}${valor !== undefined ? (valor.trim() !== '' ? `: ${MARCA_VALOR_ARIA}` : ':') : ''}`)
      continue
    }
    const u = LINEA_URL.exec(l)
    if (u) { out.push(`${u[1]}${u[2]}`); continue } // sin query ni fragmento (suelen llevar ids/DNI)
    out.push(l)
  }
  let r = redactarDatosPersonales(out.join('\n'))
  for (const f of FECHAS) r = r.replace(f, MARCA_DATO)
  return r
}

/**
 * Corta `texto` a ≤ `max` caracteres en un LÍMITE DE LÍNEA (si no hay, en el último espacio; si tampoco, en seco). Para acotar
 * ANTES de redactar sin partir un DNI/teléfono/fecha por la mitad: lo que quede a medias en el corte sería un trozo que los
 * patrones ya no reconocen.
 */
export function cortarEnLimiteDeLinea(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corte = texto.slice(0, max)
  // Si el carácter justo tras el corte ya es un salto, el corte ya es limpio.
  if (texto[max] === '\n') return corte
  const nl = corte.lastIndexOf('\n')
  if (nl > 0) return corte.slice(0, nl)
  const sp = corte.search(/\s\S*$/)
  return sp > 0 ? corte.slice(0, sp) : corte
}
