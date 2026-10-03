import test from 'node:test'
import assert from 'node:assert/strict'
import { lineaFichaObjeto, lineaConductor } from './ficha-objeto-linea.ts'

test('vehículo: matriculación (año), potencia y combustible traducido desde fichaObjeto', () => {
  const l = lineaFichaObjeto([
    { etiqueta: 'Matriculación', valor: '01/02/2018' },
    { etiqueta: 'Uso (código de la compañía)', valor: 'PA' },
    { etiqueta: 'Combustible', valor: 'Gasolina' },
    { etiqueta: 'Potencia', valor: '132 CV' },
  ])
  assert.equal(l, 'Matriculación 2018 · Potencia 132 CV · Combustible Gasolina')
})

test('vehículo con valor: máximo tres piezas por orden de preferencia', () => {
  const l = lineaFichaObjeto([
    { etiqueta: 'Valor del vehículo', valor: '12.000,00€' },
    { etiqueta: 'Matriculación', valor: '01/02/2018' },
    { etiqueta: 'Potencia', valor: '132 CV' },
    { etiqueta: 'Combustible', valor: 'GA' },
  ])
  assert.equal(l, 'Matriculación 2018 · Potencia 132 CV · Combustible GA')
})

test('inmueble: clase, uso y zona traducidos desde fichaObjeto', () => {
  const l = lineaFichaObjeto([
    { etiqueta: 'Clase de inmueble', valor: 'Piso' },
    { etiqueta: 'Uso', valor: 'Habitual' },
    { etiqueta: 'Zona', valor: 'Zona poblada' },
  ])
  assert.equal(l, 'Clase Piso · Uso Habitual · Zona Zona poblada')
})

test('NULL / vacío / sin piezas reconocibles: se omite (null, nunca cadena vacía)', () => {
  assert.equal(lineaFichaObjeto(null), null)
  assert.equal(lineaFichaObjeto(undefined), null)
  assert.equal(lineaFichaObjeto([]), null)
  assert.equal(lineaFichaObjeto([{ etiqueta: 'Remolque', valor: 'No' }]), null)
  assert.equal(lineaFichaObjeto([{ etiqueta: 'Potencia', valor: '  ' }]), null)
})

test('conductor: carné y nacimiento en formato español, desde ISO o dd/mm/aaaa', () => {
  assert.equal(
    lineaConductor({ rol: 'conductor_habitual', fechaCarnet: '2008-03-12', fechaNacimiento: '1980-05-03' }),
    'Carné según la compañía, desde el 12/03/2008 · Nacimiento 03/05/1980',
  )
  assert.equal(lineaConductor({ rol: 'conductor_habitual', fechaCarnet: '12/03/2008' }), 'Carné según la compañía, desde el 12/03/2008')
})

test('conductor: solo el conductor; fechas ilegibles o ausentes no se pintan', () => {
  assert.equal(lineaConductor({ rol: 'propietario', fechaCarnet: '2008-03-12' }), null)
  assert.equal(lineaConductor({ rol: 'conductor_habitual', fechaCarnet: 'v1:abc', fechaNacimiento: '2026-02-30' }), null)
  assert.equal(lineaConductor({ rol: 'conductor_habitual' }), null)
  assert.equal(lineaConductor({ rol: 'conductor_habitual', fechaCarnet: null, fechaNacimiento: null }), null)
})

test('conductor: una fecha centinela (1900-01-01) no se pinta como carné', () => {
  assert.equal(lineaConductor({ rol: 'conductor_habitual', fechaCarnet: '1900-01-01', fechaNacimiento: '1980-05-03' }), 'Nacimiento 03/05/1980')
})
