// Cepos de la CONSULTA DE VEHÍCULO POR MATRÍCULA con el bot (04/11/2026). `node --test`. Matrículas y vehículos FICTICIOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CACHE_VEHICULO_MS,
  cacheVigente,
  claveCacheMatricula,
  enmascararMatriculaConsulta,
  leerPeticionVehiculo,
  leerResultadoVehiculoWorker,
  normalizarMatriculaConsulta,
  resultadoDeFila,
  riesgoVehiculo,
  vehiculoActivo,
  vehiculoContieneMatricula,
} from './tarificador-vehiculo-reglas.ts'
import { modoParaWorker, modosReclamables } from './tarificador-explorador-reglas.ts'

const ID = '00000000-0000-4000-8000-000000000001'
const SECRETO = 'EJEMPLO_REDACTADO'
const AHORA = new Date('2026-11-04T10:00:00Z')

test('normalizarMatriculaConsulta: espacios/guiones/minúsculas fuera; no española o rara → null', () => {
  assert.equal(normalizarMatriculaConsulta(' 0000-bbb '), '0000BBB')
  assert.equal(normalizarMatriculaConsulta('0000 BCD'), '0000BCD')
  assert.equal(normalizarMatriculaConsulta('0000AAA'), null) // vocales: no es una matrícula actual
  assert.equal(normalizarMatriculaConsulta('hola'), null)
  assert.equal(normalizarMatriculaConsulta(1234), null)
  assert.equal(normalizarMatriculaConsulta('0'.repeat(30)), null)
})

test('enmascararMatriculaConsulta: solo las 3 últimas', () => {
  assert.equal(enmascararMatriculaConsulta('0000BCD'), '****BCD')
  assert.ok(!enmascararMatriculaConsulta('0000BCD').includes('0000'))
})

test('claveCacheMatricula: HMAC estable, depende del secreto, nunca contiene la matrícula; secreto corto → lanza', () => {
  const a = claveCacheMatricula('0000BBB', SECRETO)
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.equal(a, claveCacheMatricula('0000BBB', SECRETO))
  assert.notEqual(a, claveCacheMatricula('0000BBC', SECRETO))
  assert.notEqual(a, claveCacheMatricula('0000BBB', SECRETO + 'x'))
  assert.ok(!a.toUpperCase().includes('0000BBB'))
  assert.throws(() => claveCacheMatricula('0000BBB', 'corto'))
})

test('cacheVigente: < 24 h sí; 24 h, futura o inválida no', () => {
  assert.equal(cacheVigente(new Date(AHORA.getTime() - 60_000), AHORA), true)
  assert.equal(cacheVigente(new Date(AHORA.getTime() - CACHE_VEHICULO_MS + 1), AHORA), true)
  assert.equal(cacheVigente(new Date(AHORA.getTime() - CACHE_VEHICULO_MS), AHORA), false)
  assert.equal(cacheVigente(new Date(AHORA.getTime() + 3_600_000), AHORA), false)
  assert.equal(cacheVigente(new Date('x'), AHORA), false)
  assert.equal(cacheVigente(null, AHORA), false)
})

test('leerPeticionVehiculo: matrícula válida y ramo auto; el error no repite la matrícula', () => {
  assert.deepEqual(leerPeticionVehiculo({ matricula: '0000 bbb' }), { ok: true, matricula: '0000BBB' })
  assert.deepEqual(leerPeticionVehiculo({ matricula: '0000BBB', ramo: 'auto' }), { ok: true, matricula: '0000BBB' })
  const r = leerPeticionVehiculo({ matricula: '9999ZZQ' })
  assert.equal(r.ok, false)
  assert.ok(!JSON.stringify(r).includes('9999'))
  assert.equal(leerPeticionVehiculo({ matricula: '0000BBB', ramo: 'moto' }).ok, false)
  assert.equal(leerPeticionVehiculo(null).ok, false)
})

test('riesgoVehiculo: SOLO la matrícula (el CHECK de la BD exige esa forma)', () => {
  assert.deepEqual(Object.keys(riesgoVehiculo('0000BBB')), ['matricula'])
})

