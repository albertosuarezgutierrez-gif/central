/**
 * EIAC `CodigoEntidad` — el código DGS de la aseguradora, en las DOS formas que
 * conviven a partir del 16/11/2026 (entrada en producción de EIAC V07.1):
 *
 *   - V06 (ficheros 6.0): objeto `<CodigoEntidad><CodigoInterno/><CodigoDGS>C0058</CodigoDGS></CodigoEntidad>`.
 *   - V07.1: texto simple `<CodigoEntidad>C0001</CodigoEntidad>` (XSD `_t_codigoDGSea`).
 *
 * Sin esto, un fichero 7.1 deja `codigoEntidadDgs` a null en POL/REC/SIN/CEF y
 * REC/SIN/CEF caen en cuarentena en bloque. PURO: sin BD, sin red, sin env.
 *
 * Se lee SOLO `CodigoDGS` del objeto (nunca `CodigoInterno`): el medidor de
 * cobertura y `cimaExtra` observan con un Proxy qué rutas se leen, y leer de más
 * escondería `CodigoInterno` del «resto» de CIMA.
 */

/** Forma de `CodigoEntidad` que puede traer el árbol parseado (V06 objeto, V07.1 texto). */
export type CodigoEntidadEiac = string | { CodigoDGS?: unknown; CodigoInterno?: unknown };

/** Motivo (sin PII) cuando `CodigoEntidad` vino pero con una forma que no sabemos leer. */
export const CODIGO_ENTIDAD_FORMATO_DESCONOCIDO = "codigo_entidad_formato_desconocido";

/**
 * Clave del texto de un nodo con atributos en `fast-xml-parser` (`textNodeName` por
 * defecto). Hoy `manual-xml.ts` parsea con `ignoreAttributes: true` y no se produce,
 * pero si un día el nodo V07.1 trae atributos y se dejan de ignorar, llega
 * `{ "#text": "C0001", … }`: se lee como el texto V07.1 (o «formato desconocido»
 * si no cumple), NUNCA como «falta» (que es lo que daría la rama del objeto V06).
 */
const TEXTO_NODO = "#text";

/** V07.1 `_t_codigoDGSea`: una letra + cuatro cifras (C0001, M0123…). */
const CODIGO_DGS_V07 = /^[A-Z]\d{4}$/;

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Igual que el `str()` de los mappers: texto recortado (o número → texto); vacío → null. */
function texto(raw: unknown): string | null {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

/**
 * PURA. Código DGS de la entidad a partir del VALOR de `CodigoEntidad`:
 *   - objeto (V06) → su `CodigoDGS` tal cual lo leían los mappers (recortado; sin
 *     validar formato, para no cambiar lo que ya entraba con 6.0);
 *   - texto (V07.1) → recortado y en mayúsculas, SOLO si cumple `^[A-Z]\d{4}$`;
 *   - objeto `{ "#text": … }` sin `CodigoDGS` (nodo con atributos) → como el texto V07.1;
 *   - cualquier otra cosa (número, array, texto con otra forma, ausente) → null.
 * Nunca inventa un código: ante la duda, null («no se sabe»).
 */
export function codigoDgsDe(valor: unknown): string | null {
  if (esObjetoPlano(valor)) {
    if (TEXTO_NODO in valor && !("CodigoDGS" in valor)) return codigoDgsDeTexto(valor[TEXTO_NODO]);
    return texto(valor.CodigoDGS);
  }
  return codigoDgsDeTexto(valor);
}

/** Forma V07.1 (texto): recortado y en mayúsculas solo si cumple `^[A-Z]\d{4}$`. */
function codigoDgsDeTexto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim().toUpperCase();
  return CODIGO_DGS_V07.test(t) ? t : null;
}

/**
 * PURA. ¿Vino `CodigoEntidad` con un valor que NO sabemos leer? Distingue
 * «formato desconocido» de «falta»: ausente, texto vacío u objeto V06 sin
 * `CodigoDGS` son «falta» (false); un texto que no es `[A-Z]\d{4}`, un número o un
 * array (etiqueta repetida) son formato desconocido (true). Un `{ "#text": … }` sin
 * `CodigoDGS` se juzga por su texto: legible → false; ilegible → true; nunca «falta».
 */
export function codigoEntidadFormatoDesconocido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false;
  if (esObjetoPlano(valor) && !(TEXTO_NODO in valor && !("CodigoDGS" in valor))) return false;
  if (typeof valor === "string" && valor.trim() === "") return false;
  return codigoDgsDe(valor) === null;
}
