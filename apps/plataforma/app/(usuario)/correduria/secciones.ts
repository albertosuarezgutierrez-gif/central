/**
 * Las secciones de la pantalla de la correduría, sin JSX.
 *
 * Vive aparte de `Secciones.tsx` para que `seccionDeParametro` y
 * `contarAccionables` sean comprobables con `node --test`, que no sabe importar
 * `.tsx` — mismo reparto que `cliente/[id]/tabs.ts`.
 *
 * ─── Por qué cuatro secciones y no una tira de ocho bloques ──────────────────
 * La pantalla tenía ocho bloques apilados con el MISMO peso visual: los partes
 * que ha abierto un cliente y nadie ha mirado pesaban igual que la matriz de
 * comisiones cobradas de hace tres años. Lo que hace productiva una pantalla no
 * es enseñar más, es que lo primero que se ve sea lo único que hay que hacer.
 *
 *   Hoy       → lo que se hace con el teléfono en la mano y caduca.
 *   Cartera   → quién hay y qué vence (los 90 días enteros).
 *   Comisiones→ el dinero: devengado, liquidado y lo que entró al banco.
 *   Datos     → la calidad del dato (duplicadas, gente sin canal). No urge.
 *
 * ─── Y por qué esconder no es perder ────────────────────────────────────────
 * Una pestaña esconde, y un aviso que no se ve es un aviso que no existe (regla
 * global «¿en qué pantalla lo va a ver?»). Por eso cada sección lleva CONTADOR
 * en la barra: el trabajo pendiente se ve desde cualquier pestaña. Y por eso el
 * contador distingue tres estados —igual que `FichaTabs`—: un número, `0` (que
 * no se pinta) y `null` = «no se ha podido leer», que se pinta `!` y NUNCA 0.
 */

export type Seccion = 'hoy' | 'cartera' | 'comisiones' | 'datos'

export const SECCIONES: readonly Seccion[] = ['hoy', 'cartera', 'comisiones', 'datos']

/** Un `?s=` desconocido (o ausente) no deja la pantalla en blanco: cae a «Hoy». */
export function seccionDeParametro(v: string | string[] | undefined): Seccion {
  const s = Array.isArray(v) ? v[0] : v
  return SECCIONES.includes(s as Seccion) ? (s as Seccion) : 'hoy'
}

/**
 * Las urgencias que SÍ son trabajo de hoy.
 *
 * Las marca la LCS art. 22: dentro del mes de preaviso el tomador ya no puede
 * oponerse a la prórroga, así que «quedan 9 días» y «quedan 70» son trabajos
 * distintos. `a_tiempo` no entra en «Hoy» — entra en «Cartera», que enseña la
 * ventana entera de 90 días.
 *
 * Los nombres vienen del puerto de asegura (`urgencia` de cada vencimiento) y
 * se replican en `URGENCIAS` de `Renovaciones.tsx`, que es quien los pinta.
 */
export const URGENCIAS_ACCIONABLES: readonly string[] = [
  'vencida', 'prorroga_inevitable', 'ultima_llamada',
]

export function esAccionable(urgencia: string): boolean {
  return URGENCIAS_ACCIONABLES.includes(urgencia)
}

/**
 * Cuántas renovaciones son trabajo de hoy.
 *
 * `null` entra y sale: si el puerto no ha contestado no se sabe cuántas hay, y
 * decir 0 sería afirmar «no vence nada», que es justo la mentira que la regla
 * «dato que NO hay ≠ dato que NO se ha mirado» prohíbe.
 */
export function contarAccionables(
  polizas: readonly { urgencia: string }[] | null | undefined,
): number | null {
  if (!polizas) return null
  return polizas.filter(p => esAccionable(p.urgencia)).length
}

/**
 * El contador de una pestaña. `parcial` = alguna de las colas que suma no se ha
 * podido leer, así que el número es un SUELO («hay al menos esto»), no el total.
 */
export type Contador = { n: number; parcial: boolean }

/**
 * Agrega los contadores de las colas que viven en una sección.
 *
 * Tres desenlaces, no dos, y la diferencia es la que decide si Alberto abre la
 * pestaña o no:
 *   - todas las colas legibles     → `{ n, parcial:false }` — el total exacto.
 *   - algunas legibles, otras no   → `{ n, parcial:true }`  — «n+» en la barra.
 *   - ninguna legible              → `null`                 — «!»: no se sabe.
 *
 * Sumar 2 + 3 + «no se sabe» y pintar un 5 limpio esconde precisamente la cola
 * que se ha caído, que es de lo que hay que enterarse.
 */
export function agregarContadores(
  partes: readonly (number | null | undefined)[],
): Contador | null {
  let n = 0
  let conocidas = 0
  let ilegibles = 0
  for (const p of partes) {
    // 🚨 `undefined` y `null` NO son lo mismo, y confundirlos pinta un «!» de
    // alarma en la barra durante el segundo que tardan los bloques en cargar:
    //   undefined = todavía no ha contestado (no cuenta ni como hueco).
    //   null      = ha contestado que NO se puede saber (sí es un hueco).
    if (p === undefined) continue
    if (p === null) { ilegibles++; continue }
    n += p
    conocidas++
  }
  if (conocidas === 0) return ilegibles > 0 ? null : { n: 0, parcial: false }
  return { n, parcial: ilegibles > 0 }
}
