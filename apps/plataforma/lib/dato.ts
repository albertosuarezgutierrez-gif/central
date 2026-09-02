// apps/plataforma/lib/dato.ts
// Los TRES estados de un valor, como función pura y testeable. El componente <Dato> de
// `components/ui.tsx` es solo la piel de esto.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────────────────────
// Regla fundacional del CLAUDE.md raíz: «dato que NO hay ≠ dato que NO se ha mirado». Casi todas
// las pantallas de este panel viven sobre columnas de enriquecimiento asíncrono (las rellena un
// cron, un agente o un servicio externo: Catastro, BOE, Gmail, Smoobu, banca PSD2, IA…). En esas
// columnas `NULL` significa «todavía no se sabe», y el corpus SIEMPRE es más viejo que la
// columna: el día que se añade, TODAS las filas la tienen a NULL.
//
// Colapsar ese NULL con `?? 0` / `?? []` / `|| 0` y pintarlo como «sin documentos adjuntos»,
// «0 €» o un semáforo 🟢 convierte un «no lo sé» en una afirmación falsa — y son justo las
// afirmaciones sobre las que se decide. Caso fundacional (PR #1180): la ficha de una subasta
// decía «sin documentos adjuntos» mientras el BOE publicaba su edicto Y su certificación de
// cargas; 8 de las 11 subastas vivas mentían igual.
//
// Hasta ahora la regla se cumplía por VIGILANCIA: cada pantalla nueva tenía que acordarse. Esto
// la convierte en la opción por defecto.

/**
 * - `pendiente`: nadie lo ha mirado todavía (NULL de columna de enriquecimiento).
 * - `vacio`: se miró y no hay nada.
 * - `valor`: hay dato.
 */
export type EstadoDato = 'pendiente' | 'vacio' | 'valor'

/** `true` si el valor es un «todavía no se sabe». Solo `null` y `undefined` lo son. */
export function esPendiente(valor: unknown): boolean {
  return valor === null || valor === undefined
}

/**
 * Clasifica un valor en sus tres estados.
 *
 * ⚠️ El `0` numérico es un VALOR, no un vacío. «0 €» y «0 incidencias» son afirmaciones
 * legítimas que alguien comprobó; tratarlas como «no hay dato» es el error simétrico al que
 * motiva este módulo, y deja de pintar cifras correctas. Lo mismo con `false` y con `NaN`
 * (que si aparece es un fallo de cálculo aguas arriba y debe verse, no esconderse).
 *
 * Solo el array vacío y la cadena vacía son «revisado, no hay»: son las dos formas en que este
 * código representa una búsqueda que se hizo y volvió sin nada.
 */
export function estadoDato(valor: unknown): EstadoDato {
  if (esPendiente(valor)) return 'pendiente'
  if (Array.isArray(valor) && valor.length === 0) return 'vacio'
  if (valor === '') return 'vacio'
  return 'valor'
}

/**
 * Color de un importe por su signo, en tokens semánticos.
 *
 * Sustituye al `x >= 0 ? '#16a34a' : '#dc2626'` que estaba copiado a mano por todo el panel: un
 * hex fijo no cambia en modo oscuro y deja la cifra ilegible sobre fondo oscuro.
 */
export function colorImporte(n: number): string {
  return n >= 0 ? 'var(--positive)' : 'var(--negative)'
}
