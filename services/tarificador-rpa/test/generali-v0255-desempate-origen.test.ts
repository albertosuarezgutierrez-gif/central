// Generali Turismos v0.2.55 (31/10/2026, trabajo 24317a03 parado en `requiere_eleccion_version` con «FORFOUR · FORTWO CABRIO · FORTWO COUPE»).
// Generali no busca por matrícula: antes de parar, el catálogo se desempata con el vehículo de ORIGEN (Mapfre `vehiculoConfirmado`,
// Allianz/póliza `seleccionVehiculo`). Solo con EXACTAMENTE una opción compatible; se declara como supuesto (precio `estimado`).
// Fixtures SINTÉTICAS (solo nombres de catálogo y datos técnicos; nada personal).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avisoEsSupuesto, firmezaPrecioRpa, type FormularioAuto } from '@central/module-tarificacion'
import { VERSION_GENERALI_AUTO, desempateOrigenSinPersona, versionGeneraliPorEquivalencia } from '../src/adapters/generali/auto.ts'
import { desempatarPorOrigenGenerali, origenesDesempateGenerali, type OrigenDesempateGenerali } from '../src/adapters/generali/reglas.ts'

const SMART = ['Seleccione uno', 'FORFOUR', 'FORTWO CABRIO', 'FORTWO COUPE']
const MAPFRE: OrigenDesempateGenerali = { fuente: 'Mapfre', texto: 'Smart Forfour Pure 1.1', puertas: 5, cv: 75, cc: 1124 }
const ALLIANZ: OrigenDesempateGenerali = { fuente: 'Allianz/póliza', texto: 'SMART Fortwo PASSION 52', puertas: null, cv: null, cc: null }

test('v0.2.55 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.59'))

test('v0.2.55 · única coincidencia: la denominación de Mapfre (FORFOUR, 5 puertas) casa con UNA opción → esa, declarada', () => {
  const d = desempatarPorOrigenGenerali(SMART, [MAPFRE], 'modelo')
  assert.equal(d.tipo, 'unica')
  if (d.tipo !== 'unica') return
  assert.equal(SMART[d.indice], 'FORFOUR')
  assert.match(d.supuesto, /FORFOUR/)
  assert.match(d.supuesto, /Mapfre/)
  assert.ok(avisoEsSupuesto(d.supuesto), 'el aviso cuenta como supuesto para la firmeza')
})

test('v0.2.55 · única coincidencia por carrocería: «Fortwo Coupé» descarta CABRIO (contradice) y FORFOUR (sin apoyo)', () => {
  const d = desempatarPorOrigenGenerali(SMART, [{ ...ALLIANZ, texto: 'SMART Fortwo Coupé Passion' }], 'modelo')
  assert.equal(d.tipo === 'unica' ? SMART[d.indice] : d.tipo, 'FORTWO COUPE')
})

test('v0.2.55 · ninguna: Mapfre (Forfour) y Allianz (Fortwo) discrepan → 0 compatibles, sigue en requiere_humano', () => {
  assert.deepEqual(desempatarPorOrigenGenerali(SMART, [MAPFRE, ALLIANZ], 'modelo'), { tipo: 'ninguna' })
  // Contradicción técnica: el único apoyado (por palabra) tiene otras puertas → fuera.
  assert.deepEqual(desempatarPorOrigenGenerali(['FORFOUR 3P', 'FORTWO COUPE'], [MAPFRE], 'modelo'), { tipo: 'ninguna' })
})

test('v0.2.55 · varias: «Fortwo PASSION 52» casa con FORTWO CABRIO y FORTWO COUPE → no se elige', () => {
  const d = desempatarPorOrigenGenerali(SMART, [ALLIANZ], 'modelo')
  assert.equal(d.tipo, 'varias')
  if (d.tipo === 'varias') assert.deepEqual(d.indices.map((i) => SMART[i]), ['FORTWO CABRIO', 'FORTWO COUPE'])
})

test('v0.2.55 · sin datos de origen → sin_datos (y el formulario sin vehículo no da orígenes)', () => {
  assert.deepEqual(desempatarPorOrigenGenerali(SMART, []), { tipo: 'sin_datos' })
  assert.deepEqual(origenesDesempateGenerali({}), [])
  assert.equal(desempateOrigenSinPersona(SMART, {}, 'modelo'), null)
})

test('v0.2.55 · orígenes del formulario: campos técnicos de Mapfre y la selección de Allianz/póliza', () => {
  const o = origenesDesempateGenerali({
    vehiculoConfirmado: { origen: 'mapfre', denominacion: 'Smart Forfour Pure 1.1', cv: 75, cc: 1124, puertas: 5, fechaInicio: '2005-03-01' },
    seleccionVehiculo: { marca: 'SMART', modelo: 'Fortwo', clase: null, cilindradaCc: null, descripcion: 'PASSION 52' },
  } as Pick<FormularioAuto, 'seleccionVehiculo' | 'vehiculoConfirmado'>)
  assert.deepEqual(o, [MAPFRE, ALLIANZ])
})

const formMapfre = { vehiculoConfirmado: { origen: 'mapfre', denominacion: 'Smart Forfour Pure 1.1', cv: 75, cc: 1124, puertas: 5, fechaInicio: '2005-03-01' } } as Pick<FormularioAuto, 'eleccionVersion' | 'seleccionVehiculo' | 'vehiculoConfirmado' | 'fechaMatriculacion'>

test('v0.2.55 · cableado: la versión que iba a parar se elige por el origen; la elección de una persona manda (no se pisa)', () => {
  // Mismos CV y combustible distinto: la equivalencia (regla común) diría «material» y pararía; el origen («1.1») deja UNA.
  const r = versionGeneraliPorEquivalencia(['1.1 PURE 75CV GASOLINA', '1.5 CDI PURE 75CV DIESEL'], formMapfre)
  assert.equal(r.indice, 0)
  assert.ok(r.supuesto && avisoEsSupuesto(r.supuesto), r.supuesto ?? '')
  assert.match(r.supuesto!, /coincidencia con el vehículo de Mapfre/)
  assert.equal(desempateOrigenSinPersona(SMART, { ...formMapfre, eleccionVersion: { etiqueta: 'FORTWO COUPE' } }, 'modelo'), null)
})

test('v0.2.55 · firmeza: una oferta con la versión elegida por el origen queda `estimado`', () => {
  const d = desempateOrigenSinPersona(SMART, formMapfre, 'modelo')
  assert.ok(d)
  assert.equal(firmezaPrecioRpa({ compania: 'generali', ramo: 'auto', riesgo: { polizaAnteriorUltimos5: '12345' }, oferta: { polizaAnteriorTecleada: true, avisos: [d!.supuesto] } }), 'estimado')
})
