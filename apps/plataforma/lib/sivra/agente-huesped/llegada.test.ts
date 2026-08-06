// node --test — módulo puro de llegada tardía / horario de atención.
import test from 'node:test'
import assert from 'node:assert'
import { horasDeTexto, fueraDeHorarioAtencion, esLlegadaFueraDeHorario, bloqueLlegada, HORARIO_ATENCION } from './llegada.ts'

test('horasDeTexto lee rangos HH:MM', () => {
  assert.deepEqual(horasDeTexto("I'd like to request check-in at 01:00 - 02:00"), [1, 2])
})

test('horasDeTexto entiende am/pm', () => {
  assert.deepEqual(horasDeTexto('we arrive at 11 pm'), [23])
  assert.deepEqual(horasDeTexto('llegamos a la 1am'), [1])
  assert.deepEqual(horasDeTexto('arriving at 12am'), [0])
  assert.deepEqual(horasDeTexto('arriving at 12pm'), [12])
})

test('horasDeTexto lee hora escueta tras preposición y sufijo horario', () => {
  assert.deepEqual(horasDeTexto('llegamos sobre las 23'), [23])
  assert.deepEqual(horasDeTexto('llegamos a las 22 horas'), [22])
})

test('horasDeTexto NO confunde un número suelto con una hora', () => {
  assert.deepEqual(horasDeTexto('somos 4 personas y 2 niños'), [])
})

test('fueraDeHorarioAtencion delimita 09:00–21:00', () => {
  assert.equal(fueraDeHorarioAtencion(8), true)
  assert.equal(fueraDeHorarioAtencion(9), false)
  assert.equal(fueraDeHorarioAtencion(20), false)
  assert.equal(fueraDeHorarioAtencion(21), true)
  assert.equal(fueraDeHorarioAtencion(1), true)
})

test('esLlegadaFueraDeHorario caza el caso de Daniela (check-in 01:00-02:00)', () => {
  assert.equal(esLlegadaFueraDeHorario("I'd like to request check-in at 01:00 - 02:00. Is this ok?"), true)
})

test('esLlegadaFueraDeHorario caza los marcadores nocturnos sin hora', () => {
  assert.equal(esLlegadaFueraDeHorario('Llegaremos de madrugada, ¿hay algún problema?'), true)
  assert.equal(esLlegadaFueraDeHorario('We will have a late arrival, sorry!'), true)
})

test('esLlegadaFueraDeHorario NO dispara con una llegada en horario', () => {
  assert.equal(esLlegadaFueraDeHorario('¿Podemos entrar a las 15:00?'), false)
  assert.equal(esLlegadaFueraDeHorario('We arrive at 6 pm'), false)
})

test('esLlegadaFueraDeHorario NO dispara sin señal de llegada', () => {
  assert.equal(esLlegadaFueraDeHorario('¿La piscina abre a las 23:00?'), false)
})

test('bloqueLlegada afirma que no hay hora límite y publica el horario de atención', () => {
  const b = bloqueLlegada('15:00')
  assert.match(b, /NO hay hora límite/)
  assert.match(b, /a partir de las 15:00/)
  assert.ok(b.includes(HORARIO_ATENCION.desde) && b.includes(HORARIO_ATENCION.hasta))
  assert.match(b, /hotel/i) // la prohibición explícita de mandarle a un hotel
})
