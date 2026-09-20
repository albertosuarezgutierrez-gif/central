/**
 * Las secciones de la pantalla de la correduría, sin JSX.
 *
 * Vive aparte de `Secciones.tsx` para que `seccionDeParametro` y
 * `contarAccionables` sean comprobables con `node --test`, que no sabe importar
 * `.tsx` — mismo reparto que `cliente/[id]/tabs.ts`.
 *
 * ─── Por qué CINCO secciones y no una tira de ocho bloques ───────────────────
 * La pantalla tenía ocho bloques apilados con el MISMO peso visual: los partes
 * que ha abierto un cliente y nadie ha mirado pesaban igual que la matriz de
 * comisiones cobradas de hace tres años. Lo que hace productiva una pantalla no
 * es enseñar más, es que lo primero que se ve sea lo único que hay que hacer.
 *
 *   Hoy       → lo que se hace con el teléfono en la mano y caduca.
 *   Clientes  → el listado FILTRABLE: buscar por ramo, compañía, provincia,
 *               vencimiento o hueco de venta cruzada, y sacar la lista.
 *   Cartera   → la foto: cuántos hay y qué vence (los 90 días enteros).
 *   Comisiones→ el dinero: devengado, liquidado y lo que entró al banco.
 *   Datos     → la calidad del dato (duplicadas, gente sin canal). No urge.
 *   Ingesta   → si lo que mandan las compañías por CIMA está ENTRANDO: ficheros
 *               atascados, pólizas que CIMA nombra y no tenemos, envíos que
 *               rechazamos y compañías que han dejado de mandar. Va aquí y no
 *               en el CRM de origen (`app.grupoasegura.com/salud-cima`) porque
 *               esa app Alberto no la abre, y un aviso que sale por un canal que
 *               la persona no mira es un aviso que no existe. Lo que URGE de
 *               esta sección sube solo a «Hoy» como tarjeta, y solo cuando hay
 *               algo: con la ingesta al día no ocupa ni un píxel.
 *   Redes     → lo que se va a publicar: los artículos del blog que esperan tu
 *               OK y los borradores de LinkedIn. Va la última a propósito: es lo
 *               único de la pantalla que mira hacia FUERA, y no compite con la
 *               cartera que ya está dentro.
 *
 * «Clientes» y «Cartera» no son lo mismo aunque hablen de la misma gente: una
 * es la herramienta de trabajo (filtrar y sacar una lista para llamar) y la
 * otra el resumen. Meterlas en la misma pestaña haría que la foto —que se mira
 * una vez al día— compitiera con el filtro, que se usa constantemente.
 *
 * ─── Y por qué esconder no es perder ────────────────────────────────────────
 * Una pestaña esconde, y un aviso que no se ve es un aviso que no existe (regla
 * global «¿en qué pantalla lo va a ver?»). Por eso cada sección lleva CONTADOR
 * en la barra: el trabajo pendiente se ve desde cualquier pestaña. Y por eso el
 * contador distingue tres estados —igual que `FichaTabs`—: un número, `0` (que
 * no se pinta) y `null` = «no se ha podido leer», que se pinta `!` y NUNCA 0.
 *
 * 🚨 «Redes» cuenta SOLO los artículos del blog, y eso no es una excepción a
 * la regla: es la regla. El contador mide trabajo pendiente, y de los dos
 * bloques de la sección solo uno se puede saber. Los borradores de LinkedIn no
 * («sin publicar» lo sabe LinkedIn, no el repo: pintar 6 diría «tienes 6 cosas
 * pendientes» cuando podrían estar los 6 publicados). Un artículo del blog sí:
 * es un PR abierto que nadie ha aprobado, se cuenta preguntándole a GitHub, y
 * si GitHub no contesta se reporta `null` (`!`), nunca 0.
 *
 * Y no es decorativo. El agente hermano de `apps/ia-rest` tiene cuatro
 * borradores parados desde junio porque esperan en una pantalla en la que nadie
 * entra; «Redes» es la última pestaña y la que menos se abre. El badge es
 * exactamente lo que impide que esta pantalla repita aquel fallo.
 */

export type Seccion =
  | 'hoy' | 'actividad' | 'clientes' | 'cartera' | 'comisiones' | 'datos' | 'ingesta' | 'redes'

export const SECCIONES: readonly Seccion[] = [
  'hoy', 'actividad', 'clientes', 'cartera', 'comisiones', 'datos', 'ingesta', 'redes',
]

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
 * 🚨 `'vencida'` lleva aquí desde el principio y hasta el 20/09/2026 NO LA
 * EMITÍA NADIE: el puerto de asegura consultaba `fechaVencimiento >= hoy`, así
 * que una póliza vencida sin gestionar no llegaba a esta lista y este contador
 * no podía sumarla nunca. Era un contador correcto sobre un dato que no existía
 * — indistinguible de uno que funciona. Con la ventana mirando una anualidad
 * hacia atrás, esa urgencia ya llega y las vencidas SUMAN en el badge de «Hoy»,
 * que es para lo que están en esta lista. Lo vigila
 * `test/regression-vencimientos-vencidas.test.ts`.
 *
 * Lo que NO entra en «Hoy» son las vigentes con un vencimiento anterior a esa
 * anualidad (8 filas de 2013-2019 con prima 0): no son renovaciones de este año
 * y enterrarían las recuperables. No se esconden — el puerto las cuenta aparte
 * y `Renovaciones.tsx` las declara al pie de «Cartera».
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

/**
 * Cómo se DICE cuántas pólizas vigentes arrastran un vencimiento anterior a la
 * ventana de renovación (más de una anualidad: 8 filas de 2013-2019 medidas el
 * 20/09/2026). No son trabajo de hoy —por eso no entran en la lista ni en el
 * contador de arriba— pero tampoco se esconden.
 *
 * Vive aquí y no en el JSX por la regla global del repo: la lógica del titular
 * va en un helper puro y testeado. Y lo que hay que testear son justo los TRES
 * estados, que se arreglan en tres sitios distintos:
 *
 *   `undefined` → la versión desplegada de asegura no manda el recuento (se
 *                 despliega asegura). NO es «no hay ninguna».
 *   `null`      → se intentó contar y no se pudo (se mira el puerto). Tampoco.
 *   número      → las que hay. Aquí un `0` SÍ es una afirmación comprobada, y
 *                 ese es el error simétrico: tratarlo como hueco haría que la
 *                 pantalla dejara de decir lo que sabe.
 *
 * Las tres frases tienen que ser DISTINTAS: colapsar dos manda a Alberto al
 * sitio equivocado, que es exactamente lo que el bug de las vencidas hacía.
 */
export function textoVencidasAntiguas(n: number | null | undefined): string {
  if (n === undefined) {
    return 'La versión desplegada de asegura todavía no dice cuántas pólizas figuran vigentes ' +
      'con un vencimiento anterior a esa ventana. No es que no haya: es que no llega por el puerto.'
  }
  if (n === null) {
    return 'No se ha podido contar cuántas pólizas figuran vigentes con un vencimiento anterior ' +
      'a esa ventana. No hay que entenderlo como «ninguna».'
  }
  if (n === 0) return 'Ninguna póliza vigente arrastra un vencimiento anterior a esa ventana.'
  const p = n === 1
    ? '1 póliza figura vigente'
    : `${n} pólizas figuran vigentes`
  return `${p} con un vencimiento anterior a esa ventana (más de una anualidad). No son ` +
    'renovaciones de este año: es dato a depurar, y por eso no entran en la lista ni en el ' +
    'contador de «Hoy».'
}
