import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esTelefonoComodin, personaDeFicha } from './persona-ficha.ts'

test('tipoPersona guardado manda sobre el resto', () => {
  assert.equal(personaDeFicha({ tipoPersona: 'juridica', dniEnmascarado: '*****678Z' }), 'juridica')
  assert.equal(personaDeFicha({ tipoPersona: 'fisica', segmento: 'Comunidad' }), 'fisica')
  assert.equal(personaDeFicha({ tipoPersona: 'Física' }), 'fisica')
})
test('CIF de comunidad enmascarado (acaba en dígito) → juridica solo con segmento jurídico', () => {
  assert.equal(personaDeFicha({ dniEnmascarado: '*****9313', segmento: 'Comunidad' }), 'juridica')
})
test('documento acaba en dígito sin segmento jurídico → null', () => {
  assert.equal(personaDeFicha({ dniEnmascarado: '*****9313' }), null)
  assert.equal(personaDeFicha({ dniEnmascarado: '*****9313', segmento: 'Particular' }), null)
})
test('documento acaba en dígito con segmento Empresa → juridica', () => {
  assert.equal(personaDeFicha({ dniEnmascarado: '*****9313', segmento: 'Empresa' }), 'juridica')
})
test('DNI/NIE enmascarado (acaba en letra) → null siempre, incluso con segmento jurídico', () => {
  assert.equal(personaDeFicha({ dniEnmascarado: '*****678Z' }), null)
  assert.equal(personaDeFicha({ dniEnmascarado: '*****678Z', segmento: 'Empresa' }), null)
})
test('letra + Empresa → null (no convierte)', () => {
  assert.equal(personaDeFicha({ dniEnmascarado: '*****678Z', segmento: 'Empresa' }), null)
})
test('segmento solo desempata sin documento', () => {
  assert.equal(personaDeFicha({ segmento: 'Comunidad' }), 'juridica')
  assert.equal(personaDeFicha({ segmento: 'Comunidad' }), 'juridica')
  assert.equal(personaDeFicha({ segmento: 'Particular' }), null)
})
test('tipoPersona fisica + segmento Comunidad → fisica (manda tipoPersona)', () => {
  assert.equal(personaDeFicha({ tipoPersona: 'fisica', segmento: 'Comunidad' }), 'fisica')
})
test('sin documento + Comunidad → juridica', () => {
  assert.equal(personaDeFicha({ segmento: 'Comunidad' }), 'juridica')
})
test('sin nada → null (estado conservador)', () => {
  assert.equal(personaDeFicha({}), null)
  assert.equal(personaDeFicha({ dniEnmascarado: '', tipoPersona: '', segmento: null }), null)
})
test('teléfono comodín', () => {
  for (const t of ['000000000', '999999999', '+34 000 000 000', '0034000000000', '111111111']) assert.equal(esTelefonoComodin(t), true, t)
  for (const t of ['600123456', '954123456', '', null, undefined, '12345']) assert.equal(esTelefonoComodin(t), false, String(t))
})
