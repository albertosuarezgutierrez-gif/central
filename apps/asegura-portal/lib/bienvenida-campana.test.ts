import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { BIENVENIDA_CAMPANA, hayMarcaDeCampana } from './bienvenida-campana.ts'

const REF = 'abcdefghijklmnopqrstuv' // 22 caracteres base64url

const quitaComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const entrada = quitaComentarios(readFileSync(new URL('../app/Entrada.tsx', import.meta.url), 'utf8'))
const raiz = quitaComentarios(readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'))

test('la bienvenida solo sale con marca de campaña: ?r= con forma de ref o su cookie', () => {
  assert.equal(hayMarcaDeCampana(REF, undefined), true)
  assert.equal(hayMarcaDeCampana(undefined, REF), true)
  assert.equal(hayMarcaDeCampana([REF, 'x'], null), true)
})

test('sin marca, o con basura, no hay bienvenida', () => {
  for (const malo of [undefined, null, '', 'abc', '3f2b8c1e-1111-4222-8333-444455556666', 'a'.repeat(23), 42]) {
    assert.equal(hayMarcaDeCampana(malo, undefined), false, String(malo))
    assert.equal(hayMarcaDeCampana(undefined, malo as string), false, String(malo))
  }
})

test('cableado: la raíz decide con la marca y Entrada pinta el bloque solo si bienvenida, y solo al pedir el correo', () => {
  assert.match(raiz, /hayMarcaDeCampana\(/)
  assert.match(raiz, /<Entrada bienvenida=\{hayMarcaDeCampana\(/)
  assert.match(entrada, /bienvenida && fase === 'pedir'/)
  assert.match(entrada, /autoFocus=\{bienvenida\}/)
  // Sin bienvenida (acceso normal) el componente sigue con su cabecera de siempre.
  assert.match(entrada, /Mis <em>seguros<\/em>/)
})

test('la bienvenida no precarga ni expone el correo y no promete lo que el portal no hace', () => {
  const texto = BIENVENIDA_CAMPANA.join(' ')
  assert.match(texto, /Alberto de Grupo ASegura/)
  assert.doesNotMatch(texto, /@/)
  // El campo de correo sigue arrancando vacío.
  assert.match(entrada, /useState\(''\)/)
  assert.doesNotMatch(raiz, /destino|email|correo=/i)
})
