// Respuestas REALES del Catastro (28/07/2026) para las dos referencias
// catastrales que venían en las alertas del BOE de Alberto. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parsearCatastro, superficieUtil } from '../src/catastro.ts'
import { extraerDatos } from '../src/extraccion.ts'

const F = JSON.parse(readFileSync(new URL('./fixtures-catastro.json', import.meta.url), 'utf8')) as {
  puerto: string; asturias: string
}

test('REAL — piso del Puerto de Santa María', () => {
  const c = parsearCatastro(F.puerto)
  assert.equal(c.superficie, 112)
  assert.equal(c.anioConstruccion, 1985)
  assert.equal(c.uso, 'Residencial')
  assert.equal(c.clase, 'UR')
  assert.equal(c.provincia, 'CÁDIZ')
  assert.equal(c.municipio, 'EL PUERTO DE SANTA MARIA')
  assert.equal(c.codigoPostal, '11500')
  assert.match(c.direccion ?? '', /VIRGEN MILAGROS/)
})

test('REAL — parcela de Belmonte de Miranda', () => {
  const c = parsearCatastro(F.asturias)
  assert.equal(c.superficie, 100)
  assert.equal(c.anioConstruccion, 1890)
  assert.equal(c.provincia, 'ASTURIAS')
  assert.equal(c.municipio, 'BELMONTE DE MIRANDA')
  assert.match(c.direccion ?? '', /PUMARADA/)
})

test('VALIDACIÓN CRUZADA: la cuota del Catastro coincide con la de la escritura', () => {
  // El Catastro publica cpt = 3,080000 y la descripción registral dice «tres
  // enteros, ocho centésimas por ciento». Dos fuentes independientes dando el
  // mismo 3,08 % confirma que el parser de números en letra acierta.
  const catastro = parsearCatastro(F.puerto)
  const escritura = extraerDatos(
    'Su cuota a los efectos de la Ley de Propiedad Horizontal es de tres enteros, ocho centésimas de otro por ciento.',
  )
  assert.equal(catastro.cuotaParticipacion, 3.08)
  assert.equal(escritura.cuotaParticipacion, 3.08)
})

test('una cuota del 100% es finca completa, no propiedad horizontal', () => {
  // La parcela de Asturias trae cpt=100: no es una cuota, es el pleno dominio.
  assert.equal(parsearCatastro(F.asturias).cuotaParticipacion, null)
})

test('la superficie del Catastro y la de la escritura pueden diferir', () => {
  // Escritura: 115,66 m² · Catastro: 112 m². Es normal (criterios de medición
  // distintos) y por eso se guardan las dos en vez de pisar una con otra.
  assert.notEqual(parsearCatastro(F.puerto).superficie, 115.66)
})

test('entrada vacía o corrupta no revienta', () => {
  const c = parsearCatastro('')
  assert.equal(c.superficie, null)
  assert.equal(c.direccion, null)
})

test('superficieUtil: la del Catastro manda sobre la del anuncio', () => {
  // Caso real (El Puerto de Santa María): registro 115,66 · Catastro 112.
  assert.equal(superficieUtil(112, 115.66), 112)
})

test('superficieUtil: sin Catastro cae a la del anuncio', () => {
  // Caso real (Dos Hermanas): sin ref. catastral, 605 m² en la descripción.
  assert.equal(superficieUtil(null, 605), 605)
})

test('superficieUtil: sin anuncio usa la del Catastro', () => {
  // Caso real (Belmonte de Miranda): el anuncio no da m², el Catastro sí.
  assert.equal(superficieUtil(100, null), 100)
})

test('superficieUtil: un 0 es AUSENTE, no una superficie', () => {
  assert.equal(superficieUtil(0, 90), 90)
  assert.equal(superficieUtil(0, 0), null)
  assert.equal(superficieUtil(null, null), null)
  assert.equal(superficieUtil(Number.NaN, null), null)
})
