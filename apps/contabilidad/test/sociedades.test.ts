// Entradas de los borradores 200/202 desde el formulario: campo vacío = null (NO informado), «0» escrito = 0, y el resultado de los borradores
// sigue siendo null mientras falte un dato. Cepo visto fallar el 05/11/2026: cambiando `if (t === '') return null` por `return 0` → rojo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { borrador200, borrador202 } from '@central/module-contabilidad'
import { entrada200, entrada202, parsearPorcentajePb } from '../lib/sociedades-form.ts'

test('porcentaje: «25» y «25,5» a puntos básicos; basura y fuera de rango → null', () => {
  assert.equal(parsearPorcentajePb('25'), 2500)
  assert.equal(parsearPorcentajePb('25,5'), 2550)
  assert.equal(parsearPorcentajePb('25 %'), 2500)
  for (const malo of ['', 'abc', '101', '-3', '25.5', '25,555']) assert.equal(parsearPorcentajePb(malo), null, malo)
})

test('200 desde el formulario: vacío = null; «0» = 0; el resultado es null hasta tener TODOS los datos', () => {
  const vacio = entrada200({}, 2026, 1000000)
  assert.equal(vacio.entrada.ajustesPositivos, null)
  assert.equal(vacio.entrada.tipoGravamenPb, null)
  assert.equal(borrador200(vacio.entrada).resultado, null)
  const parcial = entrada200({ ajp: '0', ajn: '0', comp: '0', tipo: '25', ded: '', ret: '0', pf: '0' }, 2026, 1000000)
  assert.equal(parcial.entrada.ajustesPositivos, 0)
  assert.equal(parcial.entrada.deducciones, null)
  assert.equal(borrador200(parcial.entrada).resultado, null, 'falta deducciones')
  const completo = entrada200({ ajp: '0', ajn: '0', comp: '0', tipo: '25', ded: '0', ret: '1.000,00', pf: '2.000,00' }, 2026, 1000000)
  assert.deepEqual(completo.errores, [])
  assert.equal(borrador200(completo.entrada).resultado, 250000 - 100000 - 200000)
})

test('importes mal escritos se señalan y quedan como NO informados (nunca 0)', () => {
  const r = entrada200({ ajp: '12abc', tipo: '300' }, 2026, 0)
  assert.equal(r.entrada.ajustesPositivos, null)
  assert.equal(r.entrada.tipoGravamenPb, null)
  assert.equal(r.errores.length, 2)
})

test('202 desde el formulario: periodo y modalidad por defecto sin inventar datos; sin modalidad no hay resultado', () => {
  const r = entrada202({ periodo: '2P' }, 2026)
  assert.equal(r.entrada.periodo, '2P')
  assert.equal(r.entrada.modalidad, null)
  assert.equal(borrador202(r.entrada).resultado, null)
  const ok = entrada202({ periodo: '1P', modalidad: 'art40_2', cib: '10.000,00', dedb: '0', retb: '0' }, 2026)
  assert.equal(borrador202(ok.entrada).resultado, 180000)
  assert.equal(entrada202({ periodo: 'xx' }, 2026).entrada.periodo, '1P')
})
