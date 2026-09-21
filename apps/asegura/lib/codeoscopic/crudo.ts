// Qué manda DE VERDAD el vendor en un catálogo, antes de que lo recortemos.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// `normalizarOpciones` (catalogos.ts) se queda con `id` y `nombre` y **tira todo
// lo demás**. Es lo correcto para pintar un desplegable, pero convierte una
// pregunta medible en una suposición: nadie ha visto nunca el JSON crudo de
// `GET /car/brands/{id}/models/{id}/vehicles`, así que «¿trae el vendor los años
// de fabricación de cada versión?» llevaba meses contestándose de memoria.
//
// Este módulo NO llama a nadie: resume un payload ya traído. Es puro a propósito
// (sin `./cliente.ts`, sin red) para poder probarlo con `node --test`.
//
// 🚨 Y no emite veredictos. Dice qué claves hay y enseña entradas ENTERAS; quién
// decide si eso sirve para cruzar con la fecha de matriculación es una persona
// mirando la muestra, no una heurística sobre nombres de campo.

/** Qué forma tenía el payload. `otro` NO es «vacío»: es «no lo he sabido leer». */
export type FormaCrudo = 'lista' | 'objeto_con_lista' | 'objeto' | 'otro'

export type ResumenCrudo = {
  forma: FormaCrudo
  /**
   * Cuántas entradas trae la lista. **`null` cuando no hay lista** — un `0`
   * diría «el vendor no devolvió versiones», y eso es otra cosa.
   */
  total: number | null
  /**
   * La UNIÓN de las claves de TODAS las entradas, ordenada. Unión y no las de
   * la primera: un campo que solo trae 1 de 50 versiones es justo el que se
   * perdería, y su ausencia se leería como «el vendor no lo manda».
   */
  claves: string[]
  /**
   * Atajo para no leer 40 claves a ojo: las que suenan a año o fecha.
   * **No es un veredicto.** Que salga vacía NO prueba que no haya años (pueden
   * venir dentro de `name`, o con un nombre que este filtro no reconoce); la
   * evidencia es `claves` + `muestra`.
   */
  clavesQueSuenanAAnio: string[]
  /** Las primeras entradas, ÍNTEGRAS y sin tocar. Es lo que se mira. */
  muestra: unknown[]
}

/** Cuántas entradas se devuelven enteras. Suficiente para ver la forma, poco para el ojo. */
export const MUESTRA = 3

/**
 * Palabras que en un catálogo de vehículos apuntan a un año o a un rango.
 *
 * 🚨 Deliberadamente ESTRECHA. La primera versión llevaba `to`, `from`, `fin`,
 * `end` y `model` sueltos y marcaba `motor`, `total`, `vendor` y `modelId`: un
 * atajo que señala ocho campos que no son años no ahorra mirar, entrena a no
 * mirar. Si se queda corta, `claves` sigue trayendo TODO — que es la evidencia.
 */
const SUENA_A_ANIO = /(anio|año|year|fecha|date|desde|hasta|produccion|production|fabricacion|manufactur)/i

/** Las claves de un objeto plano; `[]` para cualquier otra cosa. */
function clavesDe(v: unknown): string[] {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return []
  return Object.keys(v as Record<string, unknown>)
}

/**
 * La lista que trae el payload y con qué forma venía. Reconoce las mismas
 * envolturas que `extraerLista` de `catalogos.ts` (`items`/`data`/`results`/
 * `content`), porque el resumen tiene que mirar lo MISMO que mira producción:
 * si divergieran, esto mediría un payload que la app no usa.
 */
export function extraerLista(raw: unknown): { lista: unknown[] | null; forma: FormaCrudo } {
  if (Array.isArray(raw)) return { lista: raw, forma: 'lista' }
  if (typeof raw === 'object' && raw !== null) {
    for (const k of ['items', 'data', 'results', 'content']) {
      const v = (raw as Record<string, unknown>)[k]
      if (Array.isArray(v)) return { lista: v, forma: 'objeto_con_lista' }
    }
    return { lista: null, forma: 'objeto' }
  }
  return { lista: null, forma: 'otro' }
}

/** El payload del vendor → lo que hace falta para decidir, sin decidir nada. */
export function resumirCrudo(raw: unknown): ResumenCrudo {
  const { lista, forma } = extraerLista(raw)

  // Sin lista no hay entradas que resumir: se enseña el objeto entero como
  // muestra y `total` se queda en `null` (no se ha contado nada).
  if (lista === null) {
    const claves = clavesDe(raw)
    return {
      forma,
      total: null,
      claves,
      clavesQueSuenanAAnio: claves.filter((k) => SUENA_A_ANIO.test(k)),
      muestra: forma === 'otro' ? [] : [raw],
    }
  }

  const claves = [...new Set(lista.flatMap(clavesDe))].sort()
  return {
    forma,
    total: lista.length,
    claves,
    clavesQueSuenanAAnio: claves.filter((k) => SUENA_A_ANIO.test(k)),
    muestra: lista.slice(0, MUESTRA),
  }
}
