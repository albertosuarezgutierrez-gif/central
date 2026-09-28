import test from 'node:test'
import assert from 'node:assert/strict'

import { clasificarCoberturas } from './catalogo-garantias.ts'
import {
  capitalServicio,
  cambiosFrenteActual,
  garantiasDeNecesidades,
  seguimientoPendiente,
  type PresupuestoParaSeguimiento,
} from './presupuesto-ayudas.ts'

test('necesidades: marca lo que pide y NO lo que dice que no quiere', () => {
  const r = garantiasDeNecesidades('auto', 'Quiere grúa y lunas, pero no necesita vehículo de sustitución')
  assert.ok(r.includes('asistencia_viaje'), r.join())
  assert.ok(r.includes('lunas'), r.join())
  assert.ok(!r.includes('vehiculo_sustitucion'), r.join())
  assert.deepEqual(garantiasDeNecesidades('auto', null), [])
  assert.deepEqual(garantiasDeNecesidades('auto', 'lo más barato posible'), [])
})

test('capital del servicio: el literal de Codeoscopic; sin él, null (no 0)', () => {
  assert.equal(capitalServicio(['Capital de servicio por asegurado: 3.600,00 €']), 3600)
  assert.equal(capitalServicio(['Capital de servicio por asegurado: 2.873,00 €', 'otro']), 2873)
  assert.equal(capitalServicio(['Vencimiento de la póliza: 31 de Diciembre']), null)
  assert.equal(capitalServicio(null), null)
})

test('cambios frente a la actual: «pierdes» solo con un NO explícito; sin actual, null', () => {
  const actual = clasificarCoberturas('auto', [
    { nombre: 'Lunas', incluida: true },
    { nombre: 'Asistencia en viaje', incluida: true },
  ])
  const opcion = clasificarCoberturas('auto', [
    { nombre: 'Lunas', incluida: false },
    { nombre: 'Vehículo de sustitución', incluida: true },
  ])
  const c = cambiosFrenteActual('auto', opcion, actual)!
  assert.deepEqual(c.pierdes, ['Lunas'])
  assert.deepEqual(c.ganas, ['Vehículo de sustitución'])
  assert.ok(c.sinDato.includes('Asistencia en viaje y grúa'))
  assert.equal(cambiosFrenteActual('auto', opcion, null), null)
})

const base: PresupuestoParaSeguimiento = {
  enviadoAt: new Date('2026-09-20T10:00:00Z'),
  vistoAt: null,
  elegidoAt: null,
  aceptadoAt: null,
  retiradoAt: null,
  venceEl: new Date('2026-10-20T00:00:00Z'),
  avisadas: [],
}

test('seguimiento: sin abrir a las 48 h, sin elegir a las 72 h, y UNA vez por etapa', () => {
  assert.equal(seguimientoPendiente(base, new Date('2026-09-21T09:00:00Z')), null)
  assert.equal(seguimientoPendiente(base, new Date('2026-09-22T11:00:00Z')), 'sin_abrir')
  assert.equal(seguimientoPendiente({ ...base, avisadas: ['sin_abrir'] }, new Date('2026-09-22T11:00:00Z')), null)
  const visto = { ...base, vistoAt: new Date('2026-09-21T10:00:00Z') }
  assert.equal(seguimientoPendiente(visto, new Date('2026-09-23T10:00:00Z')), null)
  assert.equal(seguimientoPendiente(visto, new Date('2026-09-24T11:00:00Z')), 'sin_elegir')
})

test('seguimiento: nada si no salió, si ya eligió, si está retirado o si caducó', () => {
  const t = new Date('2026-09-25T00:00:00Z')
  assert.equal(seguimientoPendiente({ ...base, enviadoAt: null }, t), null)
  assert.equal(seguimientoPendiente({ ...base, elegidoAt: t }, t), null)
  assert.equal(seguimientoPendiente({ ...base, retiradoAt: t }, t), null)
  assert.equal(seguimientoPendiente({ ...base, venceEl: new Date('2026-09-24T00:00:00Z') }, t), null)
})
