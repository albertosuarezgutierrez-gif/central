import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esDelTomador, peticionDeProyecto, resumenProyecto } from './proyectos-cliente.ts'

// Forma REAL de un proyecto hecho en la web de Avant2 (40956228), anonimizada.
const crudo = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../fixtures/codeoscopic/2026-09-29-proyecto-web-moto-avant2.json'), 'utf8'),
)

test('resumen: ramo, riesgo, compañía anterior y enlace a Avant2 salen del proyecto real', () => {
  const r = resumenProyecto(crudo)
  assert.equal(r.projectId, '40956228')
  assert.equal(r.ramo, 'moto')
  assert.equal(r.riesgo, '0000XXX')
  assert.equal(r.companiaAnterior, 'DIVINA PASTORA / CLEVEREA')
  assert.equal(r.avant2Url, 'https://app.avant2.es/production/40956228')
  assert.equal(r.precios, 3)
})

test('resumen: el mejor precio es el más barato y dice si la compañía lo confirmó', () => {
  const r = resumenProyecto(crudo)
  assert.deepEqual(r.mejor, { compania: 'Allianz', modalidad: 'ALLIANZ MOTO BÁSICO', primaEur: 106.77, firme: true })
  assert.equal(r.confirmados, 1)
})

test('resumen: un proyecto sin precios no inventa un «mejor»', () => {
  const r = resumenProyecto({ ...crudo, mainQuotes: [], offers: [] })
  assert.equal(r.mejor, null)
  assert.equal(r.precios, 0)
})

test('tomador: se reconoce por documento normalizado, nunca por nombre', () => {
  assert.equal(esDelTomador(crudo, '00000000t'), true)
  assert.equal(esDelTomador(crudo, ' 00000000-T '), true)
  assert.equal(esDelTomador(crudo, '11111111H'), false)
  assert.equal(esDelTomador(crudo, null), false)
  assert.equal(esDelTomador({ ...crudo, holder: { name: 'Nombre', surname: 'Apellido' } }, '00000000T'), false)
})

test('petición guardada: lleva el riesgo y el tomador del propio proyecto', () => {
  const p = peticionDeProyecto(crudo) as Record<string, any>
  assert.equal(p.insuranceLine.id, 'Motorcycle')
  assert.equal(p.effectiveDate, '2026-09-30')
  assert.equal(p.risk.previousInsurance.previousCompany.code, 'C0247')
  assert.equal(p.holder.identificationDocument.id, '00000000T')
})

test('resumen: sin policyApplications la emisión es null (no «no emitida»)', () => {
  assert.equal(resumenProyecto(crudo).emision, null)
})

test('resumen: con una solicitud en riesgo condicionado trae la emisión resumida', () => {
  const r = resumenProyecto({
    ...crudo,
    policyApplications: [{ id: 'PA1', status: { id: 'ConditionedRisk', name: 'Riesgo condicionado' }, quote: { id: 'Q1', premium: 99, product: { vendor: { name: 'Allianz' } } } }],
  })
  assert.equal(r.emision?.estado, 'pendiente')
  assert.equal(r.emision?.compania, 'Allianz')
  assert.equal(r.emision?.numeroPoliza, null)
  assert.equal(r.emision?.estadoVendor, 'Riesgo condicionado')
})
