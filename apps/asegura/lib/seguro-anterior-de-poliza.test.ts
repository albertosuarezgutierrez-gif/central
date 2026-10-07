import { test } from 'node:test'
import assert from 'node:assert/strict'
import { competenciaDePoliza } from './seguro-anterior-de-poliza.ts'

const base = { aseguradora: 'Mapfre', numeroPoliza: '2002300386316', codigoDgs: null, fechaInicio: '2023-08-10', fechaVencimiento: '2026-08-10', matricula: '1234 abc' }

test('precarga compañía, nº, periodo y matrícula de la póliza', () => {
  const r = competenciaDePoliza(base)!
  assert.equal(r.numeroPoliza, '2002300386316')
  assert.equal(r.poliza.aseguradora, 'Mapfre')
  assert.equal(r.poliza.seguroAnterior?.numeroPoliza, '2002300386316')
  assert.equal(r.poliza.seguroAnterior?.fechaEfecto, '2023-08-10')
  assert.equal(r.poliza.seguroAnterior?.fechaVencimiento, '2026-08-10')
  assert.equal(r.poliza.seguroAnterior?.matricula, '1234ABC')
})

test('no inventa: sin bonus ni siniestros, y lo ausente es null/ausente', () => {
  const sa = competenciaDePoliza(base)!.poliza.seguroAnterior!
  assert.equal(sa.aniosSinSiniestros, null)
  assert.equal(sa.siniestrosUltimos5, null)
  const r = competenciaDePoliza({ ...base, fechaInicio: null, fechaVencimiento: null, matricula: null })!
  assert.equal(r.poliza.seguroAnterior?.fechaEfecto, null)
  assert.ok(!('fechaVencimiento' in r.poliza.seguroAnterior!))
  assert.ok(!('matricula' in r.poliza.seguroAnterior!))
})

test('fecha con forma rara o texto vacío no pasan como dato', () => {
  const r = competenciaDePoliza({ ...base, fechaInicio: '10/08/2023', numeroPoliza: '  ', codigoDgs: 'xx' })!
  assert.equal(r.numeroPoliza, null)
  assert.equal(r.poliza.seguroAnterior?.fechaEfecto, null)
  assert.equal(r.poliza.seguroAnterior?.codigoDgs, null)
  assert.ok(!('numeroPoliza' in r.poliza))
})

test('póliza sin nada utilizable → null', () => {
  assert.equal(competenciaDePoliza({ aseguradora: ' ', numeroPoliza: null, codigoDgs: null, fechaInicio: null, fechaVencimiento: null, matricula: null }), null)
})
