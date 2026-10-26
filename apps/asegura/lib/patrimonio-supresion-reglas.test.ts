import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { constanciaSenales, fichasASuprimir, idsDeSenalesASuprimir } from './patrimonio-supresion-reglas.ts'

test('fichas: la de la solicitud y las que opera como propias; no las del corredor ni las de solo lectura', () => {
  const f = fichasASuprimir('c1', [
    { clienteId: 'c1', origen: 'portal', puedeAutorizar: true },
    { clienteId: 'c2', origen: 'portal', puedeAutorizar: true },
    { clienteId: 'c3', origen: 'corredor', puedeAutorizar: true },
    { clienteId: 'c4', origen: 'portal', puedeAutorizar: false },
  ])
  assert.deepEqual(f.sort(), ['c1', 'c2'])
  assert.deepEqual(fichasASuprimir(null, []), [])
})

test('ids: solo de esa correduría y de esas fichas', () => {
  const senales = [
    { id: 's1', correduriaId: 'K1', clienteId: 'c1' },
    { id: 's2', correduriaId: 'K1', clienteId: 'c9' },
    { id: 's3', correduriaId: 'K2', clienteId: 'c1' },
    { id: 's4', correduriaId: 'K1', clienteId: 'c2' },
  ]
  assert.deepEqual(idsDeSenalesASuprimir(senales, 'K1', ['c1', 'c2']), ['s1', 's4'])
  assert.deepEqual(idsDeSenalesASuprimir(senales, 'K1', []), [])
})

test('constancia: cuenta, o avisa de que no se pudo', () => {
  assert.match(constanciaSenales(3), /borradas: 3\./)
  assert.match(constanciaSenales(0), /borradas: 0\./)
  assert.match(constanciaSenales(null), /NO se pudieron/)
})

test('resolverSupresion borra señales solo al atender (total/parcial), no al denegar', () => {
  const src = readFileSync(join(import.meta.dirname, 'supresiones.ts'), 'utf8')
  assert.match(src, /entrada\.estado === 'resuelta_total' \|\| entrada\.estado === 'resuelta_parcial'[\s\S]*borrarSenalesDeSupresion/)
})
