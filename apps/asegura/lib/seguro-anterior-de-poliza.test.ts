import { test } from 'node:test'
import assert from 'node:assert/strict'
import { competenciaDePoliza } from './seguro-anterior-de-poliza.ts'

const base = { aseguradora: 'Mapfre', numeroPoliza: '2002300386316', codigoDgs: null, fechaVencimiento: '2026-08-10', matricula: '1234 abc', importRef: null, eiacXmlHash: null, estado: 'en_vigor' }

test('precarga compañía, nº, periodo y matrícula de la póliza', () => {
  const r = competenciaDePoliza(base)!
  assert.equal(r.numeroPoliza, '2002300386316')
  assert.equal(r.poliza.aseguradora, 'Mapfre')
  assert.equal(r.poliza.seguroAnterior?.numeroPoliza, '2002300386316')
  assert.equal(r.poliza.seguroAnterior?.fechaEfecto, '2025-08-10')
  assert.equal(r.poliza.seguroAnterior?.fechaVencimiento, '2026-08-10')
  assert.equal(r.poliza.seguroAnterior?.matricula, '1234ABC')
})

test('no inventa: sin bonus ni siniestros, y lo ausente es null/ausente', () => {
  const sa = competenciaDePoliza(base)!.poliza.seguroAnterior!
  assert.equal(sa.aniosSinSiniestros, null)
  assert.equal(sa.siniestrosUltimos5, null)
  const r = competenciaDePoliza({ ...base, fechaVencimiento: null, matricula: null })!
  assert.equal(r.poliza.seguroAnterior?.fechaEfecto, null)
  assert.ok(!('fechaVencimiento' in r.poliza.seguroAnterior!))
  assert.ok(!('matricula' in r.poliza.seguroAnterior!))
})

test('fecha con forma rara o texto vacío no pasan como dato', () => {
  const r = competenciaDePoliza({ ...base, fechaVencimiento: '10/08/2026', numeroPoliza: '  ', codigoDgs: 'xx' })!
  assert.equal(r.numeroPoliza, null)
  assert.equal(r.poliza.seguroAnterior?.fechaEfecto, null)
  assert.equal(r.poliza.seguroAnterior?.codigoDgs, null)
  assert.ok(!('numeroPoliza' in r.poliza))
})

test('póliza sin nada utilizable → null', () => {
  assert.equal(competenciaDePoliza({ aseguradora: ' ', numeroPoliza: null, codigoDgs: null, fechaVencimiento: null, matricula: null, importRef: null, eiacXmlHash: null, estado: 'en_vigor' }), null)
})

test('efecto = vencimiento − 1 año; 29-feb → 28-feb; sin vencimiento válido → null (nunca la fecha de alta)', () => {
  assert.equal(competenciaDePoliza({ ...base, fechaVencimiento: '2028-02-29' })!.poliza.seguroAnterior?.fechaEfecto, '2027-02-28')
  assert.equal(competenciaDePoliza({ ...base, fechaVencimiento: null })!.poliza.seguroAnterior?.fechaEfecto, null)
})

test('póliza anulada/cancelada/sustituida/volcado histórico → nada (ni seguroAnterior ni nº)', () => {
  assert.ok(competenciaDePoliza(base))
  assert.equal(competenciaDePoliza({ ...base, estado: 'cancelada' }), null)
  assert.equal(competenciaDePoliza({ ...base, estado: null }), null)
  assert.equal(competenciaDePoliza({ ...base, sustituidaAt: new Date() }), null)
  assert.equal(competenciaDePoliza({ ...base, importRef: 'intranet:1' }), null)
})
