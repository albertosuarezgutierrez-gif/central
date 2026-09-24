import { test } from 'node:test'
import assert from 'node:assert/strict'

import { anulacionPorCambio, documentoAceptacion, esCambioCompania, validarNecesidades } from './aceptacion-presupuesto.ts'

test('🪤 el cambio de compañía se decide por código DGS; sin código NO se afirma', () => {
  assert.equal(esCambioCompania('C0058', 'C0109'), true)
  assert.equal(esCambioCompania('c0058', 'C0058'), false)
  assert.equal(esCambioCompania(null, 'C0109'), null)
  assert.equal(esCambioCompania('C0058', ''), null)
})

test('la anulación va a vencimiento; sin vencimiento o ya vencida no se compone; sin preaviso, se advierte', () => {
  const hoy = new Date('2026-09-23T10:00:00Z')
  const ok = anulacionPorCambio({ compania: 'Mapfre', numeroPoliza: '123', vencimiento: '2026-12-31' }, hoy)
  assert.deepEqual(ok, { ok: true, tipo: 'sustitucion', fechaEfecto: '2026-12-31', advertencia: null })
  const justo = anulacionPorCambio({ compania: 'Mapfre', numeroPoliza: '123', vencimiento: '2026-10-10' }, hoy)
  assert.ok(justo.ok && justo.advertencia && /art\. 22/.test(justo.advertencia))
  assert.equal(anulacionPorCambio({ compania: 'Mapfre', numeroPoliza: '123', vencimiento: null }, hoy).ok, false)
  assert.equal(anulacionPorCambio({ compania: 'Mapfre', numeroPoliza: '123', vencimiento: '2026-09-01' }, hoy).ok, false)
  assert.equal(anulacionPorCambio({ compania: null, numeroPoliza: '123', vencimiento: '2026-12-31' }, hoy).ok, false)
  // 31/03 → el mes de preaviso acaba el 28/02 (no el 01/03).
  const marzo = anulacionPorCambio({ compania: 'M', numeroPoliza: '1', vencimiento: '2027-03-31' }, new Date('2027-03-01T08:00:00Z'))
  assert.ok(marzo.ok && marzo.advertencia)
})

const base = {
  tomador: 'José Suárez Salas', mediador: 'Grupo ASegura', claveDgsfp: 'CS-F/0170', ramo: 'auto',
  opcion: { compania: 'Allianz', producto: 'Todo riesgo', primaEur: 412.5, franquiciaEur: null, firmeza: 'estimado' as const },
  calculadoEl: '2026-09-20', venceEl: '2026-10-05', fechaFirma: '2026-09-23', anula: null,
  vistoAntes: { opciones: 3, companias: 2, informacionMediador: 'https://clientes.grupoasegura.es/legal/mediador', versionTextos: '2026-09-v5' },
  necesidades: 'Coche de uso diario; quiere lunas y asistencia en viaje; prioriza precio.' as string | null,
}

test('🪤 el documento dice en su cara que NO es la contratación', () => {
  const t = documentoAceptacion(base)
  assert.match(t, /NO es todavía el contrato/)
  assert.match(t, /no hay cobertura hasta que la emita/)
  assert.match(t, /412,50€/)
  assert.doesNotMatch(t, /anule/)
})

test('🪤 con cambio de compañía, la anulación va en el documento y dice que espera a la emisión', () => {
  const t = documentoAceptacion({ ...base, anula: { compania: 'Mapfre', numeroPoliza: '0981', fechaEfecto: '2026-12-31' } })
  assert.match(t, /anule mi póliza actual de Mapfre, nº 0981, con efecto el 31\/12\/2026/)
  assert.match(t, /solo se comunicará a la compañía cuando la nueva póliza esté emitida/)
})

test('🪤 lo firmado deja constancia de lo que vio antes: opciones, compañías, versión y dónde está la información del mediador', () => {
  const t = documentoAceptacion(base)
  assert.match(t, /Antes de aceptar he tenido delante las 3 opciones de 2 compañías/)
  assert.match(t, /textos legales 2026-09-v5, en https:\/\/clientes\.grupoasegura\.es\/legal\/mediador/)
  assert.match(t, /vínculo exclusivo/)
  // Una sola opción se dice en singular; sin recuento no se inventa ninguno.
  assert.match(documentoAceptacion({ ...base, vistoAntes: { ...base.vistoAntes, opciones: 1, companias: 1 } }), /he tenido delante la opción de 1 compañía/)
  const sin = documentoAceptacion({ ...base, vistoAntes: { ...base.vistoAntes, opciones: 0, companias: 0 } })
  assert.doesNotMatch(sin, /tenido delante l/)
  assert.match(sin, /su información como mediador/)
})

test('🪤 lo firmado cita las necesidades; sin ellas lo DICE, no las calla', () => {
  assert.match(documentoAceptacion(base), /mis exigencias y necesidades\): «Coche de uso diario; quiere lunas/)
  assert.match(documentoAceptacion({ ...base, necesidades: null }), /No constan por escrito mis exigencias y necesidades\./)
  assert.match(documentoAceptacion({ ...base, necesidades: '   ' }), /No constan por escrito/)
})

test('las necesidades se validan: ni vacías ni un «ok», ni kilométricas; se normalizan los espacios', () => {
  assert.equal(validarNecesidades('ok').ok, false)
  assert.equal(validarNecesidades(null).ok, false)
  assert.equal(validarNecesidades('x'.repeat(1501)).ok, false)
  assert.deepEqual(validarNecesidades('  Hogar  en Sevilla,\n contenido y RC  '), { ok: true, valor: 'Hogar en Sevilla, contenido y RC' })
})
