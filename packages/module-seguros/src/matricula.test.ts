import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALFABETO_SERIE,
  PRIMERA_MATRICULA_MODERNA,
  ULTIMO_HITO_CONOCIDO,
  fechaMatriculacionEstimada,
  formatoMatricula,
  normalizarMatricula,
  ordinalMatricula,
} from './matricula.ts'

// ⚠️ TODAS las matrículas de este fichero están FABRICADAS a partir de la propia
// tabla de series (ordinal → texto). Ninguna sale de la cartera real: la
// matrícula es dato personal y no tiene por qué vivir en un test.
function matriculaDeOrdinal(ordinal: number): string {
  const serie = Math.floor(ordinal / 10000)
  const numero = ordinal % 10000
  const a = ALFABETO_SERIE[Math.floor(serie / 400)]!
  const b = ALFABETO_SERIE[Math.floor(serie / 20) % 20]!
  const c = ALFABETO_SERIE[serie % 20]!
  return `${String(numero).padStart(4, '0')}${a}${b}${c}`
}

// ── normalización ────────────────────────────────────────────────────────────

test('normalizar quita espacios, guiones y puntos y pasa a mayúsculas', () => {
  assert.equal(normalizarMatricula('1234 bcd'), '1234BCD')
  assert.equal(normalizarMatricula('1234-BCD'), '1234BCD')
  assert.equal(normalizarMatricula('  1234 - b c d  '), '1234BCD')
  assert.equal(normalizarMatricula('1234.BCD'), '1234BCD')
  assert.equal(normalizarMatricula(''), '')
})

test('la estimación no depende de cómo venga escrita la matrícula', () => {
  const canonica = fechaMatriculacionEstimada('1234BCD')
  assert.notEqual(canonica, null)
  for (const variante of ['1234 BCD', '1234-bcd', ' 1234  bcd ', '1234.BCD']) {
    assert.deepEqual(fechaMatriculacionEstimada(variante), canonica)
  }
})

// ── formato ──────────────────────────────────────────────────────────────────

test('clasifica los formatos que se ven en la cartera', () => {
  assert.equal(formatoMatricula('0000BBB'), 'moderna')
  assert.equal(formatoMatricula('9999 ZZZ'), 'moderna')
  assert.equal(formatoMatricula('M-1234-AB'), 'provincial')
  assert.equal(formatoMatricula('SE1234BC'), 'provincial')
  assert.equal(formatoMatricula('M-123456'), 'provincial')
  assert.equal(formatoMatricula('C1234BCD'), 'ciclomotor')
  assert.equal(formatoMatricula(''), 'desconocido')
  assert.equal(formatoMatricula('no es una matrícula'), 'desconocido')
})

test('C1234BC es una provincial de A Coruña, no un ciclomotor', () => {
  // El ciclomotor lleva TRES letras al final; la provincial, dos.
  assert.equal(formatoMatricula('C-1234-BC'), 'provincial')
  assert.equal(formatoMatricula('C-1234-BCD'), 'ciclomotor')
})

test('las vocales y la Q no existen en la serie moderna', () => {
  // `1234ABC` no puede ser moderna: la A no está en el alfabeto de la serie.
  assert.notEqual(formatoMatricula('1234ABC'), 'moderna')
  assert.notEqual(formatoMatricula('1234QQQ'), 'moderna')
  assert.equal(ALFABETO_SERIE.length, 20)
  assert.equal(/[AEIOUQÑ]/.test(ALFABETO_SERIE), false)
})

// ── ordinal ──────────────────────────────────────────────────────────────────

test('el ordinal arranca en cero con la primera matrícula de la serie', () => {
  assert.equal(ordinalMatricula('0000BBB'), 0)
  assert.equal(ordinalMatricula('0001BBB'), 1)
  assert.equal(ordinalMatricula('9999BBB'), 9999)
})

test('🚨 los saltos de serie: el ordinal NO es el orden alfabético del texto', () => {
  // Después de 9999BBB viene 0000BBC (la ÚLTIMA letra es la menos
  // significativa). Por texto, '9999BBB' > '0000BBC', que es justo el fallo que
  // este módulo evita convirtiendo a entero.
  assert.equal(ordinalMatricula('0000BBC'), 10_000)
  assert.equal(ordinalMatricula('9999BBC'), 19_999)
  // Agotadas las 20 terceras letras (…BBZ) toca la segunda: BCB.
  assert.equal(ordinalMatricula('9999BBZ'), 20 * 10_000 - 1)
  assert.equal(ordinalMatricula('0000BCB'), 20 * 10_000)
  // Y agotadas las 400 combinaciones de las dos últimas, la primera: CBB.
  assert.equal(ordinalMatricula('0000CBB'), 400 * 10_000)
  assert.equal(ordinalMatricula('0000DBB'), 800 * 10_000)
})

test('el ordinal de la última matrícula posible es el tamaño de la serie', () => {
  assert.equal(ordinalMatricula('9999ZZZ'), 20 * 20 * 20 * 10_000 - 1)
})

test('ordinal y matriculaDeOrdinal son inversos (ida y vuelta)', () => {
  for (let o = 0; o < 8_000_000; o += 137_117) {
    assert.equal(ordinalMatricula(matriculaDeOrdinal(o)), o)
  }
})

test('el ordinal solo existe para la serie moderna', () => {
  assert.equal(ordinalMatricula('M-1234-AB'), null)
  assert.equal(ordinalMatricula('C1234BCD'), null)
  assert.equal(ordinalMatricula(''), null)
  assert.equal(ordinalMatricula('basura'), null)
})

// ── estimación ───────────────────────────────────────────────────────────────

