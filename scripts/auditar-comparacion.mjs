// Criterio de comparación del auditor (`auditar-estructura.mjs --check`): QUÉ cuenta como
// "el generado está desfasado". Puro y sin I/O a propósito, para poder testearlo:
// `test/regression-auditar-novedades.test.ts`.
//
// 🚨 POR QUÉ EXISTE ESTE ARCHIVO (02/09/2026, PRs #2044 y #2053). El generado incrusta el
// bloque `novedades`, que el auditor deriva de `docs/CONTEXTO-SESIONES.md` — y en esa memoria
// escribe TODA sesión al cerrar (hook `Stop`). Consecuencia mecánica: cualquier PR que anotara
// memoria dejaba `estructura.generated.json` "desfasado" SIN haber tocado una línea de código,
// y el gate se ponía rojo por algo que no es estructura. Medido: en la base `2cb05af6`, el
// `--check` fallaba con un diff de dos líneas — el timestamp y un título de novedad.
//
// Un gate que se rompe solo se acaba ignorando, y entonces deja de avisar del desfase que SÍ
// importa (el del #2044: una entrada apuntando a un archivo borrado). Por eso la comparación
// mira la ESTRUCTURA y no el diario.
//
// Lo que se ignora al comparar y por qué:
//   · `generadoEn` / `sha` — cambian en cada corrida; contarlos daría churn y auto-commits en bucle.
//   · `novedades` — se derivan de la memoria, no del código (lo de arriba).
// ⚠️ Ignorarlas al COMPARAR no es dejar de actualizarlas: el auditor sigue escribiendo las
// novedades frescas cuando regenera (la escritura compara byte a byte). Lo único que cambia es
// que su cambio ya no marca el generado como desfasado.

/** Cabecera de la sección de novedades del markdown (última sección de `buildMd`). */
export const SECCION_NOVEDADES = '## Novedades recientes'

/** Recorta la sección de novedades del markdown (va al final; sin cabecera, devuelve igual). */
export function sinSeccionNovedades(md) {
  const i = md.indexOf(SECCION_NOVEDADES)
  return i === -1 ? md : md.slice(0, i)
}

/** Radiografía comparable: sin timestamp y sin el diario de novedades. */
export function estableJson(o) {
  return JSON.stringify({ ...o, generadoEn: '', novedades: [] }, null, 2)
}

/** Markdown comparable: sin la línea del timestamp y sin la sección de novedades. */
export function estableMd(s) {
  return sinSeccionNovedades(s).replace(/\(20\d\d-[^)]*Z\)/g, '(TS)')
}

/** Índice de funciones comparable: sin timestamp ni sha del checkout. */
export function estableMapa(o) {
  return JSON.stringify({ ...o, generadoEn: '', sha: '' }, null, 2)
}
