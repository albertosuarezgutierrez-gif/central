import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Guardián del UPDATE de `subastas.cargas` (04/08/2026).
 *
 * `documentos.ts` escribe el resultado de la lectura registral con raw SQL, así
 * que no hay función pura que testear: el guardián mira el propio SQL.
 *
 * Qué se protege: cuando la pasada SÍ lee cargas pero `cargasQueSubsisten` no
 * puede cuantificarlas (`importe: null` — el caso «subsisten, pero el importe no
 * es legible»), un `COALESCE(nuevo, cargas)` conserva la CIFRA DE LA PASADA
 * ANTERIOR. La ficha de Punta Umbría llegó a decir «hereda 43.200,00€» con el
 * texto de debajo diciendo «Cargas subsistentes sin cuantificar» — el número
 * viejo sobreviviendo a la lectura que lo desmentía.
 *
 * Regla de la casa: null = «no lo sé» (🟠 sin cuantificar), y eso es lo que hay
 * que persistir. Por eso la columna se pisa con CASE, no con COALESCE.
 */
const FUENTE = readFileSync(fileURLToPath(new URL('./documentos.ts', import.meta.url)), 'utf8')

test('cargas se pisa con CASE (una lectura sin importe deja null, no la cifra vieja)', () => {
  const linea = FUENTE.split('\n').find((l) => /^\s*cargas = /.test(l))
  assert.ok(linea, 'no se encuentra la asignación de la columna `cargas` en el UPDATE')
  assert.match(linea!, /CASE WHEN \$\{hayCargas\}/)
  assert.doesNotMatch(
    linea!,
    /COALESCE/,
    'COALESCE en `cargas` resucita el importe de la pasada anterior cuando la nueva lectura no puede cuantificar',
  )
})

test('las columnas que sí acumulan siguen con COALESCE', () => {
  // Estas no tienen el problema: su valor es no-nulo siempre que se hayan leído
  // cargas, o son acumulativas a propósito (la valoración pactada de la escritura
  // no se vuelve a publicar en cada certificación).
  for (const col of ['cargas_detalle', 'cargas_texto', 'cargas_fuente', 'valoracion_pactada']) {
    const linea = FUENTE.split('\n').find((l) => new RegExp(`^\\s*${col} = `).test(l))
    assert.ok(linea, `no se encuentra la asignación de ${col}`)
    assert.match(linea!, /COALESCE/, `${col} debería conservar lo anterior si esta pasada no lo trae`)
  }
})
