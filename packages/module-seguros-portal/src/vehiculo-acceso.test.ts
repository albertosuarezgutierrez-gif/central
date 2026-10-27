import test from 'node:test'
import assert from 'node:assert/strict'

import type { PapelFlota } from './flota.ts'
import { ambitoDeDefecto, empresasGestionables, esUuid, resolverGestionVehiculo, type BienParaGestion } from './vehiculo-acceso.ts'

const YO = 'identidad-a'
const OTRA = 'identidad-b'
const accesos = new Map<string, PapelFlota>([
  ['empresa-a', 'dueno'],
  ['empresa-j', 'jefe_flota'],
])
const bien = (b: Partial<BienParaGestion>): BienParaGestion => ({ id: 'bien-1', identidadId: null, clienteId: null, tipo: 'vehiculo', ...b })

test('particular: solo su dueño (la identidad de la sesión) lo gestiona', () => {
  assert.deepEqual(resolverGestionVehiculo({ identidadId: YO, bien: bien({ identidadId: YO }), accesosFlota: new Map() }), {
    papel: 'dueno_particular',
    bienId: 'bien-1',
    ambito: { identidadId: YO },
  })
  // 🚨 §7-4: particular A con el bien de B → nada (404).
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: bien({ identidadId: OTRA }), accesosFlota: accesos }), null)
})

test('empresa: dueño o jefe de flota de ESA empresa; otra empresa → nada', () => {
  const d = resolverGestionVehiculo({ identidadId: YO, bien: bien({ clienteId: 'empresa-a' }), accesosFlota: accesos })
  assert.deepEqual(d, { papel: 'dueno', bienId: 'bien-1', ambito: { clienteId: 'empresa-a' }, empresaId: 'empresa-a' })
  const j = resolverGestionVehiculo({ identidadId: YO, bien: bien({ clienteId: 'empresa-j' }), accesosFlota: accesos })
  assert.equal(j?.papel, 'jefe_flota')
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: bien({ clienteId: 'empresa-b' }), accesosFlota: accesos }), null)
})

test('🚨 §7-4 dos mundos: particular con bien de empresa (sin acceso de flota) y empresa con bien de persona → nada', () => {
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: bien({ clienteId: 'empresa-a' }), accesosFlota: new Map() }), null)
  // El jefe de flota de la empresa A no gestiona el coche PARTICULAR de nadie.
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: bien({ identidadId: OTRA }), accesosFlota: accesos }), null)
})

test('bien corrupto (dos dueños o ninguno), que no es vehículo o que no existe → nada', () => {
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: bien({ identidadId: YO, clienteId: 'empresa-a' }), accesosFlota: accesos }), null)
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: bien({}), accesosFlota: accesos }), null)
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: bien({ identidadId: YO, tipo: 'inmueble' }), accesosFlota: accesos }), null)
  assert.equal(resolverGestionVehiculo({ identidadId: YO, bien: null, accesosFlota: accesos }), null)
})

test('el defecto: persona = la propia identidad; empresa = solo una de los accesos (el id del cuerpo se busca dentro)', () => {
  assert.deepEqual(ambitoDeDefecto({ ambito: 'persona', identidadId: OTRA }, YO, accesos), { identidadId: YO })
  assert.deepEqual(ambitoDeDefecto({ ambito: 'empresa', empresaId: 'empresa-j' }, YO, accesos), { clienteId: 'empresa-j' })
  assert.equal(ambitoDeDefecto({ ambito: 'empresa', empresaId: 'empresa-b' }, YO, accesos), null)
  assert.equal(ambitoDeDefecto({ ambito: 'empresa', clienteId: 'empresa-a' }, YO, accesos), null)
  assert.equal(ambitoDeDefecto({ ambito: 'otro' }, YO, accesos), null)
  assert.equal(ambitoDeDefecto(null, YO, accesos), null)
  // Un papel que NO edita vehículos (F2 traerá otros) no cambia el defecto de la sociedad aunque esté en los accesos.
  assert.equal(ambitoDeDefecto({ ambito: 'empresa', empresaId: 'empresa-x' }, YO, new Map([['empresa-x', 'conductor' as PapelFlota]])), null)
})

test('empresas gestionables y forma de uuid', () => {
  assert.deepEqual(empresasGestionables(accesos).sort(), ['empresa-a', 'empresa-j'])
  assert.ok(esUuid('0b6f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'))
  assert.ok(!esUuid('1 OR 1=1'))
  assert.ok(!esUuid(42))
})
