import test from 'node:test'
import assert from 'node:assert/strict'

import { nombreDePila, saludoPorHora } from './saludo.ts'

const MADRID = 'Europe/Madrid'
/** Un instante UTC, para poder razonar sobre el desfase de zona. */
const utc = (iso: string) => new Date(`${iso}Z`)

test('los tres tramos del día', () => {
  assert.equal(saludoPorHora(utc('2026-09-07T07:00:00'), MADRID), 'Buenos días') // 09:00 Madrid
  assert.equal(saludoPorHora(utc('2026-09-07T14:00:00'), MADRID), 'Buenas tardes') // 16:00
  assert.equal(saludoPorHora(utc('2026-09-07T21:00:00'), MADRID), 'Buenas noches') // 23:00
})

test('🚨 la hora es la de MADRID, no la del servidor', () => {
  // Vercel corre en UTC. A las 00:30 de Madrid en verano son las 22:30 UTC del
  // día anterior: sin zona, `getHours()` diría 22 y acertaría por casualidad;
  // pero a las 07:30 de Madrid son las 05:30 UTC, y ahí el saludo pasaría de
  // «buenos días» a «buenas noches». Un fallo de una o dos horas al día, todos
  // los días, sin que nada falle.
  assert.equal(saludoPorHora(utc('2026-09-07T05:30:00'), MADRID), 'Buenos días') // 07:30 Madrid
  assert.equal(saludoPorHora(utc('2026-09-07T05:30:00'), 'UTC'), 'Buenas noches') // 05:30 UTC
})

test('los cortes son los del castellano hablado', () => {
  // A las 14:00 en España se dice «buenas tardes», aunque el mediodía pasara.
  assert.equal(saludoPorHora(utc('2026-09-07T11:00:00'), MADRID), 'Buenas tardes') // 13:00 en punto
  assert.equal(saludoPorHora(utc('2026-09-07T10:59:00'), MADRID), 'Buenos días') // 12:59
  assert.equal(saludoPorHora(utc('2026-09-07T04:00:00'), MADRID), 'Buenos días') // 06:00
  assert.equal(saludoPorHora(utc('2026-09-07T03:59:00'), MADRID), 'Buenas noches') // 05:59
})

test('la medianoche no se sale del rango', () => {
  assert.equal(saludoPorHora(utc('2026-09-06T22:00:00'), MADRID), 'Buenas noches') // 00:00 Madrid
})

test('el nombre de pila es la primera palabra, con inicial mayúscula', () => {
  assert.equal(nombreDePila('Alberto Suárez Gutiérrez'), 'Alberto')
  assert.equal(nombreDePila('  alberto   suárez  '), 'Alberto')
})

test('🚨 un nombre A GRITOS se normaliza', () => {
  // Medido: 7 de las 80 fichas vivas están en mayúsculas. Gritarle el nombre a
  // alguien es lo contrario de ameno.
  assert.equal(nombreDePila('ALBERTO SUAREZ GUTIERREZ'), 'Alberto')
  assert.equal(nombreDePila('MARÍA ÁNGELES PÉREZ'), 'María')
})

test('🚨 con coma NO se saluda: sería por el apellido', () => {
  // Formato «APELLIDOS, NOMBRE». Cortar por delante daría «Suárez», y saludar a
  // alguien por su primer apellido es peor que no saludar. Medido: hoy 0 de 80
  // fichas lo usan, pero una ingesta futura puede traerlo.
  assert.equal(nombreDePila('Suárez Gutiérrez, Alberto'), null)
})

test('🚨 a una empresa no se le da los buenos días por su nombre', () => {
  assert.equal(nombreDePila('GLOBAL 2 SL'), null)
  assert.equal(nombreDePila('Transportes Ejemplo S.L.'), null)
  assert.equal(nombreDePila('Comunidad de Propietarios Ejemplo'), null)
  assert.equal(nombreDePila('Asociación de Vecinos'), null)
})

test('🚨 ante la duda, null: la pantalla saluda sin nombre', () => {
  assert.equal(nombreDePila(null), null)
  assert.equal(nombreDePila(undefined), null)
  assert.equal(nombreDePila(''), null)
  assert.equal(nombreDePila('   '), null)
  assert.equal(nombreDePila('A. Suárez'), null, 'una inicial no es un nombre')
  assert.equal(nombreDePila('Cliente123'), null, 'con dígitos no es una persona')
  assert.equal(nombreDePila('Supercalifragilisticoespialidoso'), null, 'demasiado largo para un nombre')
})

test('los nombres con guion o apóstrofo pasan enteros', () => {
  assert.equal(nombreDePila('Jean-Pierre Dupont'), 'Jean-pierre')
  assert.equal(nombreDePila("D'Angelo Rossi"), "D'angelo")
})

test('un nombre compuesto se queda en el primero, y es cierto', () => {
  // «José» es su nombre. Adivinar dónde acaba el nombre y empiezan los
  // apellidos sí se equivocaría.
  assert.equal(nombreDePila('José María López Ruiz'), 'José')
})
