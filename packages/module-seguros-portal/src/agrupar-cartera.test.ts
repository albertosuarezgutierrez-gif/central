import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GRUPOS_CARTERA,
  TITULO_GRUPO,
  agruparCartera,
  grupoDeTitular,
  type TitularAgrupable,
} from './agrupar-cartera.ts'

function t(p: Partial<TitularAgrupable> & { clienteId: string }): TitularAgrupable {
  return { propia: true, tipoPersona: 'fisica', ...p }
}

test('una ficha propia de persona fisica va a «mias»', () => {
  assert.equal(grupoDeTitular(t({ clienteId: 'a' })), 'mias')
})

test('una ficha propia de persona juridica va a «empresas», no a «mias»', () => {
  assert.equal(grupoDeTitular(t({ clienteId: 'a', tipoPersona: 'juridica' })), 'empresas')
})

test('🚨 la empresa de OTRO va a «autorizadas», nunca a «empresas»', () => {
  // «Seguros de tus empresas» afirma propiedad. La sociedad de un tercero que
  // te ha dado acceso no es tuya, y pintarla ahí se lo diría al cliente con
  // esas palabras.
  assert.equal(grupoDeTitular(t({ clienteId: 'a', propia: false, tipoPersona: 'juridica' })), 'autorizadas')
  assert.equal(grupoDeTitular(t({ clienteId: 'b', propia: false, tipoPersona: 'fisica' })), 'autorizadas')
})

test('🚨 dos titulares con el MISMO nombre no se funden: la clave es clienteId', () => {
  // El caso real: un padre y un hijo que se llaman igual, o una persona y su
  // sociedad unipersonal. Fundirlos mezclaría sus pólizas en un bloque de
  // aspecto normal — duplicar se ve, mezclar no.
  const bloques = agruparCartera([t({ clienteId: 'padre' }), t({ clienteId: 'hijo' })])
  assert.equal(bloques.length, 1)
  assert.equal(bloques[0].grupo, 'mias')
  assert.deepEqual(
    bloques[0].titulares.map((x) => x.clienteId),
    ['padre', 'hijo'],
    'dos fichas distintas son dos titulares, coincida lo que coincida el nombre',
  )
})

test('🚨 con dos fichas propias se enseña el nombre de cada una', () => {
  // Es el caso de Alberto: sus pólizas personales y las de su sociedad. Sin
  // nombre salen en una lista plana indistinguibles, que es el fallo que este
  // módulo existe para cerrar.
  const bloques = agruparCartera([t({ clienteId: 'a' }), t({ clienteId: 'b' })])
  assert.equal(bloques[0].conNombre, true)
})

test('con UNA sola ficha propia el nombre sobra: la persona ya sabe cómo se llama', () => {
  const bloques = agruparCartera([t({ clienteId: 'a' })])
  assert.equal(bloques[0].conNombre, false)
})

test('🚨 empresas y autorizadas SIEMPRE llevan nombre, aunque solo haya una', () => {
  // Aquí el nombre no es cortesía: es lo único que dice de quién es la póliza.
  const empresa = agruparCartera([t({ clienteId: 'a', tipoPersona: 'juridica' })])
  assert.equal(empresa[0].conNombre, true)
  const ajena = agruparCartera([t({ clienteId: 'b', propia: false })])
  assert.equal(ajena[0].conNombre, true)
})

test('🚨 un bloque vacio NO se devuelve: un titulo sin nada debajo se lee como una averia', () => {
  const bloques = agruparCartera([t({ clienteId: 'a' })])
  assert.deepEqual(
    bloques.map((b) => b.grupo),
    ['mias'],
  )
  assert.deepEqual(agruparCartera([]), [])
})

test('los bloques salen en el orden declarado, y con su titulo', () => {
  const bloques = agruparCartera([
    t({ clienteId: 'ajena', propia: false }),
    t({ clienteId: 'empresa', tipoPersona: 'juridica' }),
    t({ clienteId: 'mia' }),
  ])
  assert.deepEqual(
    bloques.map((b) => b.grupo),
    ['mias', 'empresas', 'autorizadas'],
  )
  assert.deepEqual(
    bloques.map((b) => b.titulo),
    [TITULO_GRUPO.mias, TITULO_GRUPO.empresas, TITULO_GRUPO.autorizadas],
  )
})

test('dentro de un bloque se conserva el orden de entrada', () => {
  const bloques = agruparCartera([
    t({ clienteId: 'primera' }),
    t({ clienteId: 'segunda' }),
    t({ clienteId: 'tercera' }),
  ])
  assert.deepEqual(
    bloques[0].titulares.map((x) => x.clienteId),
    ['primera', 'segunda', 'tercera'],
  )
})

test('todo grupo declarado tiene titulo', () => {
  for (const g of GRUPOS_CARTERA) {
    assert.equal(typeof TITULO_GRUPO[g], 'string')
    assert.notEqual(TITULO_GRUPO[g].trim(), '')
  }
})
