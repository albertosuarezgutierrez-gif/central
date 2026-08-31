import test from 'node:test'
import assert from 'node:assert/strict'
import { conservaDatos } from './traduccion-guarda.ts'

const ORIG = 'Caja de llaves: clave 7272. Portal 2022#. Mapa: https://maps.google.com/x?q=1 Entrada 15:00.'

test('una traducción sana conserva códigos, horas y URLs', () => {
  const trad = 'Key box: code 7272. Building 2022#. Map: https://maps.google.com/x?q=1 Check-in 15:00.'
  assert.equal(conservaDatos(ORIG, trad), true)
})

test('un código mutado o perdido invalida la traducción', () => {
  assert.equal(conservaDatos(ORIG, 'Key box code 7227. Building 2022#. https://maps.google.com/x?q=1 15:00.'), false)
  assert.equal(conservaDatos(ORIG, 'Key box. Building 2022#. https://maps.google.com/x?q=1 15:00.'), false)
})

test('una URL recortada invalida la traducción', () => {
  assert.equal(conservaDatos(ORIG, 'Code 7272. Building 2022#. Map: https://maps.google.com/x 15:00.'), false)
})

test('una traducción vacía nunca vale', () => {
  assert.equal(conservaDatos(ORIG, '   '), false)
})