test('leerResultadoVehiculoWorker: ok con marca+modelo; sin_resultado sin vehículo; formas raras → 400', () => {
  const ok = leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'ok', botVersion: '0.3.48', vehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO X', version: '1.0 90 CV', fechaMatriculacion: '2019-03-05', combustible: 'Gasolina' } }, AHORA)
  assert.ok(ok.ok)
  if (ok.ok) assert.deepEqual(ok.r, { estado: 'ok', vehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO X', version: '1.0 90 CV', fechaMatriculacion: '2019-03-05', combustible: 'Gasolina' } })
  const sin = leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'sin_resultado' }, AHORA)
  assert.ok(sin.ok && sin.r.estado === 'sin_resultado')
  // `ok` sin modelo: no se inventa un vehículo a medias.
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'ok', vehiculo: { marca: 'M' } }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'sin_resultado', vehiculo: { marca: 'M', modelo: 'X' } }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'ok', vehiculo: { marca: 'M', modelo: 'X', bastidor: 'Z' } }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'ok', vehiculo: { marca: 'M', modelo: 'X', fechaMatriculacion: '2030-01-01' } }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'ok', vehiculo: { marca: 'M', modelo: 'X', fechaMatriculacion: '2019-02-30' } }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'ok', vehiculo: { marca: 'alguien@correo.es', modelo: 'X' } }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'ok', estado: 'ok' }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: ID, resultado: 'vehiculo', estado: 'ok', vehiculo: { marca: 'M', modelo: 'X' }, ofertas: [] }, AHORA).ok, false)
  assert.equal(leerResultadoVehiculoWorker({ trabajoId: 'x', resultado: 'vehiculo', estado: 'sin_resultado' }, AHORA).ok, false)
})

test('vehiculoContieneMatricula: un texto con la matrícula no es catálogo', () => {
  assert.equal(vehiculoContieneMatricula({ marca: 'M', modelo: 'X 0000-BBB', version: null, fechaMatriculacion: null, combustible: null }, '0000BBB'), true)
  assert.equal(vehiculoContieneMatricula({ marca: 'M', modelo: 'X', version: '1.0', fechaMatriculacion: null, combustible: null }, '0000BBB'), false)
})

test('resultadoDeFila: ok / sin_resultado / incoherente → null', () => {
  assert.deepEqual(resultadoDeFila({ estado: 'ok', marca: 'M', modelo: 'X', version: null, fecha_matriculacion: new Date('2019-03-05T00:00:00Z'), combustible: null }), { estado: 'ok', vehiculo: { marca: 'M', modelo: 'X', version: null, fechaMatriculacion: '2019-03-05', combustible: null } })
  assert.deepEqual(resultadoDeFila({ estado: 'sin_resultado', marca: null, modelo: null, version: null, fecha_matriculacion: null, combustible: null }), { estado: 'sin_resultado' })
  assert.equal(resultadoDeFila({ estado: 'ok', marca: null, modelo: 'X', version: null, fecha_matriculacion: null, combustible: null }), null)
})

test('interruptor y modos: `vehiculo` solo con TARIFICADOR_VEHICULO_ACTIVO=1 y solo a un worker que lo declara', () => {
  assert.equal(vehiculoActivo({}), false)
  assert.equal(vehiculoActivo({ TARIFICADOR_VEHICULO_ACTIVO: 'true' }), false)
  assert.equal(vehiculoActivo({ TARIFICADOR_VEHICULO_ACTIVO: '1' }), true)
  assert.ok(!modosReclamables({}).includes('vehiculo'))
  assert.ok(modosReclamables({ TARIFICADOR_VEHICULO_ACTIVO: '1' }).includes('vehiculo'))
  assert.equal(modoParaWorker('vehiculo', ['tarificar', 'emision', 'pilotaje']), null)
  assert.equal(modoParaWorker('vehiculo', ['tarificar', 'vehiculo']), 'vehiculo')
})

test('cableado: el SQL nombra el modo y la caché; asegura es fail-closed sin él y nunca loguea la matrícula', () => {
  const sql = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '2026-11-04e_tarificador_vehiculo_matricula.sql'), 'utf8')
  assert.match(sql, /'tarificar', 'emision', 'exploracion', 'humo', 'pilotaje', 'vehiculo'/)
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/)
  assert.match(sql, /NO APLICADA/)
  assert.match(sql, /ROLLBACK/)
  for (const r of ['app/api/operador/tarificador/vehiculo/route.ts', 'app/api/operador/tarificador/vehiculo/[id]/route.ts', 'app/api/tarificador/vehiculo/resultado/route.ts']) {
    const src = readFileSync(join(import.meta.dirname, '..', r), 'utf8')
    assert.match(src, /hayVehiculoMatricula\(\)\)\) return NextResponse\.json\([^)]*vehiculo_sin_esquema[^)]*\), \{ status: 503 \}|hayVehiculoMatricula\(\)\)\) return NextResponse\.json\(\{[^}]*\}, \{ status: 503 \}\)/, r)
    assert.ok(!/console\.(log|error)\([^)]*matricula/i.test(src), `${r}: no loguea la matrícula`)
  }
  const lib = readFileSync(join(import.meta.dirname, 'tarificador-vehiculo.ts'), 'utf8')
  assert.ok(!/console\./.test(lib), 'la lib de BD no loguea nada')
  const t = readFileSync(join(import.meta.dirname, 'tarificador.ts'), 'utf8')
  assert.match(t, /deVehiculo && r\.tipo !== 'error'/)
  assert.match(t, /if \(modo === 'vehiculo'\)/)
})
