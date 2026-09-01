import test from 'node:test'
import assert from 'node:assert/strict'
import { objetoAsegurado, pareceMatricula } from './objeto.ts'

// ── Vehículos ───────────────────────────────────────────────────────────────

test('auto: marca y modelo como titular, matrícula como detalle', () => {
  const o = objetoAsegurado({ tipo: 'auto', datos: { marca: 'HYUNDAI', modelo: 'KONA', matricula: '1234ABC' } })
  assert.equal(o.estado, 'conocido')
  assert.equal(o.titulo, 'HYUNDAI KONA')
  assert.equal(o.detalle, '1234ABC')
  assert.equal(o.nota, null)
})

test('auto: sin matrícula lo dice, no lo calla', () => {
  const o = objetoAsegurado({ tipo: 'auto', datos: { marca: 'SEAT', modelo: 'IBIZA' } })
  assert.equal(o.titulo, 'SEAT IBIZA')
  assert.equal(o.detalle, null)
  assert.match(o.nota ?? '', /matrícula/i)
})

test('auto: `vehiculo` trae la matrícula, no una descripción — no se pinta como modelo', () => {
  const o = objetoAsegurado({ tipo: 'auto', datos: { vehiculo: '5979GWV' } })
  assert.equal(o.estado, 'conocido')
  assert.equal(o.titulo, '5979GWV')
  assert.match(o.nota ?? '', /marca ni modelo/i)
})

test('auto: si `vehiculo` NO parece matrícula se respeta como descripción', () => {
  const o = objetoAsegurado({ tipo: 'auto', datos: { vehiculo: 'Furgoneta de reparto' } })
  assert.equal(o.titulo, 'Furgoneta de reparto')
})

test('auto sin ningún dato es «no informado», nunca «no tiene»', () => {
  const o = objetoAsegurado({ tipo: 'auto', datos: { _estado_legacy_pre_loo695: 'activa' } })
  assert.equal(o.estado, 'no_informado')
  assert.equal(o.titulo, null)
  assert.match(o.nota ?? '', /no consta/i)
})

test('los valores de cajón se tratan como ausencia, no como dato', () => {
  const o = objetoAsegurado({ tipo: 'auto', datos: { marca: 'DESCONOCIDA', modelo: 'N/A', matricula: '  ' } })
  assert.equal(o.estado, 'no_informado')
})

test('pareceMatricula acepta formatos reales y rechaza texto', () => {
  assert.equal(pareceMatricula('5979GWV'), true)
  assert.equal(pareceMatricula('CA1506AV'), true)
  assert.equal(pareceMatricula('1234 ABC'), true)
  assert.equal(pareceMatricula('Furgoneta'), false)
  assert.equal(pareceMatricula('KONA'), false)
})

// ── Inmuebles ───────────────────────────────────────────────────────────────

test('hogar: localidad y CP describen el riesgo cuando la calle viene cifrada', () => {
  const o = objetoAsegurado({
    tipo: 'hogar',
    datos: { localidad: 'SEVILLA', cp: '41003', direccion: 'v1:FUM...:...:...', metrosCuadrados: 120 },
  })
  assert.equal(o.estado, 'conocido')
  assert.equal(o.titulo, 'SEVILLA · CP 41003')
  assert.equal(o.detalle, '120 m²')
  assert.match(o.nota ?? '', /cifrada/i)
})

test('hogar: la dirección cifrada NUNCA se pinta en claro', () => {
  const o = objetoAsegurado({ tipo: 'hogar', datos: { direccion: 'v1:abc:def:ghi' } })
  assert.equal(o.estado, 'cifrado')
  assert.equal(o.titulo, null)
  assert.equal(o.detalle, null)
  assert.match(o.nota ?? '', /cifrada/i)
})

test('hogar sin nada es «no informado», distinto de «cifrado»', () => {
  const o = objetoAsegurado({ tipo: 'hogar', datos: {} })
  assert.equal(o.estado, 'no_informado')
})

// ── Responsabilidad civil y comercio ────────────────────────────────────────

test('RC: las modalidades contratadas son lo que la identifica', () => {
  const o = objetoAsegurado({
    tipo: 'responsabilidad_civil',
    coberturas: ['Básica', 'Locativa', 'Accidentes de trabajo'],
  })
  assert.equal(o.estado, 'conocido')
  assert.equal(o.titulo, 'Básica, Locativa, Accidentes de trabajo')
})

test('RC: con más de tres coberturas se resume el resto sin ocultarlo', () => {
  const o = objetoAsegurado({
    tipo: 'responsabilidad_civil',
    coberturas: ['Básica', 'Locativa', 'Patronal', 'Explotación', 'Productos'],
  })
  assert.equal(o.titulo, 'Básica, Locativa, Patronal')
  assert.equal(o.detalle, '+2 coberturas')
})

test('RC sin coberturas cargadas es «no informado»', () => {
  assert.equal(objetoAsegurado({ tipo: 'responsabilidad_civil', coberturas: [] }).estado, 'no_informado')
})

test('comercio: manda la actividad', () => {
  const o = objetoAsegurado({ tipo: 'comercio', datos: { actividad: 'Bar-cafetería', localidad: 'DOS HERMANAS' } })
  assert.equal(o.titulo, 'Bar-cafetería')
  assert.equal(o.detalle, 'DOS HERMANAS')
})

// ── Seguros de personas ─────────────────────────────────────────────────────

test('vida/salud/decesos: ausencia DEFINITIVA, no «pendiente»', () => {
  for (const tipo of ['vida', 'salud', 'decesos', 'accidentes']) {
    const o = objetoAsegurado({ tipo })
    assert.equal(o.estado, 'sin_objeto', tipo)
    assert.equal(o.titulo, 'El propio asegurado')
  }
})

// ── Ramos sin plantilla ─────────────────────────────────────────────────────

test('comunidad: viviendas y bloques describen el riesgo', () => {
  const o = objetoAsegurado({ tipo: 'otros', datos: { nViviendas: 13, nBloques: 2 } })
  assert.equal(o.estado, 'conocido')
  assert.equal(o.titulo, '13 viviendas · 2 bloques')
})

test('un tipo desconocido no revienta ni inventa: cae a «no informado»', () => {
  const o = objetoAsegurado({ tipo: 'ramo_que_no_existe', datos: null, coberturas: null })
  assert.equal(o.estado, 'no_informado')
})
