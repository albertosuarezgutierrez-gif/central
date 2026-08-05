import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Guardián del UPDATE de `reextraerDatosDeTexto` (05/08/2026).
 *
 * La re-extracción escribe con raw SQL, así que no hay función pura que
 * testear: el guardián mira el propio SQL. Hermano de
 * `documentos-escritura.test.ts`, y por la misma razón de fondo.
 *
 * Qué se protege: la línea que separa «no pises lo que otro averiguó» de «no
 * congeles tu propia lectura vieja».
 *
 * - Las columnas que también rellenan la ficha del BOE o el Catastro van con
 *   `COALESCE(columna, nuevo)`: solo tapan huecos.
 * - `tipo_bien` NO, y es deliberado: su única fuente es la descripción que esta
 *   misma función acaba de parsear. Un COALESCE ahí no protege a nadie —
 *   perpetúa la lectura de la versión vieja del extractor. Pasó de verdad: tras
 *   arreglar `tipoBien` (PR #1265), la unifamiliar de Alcalá del Río siguió
 *   marcada `garaje` en BD por la plaza de aparcamiento de su descripción, y esa
 *   columna es la que filtra `GET /api/subastas` y pinta el mapa.
 */
const FUENTE = readFileSync(fileURLToPath(new URL('./reextraer.ts', import.meta.url)), 'utf8')

const lineaDe = (col: string) =>
  FUENTE.split('\n').find((l) => new RegExp(`^\\s*${col} = `).test(l))

test('tipo_bien se re-deriva (el nuevo valor manda sobre el guardado)', () => {
  const linea = lineaDe('tipo_bien')
  assert.ok(linea, 'no se encuentra la asignación de tipo_bien en el UPDATE')
  // COALESCE(nuevo, viejo): el valor recién leído va PRIMERO.
  assert.match(
    linea!,
    /COALESCE\(\$\{d\.tipoBien[^)]*\}, tipo_bien\)/,
    'tipo_bien debe re-derivarse del texto, no conservar la lectura del extractor viejo',
  )
})

test('las columnas con otra fuente posible solo tapan huecos', () => {
  // Estas las puede rellenar la ficha del BOE o el Catastro con mejor dato que
  // una descripción de una línea: la re-extracción nunca debe pisarlas.
  for (const col of [
    'superficie', 'direccion', 'finca_registral', 'registro_propiedad',
    'dormitorios', 'banos', 'planta', 'cuota_participacion',
  ]) {
    const linea = lineaDe(col)
    assert.ok(linea, `no se encuentra la asignación de ${col}`)
    assert.match(
      linea!,
      new RegExp(`COALESCE\\(${col},`),
      `${col} debe conservar lo que ya hubiera: la columna se comparte con otras fuentes`,
    )
  }
})

test('la cola no filtra por «le falta algo» (dejaría el tipo viejo para siempre)', () => {
  // Una fila sin huecos puede seguir teniendo un tipo_bien que el parser de hoy
  // leería distinto. Si la cola la descarta, nunca se corrige.
  const cola = FUENTE.slice(FUENTE.indexOf('FROM subastas'), FUENTE.indexOf('ORDER BY'))
  assert.doesNotMatch(
    cola,
    /superficie IS NULL/,
    'la cola no puede exigir un hueco: la idempotencia la da el guardián del WHERE del UPDATE',
  )
})
