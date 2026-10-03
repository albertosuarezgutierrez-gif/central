import test from 'node:test'
import assert from 'node:assert/strict'
import { claveGrupoDuplicado, gruposDuplicadosNuevos, mensajeDuplicadosNuevos } from './duplicados-aviso.ts'

const g = (numero: string, dgs: string | null, filas = 2) => ({ numero, dgs, filas })

test('clave numero|dgs; sin compañía queda vacía tras la barra', () => {
  assert.equal(claveGrupoDuplicado(g('A1', 'C0123')), 'A1|C0123')
  assert.equal(claveGrupoDuplicado(g('A1', null)), 'A1|')
})

test('solo los grupos NUEVOS: lo ya visto no vuelve a avisar', () => {
  const actuales = [g('A1', 'X'), g('B2', 'X'), g('B2', 'Y')]
  assert.deepEqual(gruposDuplicadosNuevos(actuales, ['A1|X']).map(claveGrupoDuplicado), ['B2|X', 'B2|Y'])
  assert.deepEqual(gruposDuplicadosNuevos(actuales, ['A1|X', 'B2|X', 'B2|Y', 'ZZ|X']), [])
  assert.deepEqual(gruposDuplicadosNuevos([], ['A1|X']), [])
})

test('nunca avisado (null) = todo es nuevo; el mismo número en otra compañía es otro grupo', () => {
  assert.equal(gruposDuplicadosNuevos([g('A1', 'X'), g('A1', null)], null).length, 2)
  assert.deepEqual(gruposDuplicadosNuevos([g('A1', 'Y')], ['A1|X']).map(claveGrupoDuplicado), ['A1|Y'])
})

test('mensaje: número y compañía, nunca nombres; sin nuevos no hay mensaje; tope de 20', () => {
  assert.equal(mensajeDuplicadosNuevos([], 0), null)
  const m = mensajeDuplicadosNuevos([g('A1', 'C0123', 3), g('B2', null)], 2)!
  assert.match(m, /Pólizas duplicadas/)
  assert.match(m, /A1 · C0123 \(3 filas\)/)
  assert.match(m, /B2 · sin compañía \(2 filas\)/)
  const muchos = mensajeDuplicadosNuevos(Array.from({ length: 25 }, (_, i) => g(`N${i}`, 'X')), 30)!
  assert.match(muchos, /… y 5 más/)
  assert.match(muchos, /30 en total/)
})
