import assert from 'node:assert/strict'
import { test } from 'node:test'

import { perfilItvDeRamo, proximaItv } from './itv.ts'

const HOY = new Date('2026-09-21T11:30:00Z')

test('un turismo que aún no ha cumplido 4 años da su PRIMERA ITV, que no depende de ninguna anterior', () => {
  const r = proximaItv({ fechaMatriculacion: '2024-06-10', perfil: 'turismo', hoy: HOY })
  assert.deepEqual(r, { fecha: '2028-06-10', fiabilidad: 'primera', periodicidadMeses: 24 })
})

test('un turismo que ya pasó la edad de la primera marca la fecha como ESTIMADA', () => {
  // Matriculado en 2020: le tocó a los 4 (2024) y a los 6 (2026-01), así que la
  // que sale supone que las pasó en su aniversario — por eso no es `primera`.
  const r = proximaItv({ fechaMatriculacion: '2020-01-15', perfil: 'turismo', hoy: HOY })
  assert.deepEqual(r, { fecha: '2028-01-15', fiabilidad: 'ciclo_estimado', periodicidadMeses: 24 })
})

test('🚨 a los 10 años el turismo pasa a ANUAL: el escalón no se salta', () => {
  // Matriculado en 2014 cumple 10 en 2024. Con periodicidad bienal fija saldría
  // 2028-03-10; con el escalón aplicado, la siguiente cae en 2027 y se repite
  // cada 12 meses. Es la diferencia entre avisar a tiempo y un año tarde.
  const r = proximaItv({ fechaMatriculacion: '2014-03-10', perfil: 'turismo', hoy: HOY })
  assert.deepEqual(r, { fecha: '2027-03-10', fiabilidad: 'ciclo_estimado', periodicidadMeses: 12 })
})

test('🚨 el escalón de los 10 años tampoco se salta por UN DÍA (29 de febrero)', () => {
  // Lo encontró `code-review`. Un coche matriculado el 29/02/2016 arrastra sus
  // ciclos sobre el 28 de febrero, y con el aniversario comparado a pelo el
  // décimo cumpleaños contaba 119 meses en vez de 120: seguía bienal y la ITV
  // salía en 2028 en vez de 2027. Sus vecinos del 28 y del 1 de marzo acertaban,
  // que es lo que lo hacía invisible.
  const bisiesto = proximaItv({ fechaMatriculacion: '2016-02-29', perfil: 'turismo', hoy: HOY })
  const vecinoAntes = proximaItv({ fechaMatriculacion: '2016-02-28', perfil: 'turismo', hoy: HOY })
  const vecinoDespues = proximaItv({ fechaMatriculacion: '2016-03-01', perfil: 'turismo', hoy: HOY })
  assert.equal(bisiesto?.periodicidadMeses, 12)
  assert.equal(bisiesto?.fecha.slice(0, 4), '2027')
  assert.equal(vecinoAntes?.fecha.slice(0, 4), '2027')
  assert.equal(vecinoDespues?.fecha.slice(0, 4), '2027')
})

test('🚨 una MOTO no hereda el tramo anual del turismo: sigue bienal a los 26 años', () => {
  const r = proximaItv({ fechaMatriculacion: '2000-05-20', perfil: 'moto', hoy: HOY })
  assert.deepEqual(r, { fecha: '2028-05-20', fiabilidad: 'ciclo_estimado', periodicidadMeses: 24 })
})

test('la ITV que vence HOY es la próxima, no se salta al ciclo siguiente', () => {
  const r = proximaItv({ fechaMatriculacion: '2022-09-21', perfil: 'turismo', hoy: HOY })
  assert.equal(r?.fecha, '2026-09-21')
  assert.equal(r?.fiabilidad, 'primera')
})

test('el 29 de febrero se recorta al último día del mes, y el recorte ARRASTRA', () => {
  // 2020-02-29 (bisiesto) + 48 meses = 2024-02-29 (bisiesto también, cabe el
  // 29). De ahí +24 → 2026-02-28, porque 2026 no es bisiesto y se recorta. Y la
  // siguiente parte del 28, así que da 2028-02-28 **aunque 2028 sí sea
  // bisiesto**: cada ciclo se cuenta desde el anterior, no desde la
  // matriculación. Es el mismo arrastre que ya tienen los recordatorios
  // recurrentes (`siguienteOcurrencia`), y es fiel a la realidad — la ITV se
  // cuenta desde la última inspección. Queda fijado aquí porque es justo la
  // clase de detalle que alguien «arreglaría» de vuelta al 29 sin querer.
  const r = proximaItv({ fechaMatriculacion: '2020-02-29', perfil: 'turismo', hoy: HOY })
  assert.equal(r?.fecha, '2028-02-28')
})

test('una matriculación en el FUTURO no es un caso que tapar: su primera ITV sale más lejos', () => {
  const r = proximaItv({ fechaMatriculacion: '2027-01-05', perfil: 'turismo', hoy: HOY })
  assert.deepEqual(r, { fecha: '2031-01-05', fiabilidad: 'primera', periodicidadMeses: 24 })
})

test('una fecha que no es una fecha devuelve null, nunca una de relleno', () => {
  for (const malo of ['', '   ', 'ayer', '2026-13-01', '10/03/2014', '2026-2-3']) {
    assert.equal(proximaItv({ fechaMatriculacion: malo, perfil: 'turismo', hoy: HOY }), null, malo)
  }
})

test('🚨 el 30 de febrero NO cuela: `Date` lo normalizaría al 2 de marzo en silencio', () => {
  assert.equal(proximaItv({ fechaMatriculacion: '2027-02-30', perfil: 'turismo', hoy: HOY }), null)
})

test('perfilItvDeRamo solo reconoce los dos ramos que tienen ITV', () => {
  assert.equal(perfilItvDeRamo('auto'), 'turismo')
  assert.equal(perfilItvDeRamo('moto'), 'moto')
  for (const otro of ['hogar', 'responsabilidad_civil', 'vida', '', null, undefined]) {
    assert.equal(perfilItvDeRamo(otro), null, String(otro))
  }
})
