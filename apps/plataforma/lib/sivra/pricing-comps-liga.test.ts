import test from 'node:test'
import assert from 'node:assert/strict'
import {
  esCompDeNuestraLiga, notaCreible, sqlCompDeNuestraLiga, sqlNotaCreible,
  MAX_VENTAJA_NOTA, MIN_RESENAS_NOTA,
  guardaMonotoniaLiga, guardaMonotoniaLigaMed,
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

// ─── Guarda de MONOTONIA (03/09/2026, tras el incidente de Busto jul-ago 2027) ────────────────

test('el filtro se DESCARTA cuando encarece: caso real de Busto julio 2027', () => {
  // Medido en produccion: p40 sin filtrar 98,0€ / con filtro 146,4€ (+49%). El motor aplico el
  // filtrado y subio 61 noches un 37,8% hasta el tope del rail.
  const r = guardaMonotoniaLiga(
    { valores: { med: 146, flo: 120, cei: 200 }, n: 22 },
    { valores: { med: 98, flo: 80, cei: 150 }, n: 170 },
  )
  assert.equal(r.motivo, 'filtro_encarece')
  assert.equal(r.valores!.med, 98, 'manda el corpus completo, que es el barato')
  assert.equal(r.n, 170)
})

test('el filtro se APLICA cuando abarata, que es su trabajo normal', () => {
  // Busto junio: 151,6€ -> 100,6€. Aqui el filtro si separa ligas y debe mandar.
  const r = guardaMonotoniaLiga(
    { valores: { med: 100, flo: 85, cei: 140 }, n: 10 },
    { valores: { med: 151, flo: 120, cei: 210 }, n: 103 },
  )
  assert.equal(r.motivo, 'aplicado')
  assert.equal(r.valores!.med, 100)
  assert.equal(r.n, 10)
})

test('empate = se aplica: la guarda solo actua cuando ENCARECE de verdad', () => {
  const r = guardaMonotoniaLiga(
    { valores: { med: 120, flo: 100, cei: 160 }, n: 30 },
    { valores: { med: 120, flo: 100, cei: 160 }, n: 30 },
  )
  assert.equal(r.motivo, 'aplicado')
})

test('sin corpus en liga manda el completo, y se dice cual de los dos casos es', () => {
  const r = guardaMonotoniaLiga(
    { valores: null, n: 0 },
    { valores: { med: 110, flo: 90, cei: 150 }, n: 80 },
  )
  assert.equal(r.motivo, 'sin_corpus_liga')
  assert.equal(r.valores!.med, 110)
  // Y el simetrico NO se colapsa con 'aplicado': no se ha podido comprobar la monotonia.
  const r2 = guardaMonotoniaLiga({ valores: { med: 110, flo: 90, cei: 150 }, n: 8 }, { valores: null, n: 0 })
  assert.equal(r2.motivo, 'sin_referencia')
  assert.notEqual(r2.motivo, 'aplicado')
})

test('el trio viaja COMPLETO: no se mezcla el med de un corpus con el floor del otro', () => {
  // Un floor del corpus filtrado por encima del target del completo volveria a subir el precio
  // por la puerta de atras (el floor acota por abajo). Por eso se elige el trio entero.
  const r = guardaMonotoniaLiga(
    { valores: { med: 146, flo: 140, cei: 200 }, n: 22 },
    { valores: { med: 98, flo: 80, cei: 150 }, n: 170 },
  )
  assert.deepEqual(r.valores, { med: 98, flo: 80, cei: 150 })
})

test('la variante escalar del bucket de fecha se comporta igual', () => {
  assert.equal(guardaMonotoniaLigaMed({ med: 146, n: 22 }, { med: 98, n: 170 }).med, 98)
  assert.equal(guardaMonotoniaLigaMed({ med: 90, n: 22 }, { med: 98, n: 170 }).med, 90)
  assert.equal(guardaMonotoniaLigaMed({ med: null, n: 0 }, { med: 98, n: 170 }).motivo, 'sin_corpus_liga')
})

test('PROPIEDAD: el resultado nunca supera al corpus completo (barrido)', () => {
  for (let conLiga = 50; conLiga <= 300; conLiga += 7) {
    for (let sinLiga = 50; sinLiga <= 300; sinLiga += 11) {
      const r = guardaMonotoniaLiga(
        { valores: { med: conLiga, flo: conLiga - 10, cei: conLiga + 40 }, n: 20 },
        { valores: { med: sinLiga, flo: sinLiga - 10, cei: sinLiga + 40 }, n: 100 },
      )
      assert.ok(r.valores!.med <= sinLiga,
        `el filtro subio el ancla: ${conLiga} vs ${sinLiga} -> ${r.valores!.med}`)
    }
  }
})