test('la primerísima matrícula de la serie es del 18/09/2000', () => {
  const r = fechaMatriculacionEstimada('0000 BBB')
  assert.notEqual(r, null)
  assert.equal(r!.estimada, '2000-09-18')
  assert.equal(r!.desde, PRIMERA_MATRICULA_MODERNA)
  assert.equal(r!.ordinal, 0)
})

test('el rango nunca promete nada anterior a la primera matrícula de la serie', () => {
  const r = fechaMatriculacionEstimada('0000BBB')!
  assert.ok(r.desde >= PRIMERA_MATRICULA_MODERNA)
})

test('el resultado se declara CALCULADO, no consultado', () => {
  const r = fechaMatriculacionEstimada('1234GBB')!
  assert.equal(r.metodo, 'interpolacion_serie_nacional')
})

test('la estimación siempre cae dentro de su propio rango', () => {
  for (let o = 0; o < 42_000_000; o += 331_337) {
    const r = fechaMatriculacionEstimada(matriculaDeOrdinal(o))
    assert.notEqual(r, null, `sin estimación para el ordinal ${o}`)
    assert.ok(r!.desde <= r!.estimada, `${r!.desde} > ${r!.estimada}`)
    assert.ok(r!.estimada <= r!.hasta, `${r!.estimada} > ${r!.hasta}`)
    assert.match(r!.estimada, /^\d{4}-\d{2}-\d{2}$/)
  }
})

test('monotonía: a más matrícula, fecha igual o posterior (muestra amplia)', () => {
  let anterior = ''
  let anteriorDesde = ''
  let n = 0
  for (let o = 0; o < 42_500_000; o += 9_973) {
    const r = fechaMatriculacionEstimada(matriculaDeOrdinal(o))
    if (r === null) continue
    assert.ok(r.estimada >= anterior, `ordinal ${o}: ${r.estimada} < ${anterior}`)
    assert.ok(r.desde >= anteriorDesde, `ordinal ${o}: desde ${r.desde} < ${anteriorDesde}`)
    anterior = r.estimada
    anteriorDesde = r.desde
    n++
  }
  assert.ok(n > 4000, `la muestra se quedó corta: ${n}`)
})

test('un hito concreto: abril de 2020 avanzó UNA sola serie (confinamiento)', () => {
  // Cierre de marzo/2020 = LGG, cierre de abril/2020 = LGH: 10.000 matrículas
  // en todo el mes. La mitad de esa serie tiene que caer en abril de 2020.
  const r = fechaMatriculacionEstimada('5000LGG')!
  assert.equal(r.estimada.slice(0, 7), '2020-04')
})

test('otro hito: el arranque de 2015 cae donde dice la tabla', () => {
  // Cierre de diciembre/2014 = JBY, cierre de enero/2015 = JCK.
  assert.equal(fechaMatriculacionEstimada('5000JBY')!.estimada.slice(0, 7), '2015-01')
})

// ── los `null`: «no lo sé» nunca se rellena ──────────────────────────────────

test('la matrícula provincial antigua NO se estima: null', () => {
  assert.equal(fechaMatriculacionEstimada('M-1234-AB'), null)
  assert.equal(fechaMatriculacionEstimada('SE 1234 BC'), null)
  assert.equal(fechaMatriculacionEstimada('M-123456'), null)
})

test('el ciclomotor va por otra serie: null, no una fecha de la tabla de coches', () => {
  assert.equal(fechaMatriculacionEstimada('C1234BCD'), null)
})

test('basura y cadena vacía: null', () => {
  assert.equal(fechaMatriculacionEstimada(''), null)
  assert.equal(fechaMatriculacionEstimada('   '), null)
  assert.equal(fechaMatriculacionEstimada('no sé cuál es'), null)
  assert.equal(fechaMatriculacionEstimada('1234ABC'), null) // vocal: no es moderna
  assert.equal(fechaMatriculacionEstimada('123BCD'), null) // tres dígitos
  assert.equal(fechaMatriculacionEstimada('12345BCD'), null) // cinco dígitos
})

test('🚨 más allá del último hito NO se extrapola: se dice que no se sabe', () => {
  const r = fechaMatriculacionEstimada('9999ZZZ')
  assert.equal(r, null, 'la última matrícula posible de la serie no puede estimarse aún')
})

test('la frontera del último hito conocido es exacta', () => {
  assert.match(ULTIMO_HITO_CONOCIDO, /^\d{4}-\d{2}-\d{2}$/)
  // Justo por debajo del último hito sí hay estimación...
  // (el ordinal inmediatamente inferior al hito estima justo EN la fecha del
  // hito, que es lo correcto: es la última matrícula que la tabla cubre)
  const dentro = fechaMatriculacionEstimada('9999NRX')
  assert.notEqual(dentro, null)
  assert.ok(dentro!.estimada <= ULTIMO_HITO_CONOCIDO)
  assert.equal(dentro!.estimada.slice(0, 7), '2026-09')
  // ...y en el propio hito (y por encima) ya no.
  assert.equal(fechaMatriculacionEstimada('0000NRY'), null)
  assert.equal(fechaMatriculacionEstimada('0000NSB'), null)
})

test('el `hasta` nunca se sale del tramo cubierto por la tabla', () => {
  for (let o = 42_000_000; o < 42_580_000; o += 13_337) {
    const r = fechaMatriculacionEstimada(matriculaDeOrdinal(o))
    if (r === null) continue
    assert.ok(r.hasta <= ULTIMO_HITO_CONOCIDO, `${r.hasta} > ${ULTIMO_HITO_CONOCIDO}`)
  }
})

test('la entrada no-string no revienta', () => {
  assert.equal(fechaMatriculacionEstimada(null as unknown as string), null)
  assert.equal(fechaMatriculacionEstimada(undefined as unknown as string), null)
  assert.equal(fechaMatriculacionEstimada(1234 as unknown as string), null)
})
