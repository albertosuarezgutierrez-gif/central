import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarRamoVivo, ramoDeCuerpo, esProductoVivo, type FilaCatalogoMin } from './guarda-catalogo.ts'

const prod = (ramo: string, nombre: string): FilaCatalogoMin => ({ tipo: 'producto', ramo, producto_nombre: nombre })
const AHORA = new Date('2026-11-05T10:00:00Z')

test('ramoDeCuerpo lee insuranceLine.id o null', () => {
  assert.equal(ramoDeCuerpo({ insuranceLine: { id: 'Car' } }), 'Car')
  assert.equal(ramoDeCuerpo({}), null)
  assert.equal(ramoDeCuerpo(null), null)
})

test('PILOTO no es vivo; DESCATALOGADO sí (sigue dando precios)', () => {
  assert.equal(esProductoVivo('PILOTO - Generali Autos 2025'), false)
  assert.equal(esProductoVivo('DESCATALOGADO - Mapfre Autos'), true)
  assert.equal(esProductoVivo('Mapfre Autos 2026'), true)
  assert.equal(esProductoVivo(null), true)
})

test('corta solo si todos los productos del ramo están muertos', () => {
  const muertos = [prod('Car', 'PILOTO - X'), prod('Car', 'PILOTO - Y'), prod('Home', 'Hogar A')]
  assert.equal(evaluarRamoVivo(muertos, 'Car', AHORA).accion, 'cortar')
  assert.equal(evaluarRamoVivo(muertos, 'Home', AHORA).accion, 'seguir')
  assert.equal(evaluarRamoVivo([...muertos, prod('Car', 'Auto vivo')], 'Car', AHORA).accion, 'seguir')
  // PILOTO + DESCATALOGADO: el descatalogado aún tarifica, no se corta
  assert.equal(evaluarRamoVivo([prod('Car', 'PILOTO - X'), prod('Car', 'DESCATALOGADO - Mapfre Autos')], 'Car', AHORA).accion, 'seguir')
})

test('corta con prueba de ramo vacío (llamada de productos ok con 0 elementos)', () => {
  const filas: FilaCatalogoMin[] = [{ tipo: 'llamada', ramo: 'Car', producto_nombre: null, extra: { clave: 'productos', estado: 'ok', elementos: 0 } }]
  assert.equal(evaluarRamoVivo(filas, 'Car', AHORA).accion, 'cortar')
})

test('sin instantánea, sin ramo o llamada con error: no bloquea', () => {
  for (const v of [evaluarRamoVivo(null, 'Car', AHORA), evaluarRamoVivo([], 'Car', AHORA), evaluarRamoVivo([prod('Home', 'A')], null, AHORA)]) {
    assert.equal(v.accion, 'seguir')
    assert.ok(v.accion === 'seguir' && v.aviso)
  }
  const err: FilaCatalogoMin[] = [{ tipo: 'llamada', ramo: 'Car', producto_nombre: null, extra: { clave: 'productos', estado: 'error' } }]
  assert.equal(evaluarRamoVivo(err, 'Car', AHORA).accion, 'seguir')
})

test('instantánea de más de 7 días: sigue pero avisa', () => {
  const v = evaluarRamoVivo([{ ...prod('Car', 'Vivo'), fecha: '2026-10-01T00:00:00Z' }], 'Car', AHORA)
  assert.equal(v.accion, 'seguir')
  assert.ok(v.accion === 'seguir' && /7 días/.test(v.aviso ?? ''))
})
