import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosVehiculoParaOportunidad, emparejarCombustible, emparejarVehiculo, type CatalogosVehiculo } from './oportunidad-vehiculo-catalogo.ts'

const MARCAS = [{ id: '731', nombre: 'Tesla' }, { id: '10', nombre: 'Seat' }, { id: '11', nombre: 'SEAT' }]
const MODELOS = [{ id: '8689', nombre: 'Model 3' }, { id: '8690', nombre: 'Model Y' }]
const MOTORES = [{ id: 'Gasoline', nombre: 'Gasolina' }, { id: 'Diesel', nombre: 'Diésel' }, { id: 'Electric', nombre: 'Eléctrico' }, { id: 'Hybrid', nombre: 'Híbrido' }, { id: 'PlugInHybrid', nombre: 'Híbrido enchufable' }]
const VERSIONES = [{ id: '111', nombre: 'Long Range' }, { id: '222', nombre: 'Performance' }, { id: '333', nombre: 'Performance' }]

const cat = (o: Partial<CatalogosVehiculo> = {}): CatalogosVehiculo => ({
  marcas: async () => MARCAS, modelos: async () => MODELOS, motores: async () => MOTORES, versiones: async () => VERSIONES, ...o,
})

test('exacto normalizado (mayúsculas y tildes) hasta la versión', async () => {
  const ids = await emparejarVehiculo({ marca: 'TESLA', modelo: 'model 3', combustible: 'Eléctrico', version: 'Long Range' }, cat())
  assert.deepEqual(ids, { marcaId: '731', modeloId: '8689', motorId: 'Electric', codigoVehiculo: '111' })
})

test('ambiguo → null: dos marcas con el mismo nombre normalizado no se eligen', async () => {
  const ids = await emparejarVehiculo({ marca: 'Seat', modelo: 'Ibiza' }, cat())
  assert.deepEqual(ids, { marcaId: null, modeloId: null, motorId: null, codigoVehiculo: null })
})

test('parecido no es exacto: «Model» no es «Model 3»; se queda en la marca', async () => {
  const ids = await emparejarVehiculo({ marca: 'Tesla', modelo: 'Model' }, cat())
  assert.deepEqual(ids, { marcaId: '731', modeloId: null, motorId: null, codigoVehiculo: null })
})

test('combustible: traduce solo con candidata única; «Híbrido» no se confunde con el enchufable', () => {
  assert.equal(emparejarCombustible(MOTORES, 'Gasolina'), 'Gasoline')
  assert.equal(emparejarCombustible(MOTORES, 'DIESEL'), 'Diesel')
  assert.equal(emparejarCombustible(MOTORES, 'Híbrido'), 'Hybrid')
  assert.equal(emparejarCombustible(MOTORES, 'Gas natural'), null)
  assert.equal(emparejarCombustible(MOTORES, null), null)
  // Dos candidatas distintas para el mismo texto → null.
  assert.equal(emparejarCombustible([{ id: 'A', nombre: 'Gasolina' }, { id: 'B', nombre: 'GASOLINA' }], 'gasolina'), null)
  // Por nombre da una y, traducido, otra distinta: tampoco se elige.
  assert.equal(emparejarCombustible([{ id: 'A', nombre: 'Gasolina' }, { id: 'Gasoline', nombre: 'Otro' }], 'gasolina'), null)
})

test('versión duplicada en el catálogo → sin codigoVehiculo; sin combustible no se pide versión', async () => {
  const dup = await emparejarVehiculo({ marca: 'Tesla', modelo: 'Model 3', combustible: 'Eléctrico', version: 'Performance' }, cat())
  assert.equal(dup.motorId, 'Electric')
  assert.equal(dup.codigoVehiculo, null)
  let pidioVersiones = false
  const sin = await emparejarVehiculo({ marca: 'Tesla', modelo: 'Model 3', version: 'Long Range' }, cat({ versiones: async () => { pidioVersiones = true; return VERSIONES } }))
  assert.equal(sin.motorId, null)
  assert.equal(sin.codigoVehiculo, null)
  assert.equal(pidioVersiones, false)
})

test('catálogo caído → sin ids, sin lanzar; y la oportunidad conserva los textos leídos', async () => {
  const caido = cat({ marcas: async () => { throw new Error('503') } })
  assert.deepEqual(await emparejarVehiculo({ marca: 'Tesla', modelo: 'Model 3' }, caido), { marcaId: null, modeloId: null, motorId: null, codigoVehiculo: null })
  const d = await datosVehiculoParaOportunidad('auto', { marca: 'TESLA', modelo: 'Model 3', matricula: '1234ABC' }, caido)
  assert.ok(d)
  assert.equal(d.marca, 'TESLA')
  assert.equal(d.marcaId, null)
  assert.equal(d.confirmadoAt, null)
})

test('fallo a mitad de cascada: se queda lo ya emparejado', async () => {
  const d = await datosVehiculoParaOportunidad('auto', { marca: 'Tesla', modelo: 'Model 3', combustible: 'Eléctrico' }, cat({ motores: async () => { throw new Error('boom') } }))
  assert.equal(d!.marcaId, '731')
  assert.equal(d!.modeloId, '8689')
  assert.equal(d!.motorId, null)
})

test('sin catálogo (Codeoscopic sin configurar) o ramo moto: solo texto, ids null', async () => {
  const a = await datosVehiculoParaOportunidad('auto', { marca: 'Tesla' }, null)
  assert.equal(a!.marcaId, null)
  let llamado = false
  const m = await datosVehiculoParaOportunidad('moto', { marca: 'Tesla' }, cat({ marcas: async () => { llamado = true; return MARCAS } }))
  assert.equal(m!.marcaId, null)
  assert.equal(llamado, false)
  assert.equal(await datosVehiculoParaOportunidad('auto', {}, cat()), null)
})
