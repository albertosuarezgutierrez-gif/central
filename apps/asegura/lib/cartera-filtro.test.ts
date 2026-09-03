import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardián del SQL del listado de cartera.
 *
 * Lee el FUENTE a propósito: lo que se vigila aquí son reglas que viven DENTRO
 * de un `Prisma.sql`, y ni `tsc` ni `next build` miran ahí. En este repo ya se
 * coló un `SELECT DISTINCT … ORDER BY` inválido (42P10) que mató un cron entero
 * con el typecheck en verde, y una columna leída que no estaba en el `SELECT`
 * dejó un aviso mudo con el dato en la BD.
 *
 * Las cuatro consultas se ejecutaron contra la BD real el 03/09/2026 (80
 * clientes vivos · 57 con auto y sin hogar · 32.471 leads · facetas auto 81 ·
 * hogar 19 · RC 9 · moto 1). Esto no sustituye a esa comprobación: la fija.
 */

const FUENTE = readFileSync(path.join(import.meta.dirname, 'cartera-filtro.ts'), 'utf8')

test('🚨 la prima 0 NO se sirve como importe: se anula a «sin dato»', () => {
  // Medido el 03/09/2026 sobre las 110 pólizas vivas: 60 traen importe, 26 lo
  // traen NULL y **24 lo traen a 0**. Sin el `nullif`, esas 24 filas pintan
  // «0,00€» — una afirmación sobre lo que paga el cliente que nadie ha
  // comprobado. Es el mismo criterio que `primaReferencia` en la ficha.
  assert.match(FUENTE, /nullif\(coalesce\(prima_bruta,\s*prima_anual\),\s*0\)/)
  assert.doesNotMatch(
    FUENTE,
    /(?<!nullif\()coalesce\(prima_bruta,\s*prima_anual\)::float8/,
    'un coalesce de primas sin nullif devuelve el 0 guardado como si fuera una prima',
  )
})

test('🚨 el grupo cliente/lead NO se lee de `clientes.tipo`', () => {
  // Esa columna dice 2.742 «cliente» y 29.860 «lead» cuando la cartera viva son
  // 80 clientes: es un campo del volcado que no mantiene nadie. El grupo se
  // deriva de tener pólizas vivas.
  assert.doesNotMatch(FUENTE, /c\.tipo/)
  assert.match(FUENTE, /v\.polizas_vivas > 0/)
  assert.match(FUENTE, /v\.polizas_vivas = 0/)
})

test('la definición de cartera viva viene del módulo, no se reescribe a mano', () => {
  assert.match(FUENTE, /@central\/module-seguros/)
  // Escribir `import_ref is null` a pelo se salta el segundo brazo
  // (`eiac_xml_hash`), que es el que tapa el agujero medido el 03/09/2026: una
  // póliza que CIMA mantiene al día contaba como lead.
  assert.doesNotMatch(FUENTE, /import_ref\s+is\s+null/i)
})

test('las lápidas de fusión se excluyen SIEMPRE (si no, el cliente sale dos veces)', () => {
  assert.match(FUENTE, /c\.merged_into_cliente_id is null/)
  assert.match(FUENTE, /p\.merged_into_poliza_id is null/)
})

test('el listado va paginado en SQL: los ~32.000 leads no se traen enteros', () => {
  assert.match(FUENTE, /limit \$\{f\.porPagina\} offset \$\{offset\}/)
  assert.match(FUENTE, /count\(\*\)::bigint as n/)
})
