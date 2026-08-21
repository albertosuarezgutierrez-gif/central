import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noches, clasificar } from './disponibilidad-publica.ts'

test('noches() devuelve el rango [desde, hasta) sin saltos ni repeticiones', () => {
  assert.deepEqual(noches('2026-08-30', '2026-09-02'), ['2026-08-30', '2026-08-31', '2026-09-01'])
})

test('noches() cruza un 29 de febrero bisiesto', () => {
  assert.deepEqual(noches('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29'])
})

test('noches() cruza el cambio de hora de octubre sin repetir ni saltarse un dia', () => {
  // El 25/10/2026 España atrasa el reloj. En hora local, sumar un día a medianoche puede caer
  // en el mismo día; por eso el helper trabaja en UTC.
  assert.deepEqual(noches('2026-10-24', '2026-10-27'), ['2026-10-24', '2026-10-25', '2026-10-26'])
})

test('un rango vacio no da ninguna noche', () => {
  assert.deepEqual(noches('2026-09-01', '2026-09-01'), [])
})

test('available 0 es ocupada y available 1 es libre', () => {
  const r = clasificar(
    { '2026-09-01': { available: 0 }, '2026-09-02': { available: 1 } },
    ['2026-09-01', '2026-09-02'],
  )
  assert.deepEqual(r, { ocupadas: ['2026-09-01'], sinDato: [] })
})

test('sin dato NO es libre: ausente, undefined y null van a sinDato', () => {
  // El fallo que esto previene: colapsar "no lo sé" a "libre" y decirle al huésped que una
  // noche está disponible cuando lo único cierto es que Smoobu no la devolvió.
  const r = clasificar(
    { '2026-09-02': undefined, '2026-09-03': {}, '2026-09-04': { available: null } },
    ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
  )
  assert.deepEqual(r.ocupadas, [])
  assert.deepEqual(r.sinDato, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
})

test('un available con un valor inesperado se trata como sin dato, no como libre', () => {
  // Un centinela o un tipo raro es un "no lo he sabido leer", y esos se cuelan por las guardas
  // basadas en null. Ante la duda, el estado conservador.
  const r = clasificar(
    { '2026-09-01': { available: 7 }, '2026-09-02': { available: '1' as unknown as number } },
    ['2026-09-01', '2026-09-02'],
  )
  assert.deepEqual(r.ocupadas, [])
  assert.deepEqual(r.sinDato, ['2026-09-01', '2026-09-02'])
})

test('una respuesta vacia deja TODAS las noches sin dato, ninguna libre', () => {
  // El caso que se ve de verdad cuando Smoobu devuelve un 200 con el cuerpo vacío: si esto
  // saliera como "todo libre", la web estaría vendiendo un piso lleno.
  const fechas = noches('2026-09-01', '2026-09-05')
  const r = clasificar({}, fechas)
  assert.deepEqual(r.ocupadas, [])
  assert.deepEqual(r.sinDato, fechas)
})
