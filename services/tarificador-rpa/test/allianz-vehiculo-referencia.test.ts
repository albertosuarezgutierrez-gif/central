// Allianz 0.6.38 / Moto 0.7.22 (01/11/2026): el vehículo de REFERENCIA de la oportunidad decide la versión donde antes se paraba.
// Fixtures SINTÉTICAS (solo nombres de catálogo). Cada brazo visto en rojo rompiendo lo que protege.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoEsSupuesto, type CandidatoVersion, type VehiculoReferencia } from '@central/module-tarificacion'
import { allianzAuto, decidirTarjetaVehiculoTurismos, eleccionVersionConOrigen, ErrorEleccionVersion, versionAutomaticaAllianz } from '../src/adapters/allianz/auto.ts'

const vr = (o: Partial<VehiculoReferencia>): VehiculoReferencia => ({
  origen: 'mapfre', marca: null, modelo: null, version: null, carroceria: null, puertas: null, cc: null, cv: null, combustible: null, anio: null, ...o,
})
// Diferencias MATERIALES entre candidatas (combustible y CV): la equivalencia de siempre pregunta.
const OPCIONES: CandidatoVersion[] = [
  { codigo: 'A1', etiqueta: 'FORTWO PASSION 52KW GASOLINA' },
  { codigo: 'A2', etiqueta: 'FORTWO PULSE 66KW GASOLINA' },
  { codigo: 'A3', etiqueta: 'FORFOUR PURE 52KW DIESEL' },
]

test('versión 0.6.38', () => assert.equal(allianzAuto.version, '0.6.39'))

test('sin referencia: sigue parando como siempre (requiere_humano)', () => {
  assert.throws(() => versionAutomaticaAllianz(OPCIONES, {}), ErrorEleccionVersion)
})

test('con referencia de Mapfre: elige SOLA por similitud y lo declara como supuesto (vehículo según Mapfre)', () => {
  const r = versionAutomaticaAllianz(OPCIONES, { vehiculoReferencia: vr({ marca: 'SMART', modelo: 'FORFOUR', version: 'PURE 1.1', cv: 71 }) })
  assert.equal(r.indice, 2)
  assert.deepEqual(r.eleccion, { codigo: 'A3', etiqueta: 'FORFOUR PURE 52KW DIESEL' })
  assert.match(r.supuesto ?? '', /vehículo según Mapfre/)
  assert.equal(avisoEsSupuesto(r.supuesto), true)
})

test('tarjetas de Turismos: la referencia decide en vez de parar', () => {
  const t = OPCIONES.map((o) => ({ etiqueta: o.etiqueta }))
  assert.throws(() => decidirTarjetaVehiculoTurismos(t, {}), ErrorEleccionVersion)
  const d = decidirTarjetaVehiculoTurismos(t, { vehiculoReferencia: vr({ modelo: 'FORTWO', version: 'PULSE' }) })
  assert.equal(d.indice, 1)
  assert.match(d.supuesto ?? '', /vehículo de referencia \(vehículo según Mapfre; supuesto\)/)
})

test('la elección explícita de la bandeja que no casa NO se enmienda con la referencia', () => {
  assert.throws(() => versionAutomaticaAllianz(OPCIONES, { eleccionVersion: { codigo: 'NO', etiqueta: null }, vehiculoReferencia: vr({ modelo: 'FORFOUR' }) }), ErrorEleccionVersion)
})

test('referencia HUMANA manda sobre la similitud con Mapfre y sobre la equivalencia', () => {
  const vc = { origen: 'mapfre' as const, denominacion: 'FORTWO PASSION', cv: 71, cc: null, puertas: null, fechaInicio: null }
  const humano = vr({ origen: 'humano', modelo: 'FORFOUR', version: 'PURE' })
  const conCv: CandidatoVersion[] = [{ codigo: 'C1', etiqueta: 'FORTWO PASSION 71CV' }, { codigo: 'C2', etiqueta: 'FORFOUR PURE 90CV' }]
  assert.equal(eleccionVersionConOrigen({ versiones: conCv }, { vehiculoConfirmado: vc, vehiculoReferencia: humano }).eleccion, null)
  assert.equal(eleccionVersionConOrigen({ versiones: conCv }, { vehiculoConfirmado: vc }).eleccion?.codigo, 'C1')
  // Equivalentes entre sí (la equivalencia elegiría la primera): la persona dijo la tercera.
  const equivalentes: CandidatoVersion[] = [
    { codigo: 'B1', etiqueta: 'FORTWO PASSION' },
    { codigo: 'B2', etiqueta: 'FORTWO PULSE' },
    { codigo: 'B3', etiqueta: 'FORFOUR PURE' },
  ]
  assert.equal(versionAutomaticaAllianz(equivalentes, {}).indice, 0)
  const r = versionAutomaticaAllianz(equivalentes, { vehiculoReferencia: humano })
  assert.equal(r.indice, 2)
  assert.match(r.supuesto ?? '', /vehículo según elección en la bandeja/)
})
