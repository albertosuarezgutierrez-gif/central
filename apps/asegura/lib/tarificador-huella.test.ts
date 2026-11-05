// Huella del riesgo de tarificar y caché de 24 h (05/11/2026). `node --test`. Sin datos reales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esHuella, horasDesde, huellaRiesgo, jsonCanonico, llevaHuella, mensajeReutilizado, okReutilizable, type EntradaHuella } from './tarificador-huella.ts'

// Secreto de PRUEBA sin forma de clave real.
const S = 'EJEMPLO_REDACTADO'
const base: EntradaHuella = {
  correduriaId: 'c-1', clienteId: 'cli-1', oportunidadId: 'op-1', polizaId: null, compania: 'allianz', ramo: 'auto', modo: 'tarificar',
  riesgo: { ramo: 'auto', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-01-01' }, seleccionVehiculo: { marca: 'X', modelo: 'Y' } },
}

test('JSON canónico: el orden de las claves no cambia el texto', () => {
  assert.equal(jsonCanonico({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }), jsonCanonico({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }))
  assert.equal(jsonCanonico({ a: undefined, b: 1 }), '{"b":1}')
})

test('misma entrada → misma huella (64 hex); otro orden de claves → la misma', () => {
  const h = huellaRiesgo(base, S)
  assert.ok(esHuella(h))
  const reordenado = { ...base, riesgo: { seleccionVehiculo: { modelo: 'Y', marca: 'X' }, conductor: { fechaNacimiento: '1980-01-01' }, codigoPostal: '41003', ramo: 'auto' } }
  assert.equal(huellaRiesgo(reordenado, S), h)
})

test('cualquier diferencia del encargo cambia la huella (también lo que la purga quitaría)', () => {
  const h = huellaRiesgo(base, S)
  const variantes: Partial<EntradaHuella>[] = [
    { correduriaId: 'c-2' }, { clienteId: 'cli-2' }, { oportunidadId: null }, { polizaId: 'p-1' }, { compania: 'mapfre' }, { ramo: 'moto' },
    // Otro CONDUCTOR con el mismo coche y CP: la purga lo borraría; la huella NO puede confundirlos (sería un precio ajeno).
    { riesgo: { ...(base.riesgo as object), conductor: { fechaNacimiento: '1999-01-01' } } },
  ]
  for (const v of variantes) assert.notEqual(huellaRiesgo({ ...base, ...v }, S), h, JSON.stringify(v))
  assert.notEqual(huellaRiesgo(base, 'otro-secreto'), h)
})

test('sin huella: sin secreto, hogar, otro modo o riesgo que no es objeto', () => {
  assert.equal(huellaRiesgo(base, null), null)
  assert.equal(huellaRiesgo(base, '  '), null)
  assert.equal(huellaRiesgo({ ...base, ramo: 'hogar' }, S), null)
  for (const modo of ['emision', 'exploracion', 'humo', 'pilotaje', 'vehiculo']) assert.equal(huellaRiesgo({ ...base, modo }, S), null, modo)
  assert.equal(huellaRiesgo({ ...base, riesgo: [] }, S), null)
  assert.equal(huellaRiesgo({ ...base, riesgo: null }, S), null)
  assert.equal(llevaHuella('auto', null), true)
  assert.equal(llevaHuella('hogar', 'tarificar'), false)
})

test('la huella no deja ver el riesgo en claro', () => {
  const h = huellaRiesgo(base, S)!
  for (const dato of ['41003', '1980', 'allianz', 'cli-1']) assert.ok(!h.includes(dato), dato)
})

test('caché: solo un ok CON precio de hace < 24 h', () => {
  const ahora = new Date('2026-11-05T12:00:00Z')
  const hace = (h: number) => new Date(ahora.getTime() - h * 3600_000)
  assert.equal(okReutilizable({ terminadoAt: hace(3), conPrecio: true, ahora }), true)
  assert.equal(okReutilizable({ terminadoAt: hace(23.9), conPrecio: true, ahora }), true)
  assert.equal(okReutilizable({ terminadoAt: hace(24), conPrecio: true, ahora }), false)
  assert.equal(okReutilizable({ terminadoAt: hace(3), conPrecio: false, ahora }), false)
  assert.equal(okReutilizable({ terminadoAt: null, conPrecio: true, ahora }), false)
  assert.equal(okReutilizable({ terminadoAt: hace(-1), conPrecio: true, ahora }), false)
  assert.equal(horasDesde(hace(5.7), ahora), 5)
  assert.match(mensajeReutilizado(hace(5.7), ahora), /^Precio reutilizado de hace 5 h/)
  assert.match(mensajeReutilizado(hace(0.2), ahora), /hace menos de 1 h/)
})
