import test from 'node:test'
import assert from 'node:assert/strict'
import {
  esCompDeNuestraLiga, notaCreible, sqlCompDeNuestraLiga, sqlNotaCreible,
  MAX_VENTAJA_NOTA, MIN_RESENAS_NOTA,
} from './pricing-comps-liga.ts'

// El caso fundacional: Busto Reform (6,9) contra el techo del mercado sevillano.
test('descarta el comp muy por encima de nuestra liga con nota creíble', () => {
  // Mercer Residences: 9,1 con 440 reseñas, en el corpus de un piso puntuado 6,9.
  assert.equal(esCompDeNuestraLiga(9.1, 440, 6.9), false)
  // Palacio Bucarelli: 9,1 con 1.218 reseñas.
  assert.equal(esCompDeNuestraLiga(9.1, 1218, 6.9), false)
})

test('el mismo comp SÍ entra en el corpus de un piso mejor puntuado', () => {
  // House Sevillana puntúa 8,4: un 9,1 está a 0,7 y sigue siendo su competencia.
  assert.equal(esCompDeNuestraLiga(9.1, 440, 8.4), true)
})

test('el límite es exactamente MAX_VENTAJA_NOTA e incluye el empate', () => {
  assert.equal(esCompDeNuestraLiga(6.9 + MAX_VENTAJA_NOTA, 500, 6.9), true)
  assert.equal(esCompDeNuestraLiga(6.9 + MAX_VENTAJA_NOTA + 0.1, 500, 6.9), false)
})

test('nunca descarta por abajo: un piso peor que el nuestro es competencia', () => {
  assert.equal(esCompDeNuestraLiga(5.0, 900, 8.4), true)
})

// Los tres «no lo sé». Ninguno puede expulsar a nadie.
test('sin nota del comp, entra: un no lo sé no autoriza a descartar', () => {
  assert.equal(esCompDeNuestraLiga(null, 900, 6.9), true)
  assert.equal(esCompDeNuestraLiga(undefined, 900, 6.9), true)
  assert.equal(esCompDeNuestraLiga(0, 900, 6.9), true)
})

test('con pocas reseñas la nota no es medición y el comp entra igual', () => {
  // "The Zentral Arroyo": 10,0 con 6 reseñas, 68 apariciones en el corpus de Busto.
  assert.equal(esCompDeNuestraLiga(10.0, 6, 6.9), true)
  assert.equal(esCompDeNuestraLiga(10.0, null, 6.9), true)
  // Justo en el umbral ya es creíble y entonces sí expulsa.
  assert.equal(esCompDeNuestraLiga(10.0, MIN_RESENAS_NOTA, 6.9), false)
  assert.equal(esCompDeNuestraLiga(10.0, MIN_RESENAS_NOTA - 1, 6.9), true)
})

test('sin NUESTRA nota no hay liga que comparar y entran todos', () => {
  assert.equal(esCompDeNuestraLiga(9.9, 5000, null), true)
  assert.equal(esCompDeNuestraLiga(9.9, 5000, undefined), true)
})

test('notaCreible exige nota positiva Y reseñas suficientes', () => {
  assert.equal(notaCreible(8.7, 1267), true)
  assert.equal(notaCreible(8.7, 6), false)
  assert.equal(notaCreible(null, 1267), false)
  assert.equal(notaCreible(0, 1267), false)
  assert.equal(notaCreible(8.7, null), false)
})

// Las gemelas SQL: no se comprueba el resultado (eso lo hace Postgres) sino que la condición
// mencione las tres puertas de escape, que es lo que evita que el filtro se vuelva agresivo.
test('la gemela SQL deja pasar los tres «no lo sé»', () => {
  const sql = sqlCompDeNuestraLiga('m.', 's.own_score')
  assert.match(sql, /s\.own_score IS NULL/)
  assert.match(sql, /m\.score IS NULL/)
  assert.match(sql, /m\.review_count < 30/)
  assert.match(sql, /m\.score <= s\.own_score \+ 1/)
})

test('la gemela SQL respeta el prefijo vacío', () => {
  const sql = sqlCompDeNuestraLiga()
  assert.match(sql, /\bscore IS NULL\b/)
  assert.ok(!sql.includes('m.'))
})

test('sqlNotaCreible exige nota y reseñas, sin puertas de escape', () => {
  const sql = sqlNotaCreible('m.')
  assert.match(sql, /m\.score IS NOT NULL/)
  assert.match(sql, /m\.review_count >= 30/)
  // Es la condición ESTRICTA: aquí un «no lo sé» no debe colarse en la mediana de calidad.
  assert.ok(!/IS NULL OR/.test(sql))
})
