import { test } from 'node:test'
import assert from 'node:assert/strict'

import { numeroYResto, validarAltaInmueble } from './alta-inmueble.ts'
import { aplicarLecturaCp, estadoDireccion, normalizarCp } from './direccion-cp.ts'

const base = {
  alias: 'Socorro', uso: 'vivienda', cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla',
  direccion: 'CL SOCORRO 24, 2º B', viaOficial: { tipo: 'CL', nombre: 'SOCORRO' },
}

test('CP primero: sin CP válido no hay dirección aunque haya calle', () => {
  for (const cp of ['', '4100', 'abcde', undefined]) {
    assert.deepEqual(validarAltaInmueble({ ...base, cp }), { ok: false, campo: 'cp' })
  }
  assert.deepEqual(validarAltaInmueble({ ...base, provincia: '' }), { ok: false, campo: 'provincia' })
  assert.deepEqual(validarAltaInmueble({ ...base, municipio: '' }), { ok: false, campo: 'municipio' })
})

test('calle del callejero: via, número y resto; texto libre queda por validar', () => {
  const ok = validarAltaInmueble(base)
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(ok.datos.via, 'CL SOCORRO')
    assert.equal(ok.datos.numero, '24')
    assert.equal(ok.datos.resto, '2º B')
    assert.equal(ok.datos.porValidar, false)
    assert.match(ok.datos.direccionNormalizada, /41003 Sevilla \(Sevilla\)$/)
  }
  const libre = validarAltaInmueble({ ...base, viaOficial: null })
  assert.ok(libre.ok)
  if (libre.ok) {
    assert.equal(libre.datos.via, null)
    assert.equal(libre.datos.numero, null)
    assert.equal(libre.datos.porValidar, true)
  }
  const caducada = validarAltaInmueble({ ...base, direccion: 'AV OTRA 3' })
  assert.ok(caducada.ok && caducada.datos.porValidar && caducada.datos.via === null)
})

test('null = no lo sé: enComunidad ausente es null, nunca false; refcat inválida se rechaza', () => {
  const r = validarAltaInmueble(base)
  assert.ok(r.ok && r.datos.enComunidad === null && r.datos.referenciaCatastral === null)
  assert.deepEqual(validarAltaInmueble({ ...base, referenciaCatastral: 'corta' }), { ok: false, campo: 'referenciaCatastral' })
  assert.deepEqual(validarAltaInmueble({ ...base, uso: 'castillo' }), { ok: false, campo: 'uso' })
})

test('numeroYResto', () => {
  assert.deepEqual(numeroYResto(' 12'), { numero: '12', resto: null })
  assert.deepEqual(numeroYResto(', 12B 3º'), { numero: '12B', resto: '3º' })
  assert.deepEqual(numeroYResto(' s/n'), { numero: null, resto: 's/n' })
})

test('formulario: sin CP no se busca calle; el CP da provincia y municipio único; lista = desplegable', () => {
  const vacio = { estado: 'vacio' } as const
  assert.equal(estadoDireccion({ cp: '', provincia: '', municipio: '', lectura: vacio }).puedeBuscarCalle, false)
  assert.equal(estadoDireccion({ cp: '41003', provincia: 'Sevilla', municipio: '', lectura: vacio }).puedeBuscarCalle, false)
  assert.equal(estadoDireccion({ cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla', lectura: vacio }).puedeBuscarCalle, true)
  assert.equal(normalizarCp('4a1-003999'), '41003')
  assert.deepEqual(aplicarLecturaCp({ municipios: ['Sevilla'], provincia: 'Sevilla' }, { provincia: '', municipio: '' }), { provincia: 'Sevilla', municipio: 'Sevilla' })
  assert.deepEqual(aplicarLecturaCp({ municipios: ['A', 'B'], provincia: 'X' }, { provincia: '', municipio: 'Z' }), { provincia: 'X', municipio: '' })
  const lista = estadoDireccion({ cp: '41003', provincia: 'X', municipio: '', lectura: { estado: 'ok', municipios: ['A', 'B'], provincia: 'X' } })
  assert.equal(lista.eligeMunicipioDeLista, true)
  assert.deepEqual(aplicarLecturaCp({ municipios: null, provincia: null }, { provincia: 'P', municipio: 'M' }), { provincia: 'P', municipio: 'M' })
})

test('edificio (27/10/2026): nace con N unidades de nombres editables y su criterio de reparto', () => {
  const ed = { ...base, alias: 'Busto Tavera 22', uso: 'edificio', referenciaCatastral: '5731022TG3453B0001AK' }
  const r = validarAltaInmueble({ ...ed, unidades: [' Bajo A ', '1º A', '1º B'], repartoCriterio: 'm2' })
  assert.ok(r.ok)
  assert.deepEqual(r.datos.unidades, ['Bajo A', '1º A', '1º B'])
  assert.equal(r.datos.repartoCriterio, 'm2')
  assert.equal(r.datos.referenciaCatastral, '5731022TG3453B0001AK')
  // Sin unidades ni criterio: un edificio vacío (se añaden luego) y sin reparto elegido (null, no «m²» por defecto).
  const vacio = validarAltaInmueble(ed)
  assert.ok(vacio.ok)
  assert.deepEqual(vacio.datos.unidades, [])
  assert.equal(vacio.datos.repartoCriterio, null)
})

test('edificio: unidades solo en un edificio, sin nombres vacíos ni repetidos, y con tope', () => {
  const ed = { ...base, uso: 'edificio' }
  assert.deepEqual(validarAltaInmueble({ ...base, unidades: ['Piso 1'] }), { ok: false, campo: 'unidades' })
  assert.deepEqual(validarAltaInmueble({ ...ed, unidades: ['Piso 1', ' '] }), { ok: false, campo: 'unidades' })
  assert.deepEqual(validarAltaInmueble({ ...ed, unidades: ['Piso 1', 'piso 1'] }), { ok: false, campo: 'unidades' })
  assert.deepEqual(validarAltaInmueble({ ...ed, unidades: 'Piso 1' }), { ok: false, campo: 'unidades' })
  assert.deepEqual(validarAltaInmueble({ ...ed, unidades: Array.from({ length: 201 }, (_, k) => `P${k}`) }), { ok: false, campo: 'unidades' })
  assert.deepEqual(validarAltaInmueble({ ...ed, repartoCriterio: 'a_partes_iguales' }), { ok: false, campo: 'repartoCriterio' })
  assert.deepEqual(validarAltaInmueble({ ...base, repartoCriterio: 'm2' }), { ok: false, campo: 'repartoCriterio' })
})
