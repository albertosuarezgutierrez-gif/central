// Allianz AUTOS Turismos v0.6.37 (31/10/2026, real dbb6d451): elección PURA de la opción del autocompletado «Localidad» y sus mensajes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { busquedasLocalidadTurismos, elegirLocalidadTurismos } from '../src/adapters/allianz/poblacion-localidad.ts'
import { mensajeLocalidadTurismos } from '../src/adapters/allianz/auto.ts'

test('elegirLocalidadTurismos: exacta antes que contención; CP distinto descartado; varias → null; nunca la primera a ciegas', () => {
  assert.equal(elegirLocalidadTurismos(['00000 - VILLAFICTICIA DE ARRIBA', '00000 - VILLAFICTICIA'], 'Villafictícia', '00000'), 1)
  assert.equal(elegirLocalidadTurismos(['11111 - VILLAFICTICIA', '00000 - VILLAFICTICIA'], 'Villaficticia', '00000'), 1)
  assert.equal(elegirLocalidadTurismos(['11111 - VILLAFICTICIA'], 'Villaficticia', '00000'), null)
  assert.equal(elegirLocalidadTurismos(['00000 - VILLAFICTICIA NORTE', '00000 - VILLAFICTICIA SUR'], 'Villaficticia', '00000'), null)
  assert.equal(elegirLocalidadTurismos(['OTRAPOBLACION', 'OTRA MAS'], 'Villaficticia', '00000'), null)
  assert.equal(elegirLocalidadTurismos(['VILLAFICTICIA (00000)'], 'Villaficticia', '00000'), 0)
  assert.equal(elegirLocalidadTurismos(['00000 - NUCLEO RARO'], 'Villaficticia', '00000'), 0, 'sin casar: solo la ÚNICA con el CP exacto')
  assert.equal(elegirLocalidadTurismos(['NUCLEO RARO'], 'Villaficticia', '00000'), null, 'sin CP en la opción no vale por ser única')
  assert.equal(elegirLocalidadTurismos([], 'Villaficticia', '00000'), null)
})

test('busquedasLocalidadTurismos: municipio y su palabra más larga; sin prefijo CP', () => {
  assert.deepEqual(busquedasLocalidadTurismos('00000 - Villa de Ficticia'), ['Villa de Ficticia', 'Ficticia'])
  assert.deepEqual(busquedasLocalidadTurismos('Villaficticia'), ['Villaficticia'])
  assert.deepEqual(busquedasLocalidadTurismos('  '), [])
})

test('mensajeLocalidadTurismos: sin municipio ni opciones en el texto', () => {
  assert.equal(mensajeLocalidadTurismos({ estado: 'elegida', elegida: '00000 - VILLAFICTICIA', mostrado: 'VILLAFICTICIA' }, 'Villaficticia'), null)
  assert.match(mensajeLocalidadTurismos({ estado: 'elegida', elegida: 'X', mostrado: 'Y' }, 'Villaficticia') ?? '', /no dejó puesta/)
  const m = mensajeLocalidadTurismos({ estado: 'sin_eleccion', opciones: ['00000 - VILLAFICTICIA NORTE', '00000 - VILLAFICTICIA SUR'] }, 'Villaficticia') ?? ''
  assert.match(m, /2 opciones/)
  assert.doesNotMatch(m, /VILLAFICTICIA|00000/i)
})
