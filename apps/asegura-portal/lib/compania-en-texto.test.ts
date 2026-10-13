import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarCompaniaContraTexto, companiaApareceEnTexto } from './compania-en-texto.ts'

const TEXTO = 'CONDICIONES PARTICULARES. Entidad aseguradora: GENERALI ESPAÑA, S.A. DE SEGUROS Y REASEGUROS. Mediador: Grupo ASegura.'

test('compañía que NO aparece en el texto → null', () => {
  assert.equal(validarCompaniaContraTexto('Mutua Madrileña', TEXTO), null)
})
test('compañía que SÍ aparece (otros sufijos/acentos) se conserva', () => {
  assert.equal(validarCompaniaContraTexto('Generali', TEXTO), 'Generali')
  assert.equal(validarCompaniaContraTexto('Generali España Seguros', TEXTO), 'Generali España Seguros')
  assert.equal(validarCompaniaContraTexto('Mutua Madrileña', 'MUTUA MADRILEÑA AUTOMOVILISTA, Sociedad Mutua de Seguros'), 'Mutua Madrileña')
  assert.equal(validarCompaniaContraTexto('MAPFRE España, Compañía de Seguros y Reaseguros, S.A.', 'Póliza Mapfre Hogar'), 'MAPFRE España, Compañía de Seguros y Reaseguros, S.A.')
})
test('vacía o nula → null', () => {
  assert.equal(validarCompaniaContraTexto(null, TEXTO), null)
  assert.equal(validarCompaniaContraTexto('  ', TEXTO), null)
})
test('solo sufijos genéricos no valen', () => {
  assert.equal(companiaApareceEnTexto('Seguros S.A.', TEXTO), false)
})
