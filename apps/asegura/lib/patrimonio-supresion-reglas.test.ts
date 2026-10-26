import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { constanciaSenales, fichaSuprimida, fichasASuprimir, hayQueRegistrarOposicion, idsDeSenalesASuprimir } from './patrimonio-supresion-reglas.ts'

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

test('exclusión: ficha o identidad con supresión atendida; la denegada o la ajena no excluyen', () => {
  const s = (estado: string, clienteId: string | null, identidadId: string) => ({ estado, clienteId, identidadId })
  assert.equal(fichaSuprimida('c1', [], [s('resuelta_total', 'c1', 'i9')]), true, 'por ficha, sin identidad de portal')
  assert.equal(fichaSuprimida('c1', ['i1'], [s('resuelta_parcial', null, 'i1')]), true, 'por identidad que la opera')
  assert.equal(fichaSuprimida('c1', ['i1'], [s('denegada', 'c1', 'i1')]), false)
  assert.equal(fichaSuprimida('c1', ['i1'], [s('en_curso', 'c1', 'i1')]), false)
  assert.equal(fichaSuprimida('c1', ['i1'], [s('resuelta_total', 'c2', 'i2')]), false)
})

test('oposición: se registra salvo que ya esté vigente (true)', () => {
  assert.equal(hayQueRegistrarOposicion(null), true)
  assert.equal(hayQueRegistrarOposicion(false), true)
  assert.equal(hayQueRegistrarOposicion(true), false)
  assert.match(constanciaSenales(2, 'registrada'), /Oposición a nuevas señales registrada/)
  assert.match(constanciaSenales(2, 'error'), /NO registrada/)
})

test('cableado: resolverSupresion registra la oposición y el cron pasa `suprimida` a puedeCalcularSenales', () => {
  const sup = readFileSync(join(import.meta.dirname, 'supresiones.ts'), 'utf8')
  assert.match(sup, /registrarOposicionPorSupresion\(fila\.identidadId, entrada\.id\)/)
  const cron = readFileSync(join(import.meta.dirname, 'patrimonio-senales.ts'), 'utf8')
  assert.match(cron, /suprimida: fichaSuprimida\(fichaId, identidades, supresiones\)/)
  const db = readFileSync(join(import.meta.dirname, 'patrimonio-supresion.ts'), 'utf8')
  assert.match(db, /otorgado: true/)
  assert.match(db, /VERSION_TEXTO_OPOSICION_SENALES/)
})

test('resolverSupresion borra señales solo al atender (total/parcial), no al denegar', () => {
  const src = readFileSync(join(import.meta.dirname, 'supresiones.ts'), 'utf8')
  assert.match(src, /entrada\.estado === 'resuelta_total' \|\| entrada\.estado === 'resuelta_parcial'[\s\S]*borrarSenalesDeSupresion/)
})
