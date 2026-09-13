import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizarRecordatorio,
  siguienteOcurrencia,
  SUGERENCIAS_RECORDATORIO,
  TITULO_MAX,
} from './recordatorio-libre.ts'

test('normalizarRecordatorio acepta un recordatorio libre válido', () => {
  const r = normalizarRecordatorio({ titulo: 'Renovar carnet de pesca', fechaEvento: '2027-03-15' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.datos.tipo, 'libre')
  assert.equal(r.datos.titulo, 'Renovar carnet de pesca')
  assert.equal(r.datos.fechaEvento.toISOString(), '2027-03-15T00:00:00.000Z')
  assert.equal(r.datos.repiteCadaMeses, null)
})

test('normalizarRecordatorio recorta espacios y rechaza título vacío', () => {
  const conEspacios = normalizarRecordatorio({ titulo: '  ITV  ', fechaEvento: '2027-01-01' })
  assert.equal(conEspacios.ok, true)
  if (conEspacios.ok) assert.equal(conEspacios.datos.titulo, 'ITV')

  const vacio = normalizarRecordatorio({ titulo: '   ', fechaEvento: '2027-01-01' })
  assert.deepEqual(vacio, { ok: false, error: 'titulo_invalido' })
})

test('normalizarRecordatorio rechaza un título por encima del tope', () => {
  const r = normalizarRecordatorio({ titulo: 'x'.repeat(TITULO_MAX + 1), fechaEvento: '2027-01-01' })
  assert.deepEqual(r, { ok: false, error: 'titulo_invalido' })
})

test('normalizarRecordatorio rechaza fecha ausente o mal formada', () => {
  assert.deepEqual(normalizarRecordatorio({ titulo: 'ITV' }), { ok: false, error: 'fecha_invalida' })
  assert.deepEqual(normalizarRecordatorio({ titulo: 'ITV', fechaEvento: 'no es una fecha' }), {
    ok: false,
    error: 'fecha_invalida',
  })
})

test('normalizarRecordatorio rechaza un 30 de febrero en vez de normalizarlo al 2 de marzo', () => {
  // `new Date('2027-02-30T00:00:00Z')` no lanza: JS lo normaliza en silencio.
  // Un `<input type="date">` nunca deja elegir esa fecha, pero la API también
  // se puede llamar a pelo, así que este cepo es el que de verdad protege.
  const r = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-02-30' })
  assert.deepEqual(r, { ok: false, error: 'fecha_invalida' })
})

test('normalizarRecordatorio rechaza un tipo que no está en el catálogo', () => {
  const r = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', tipo: 'inventado' })
  assert.deepEqual(r, { ok: false, error: 'tipo_invalido' })
})

test('normalizarRecordatorio valida el rango de repiteCadaMeses', () => {
  const cero = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', repiteCadaMeses: 0 })
  assert.deepEqual(cero, { ok: false, error: 'repeticion_invalida' })

  const grande = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', repiteCadaMeses: 121 })
  assert.deepEqual(grande, { ok: false, error: 'repeticion_invalida' })

  const valido = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', repiteCadaMeses: 12 })
  assert.equal(valido.ok, true)
  if (valido.ok) assert.equal(valido.datos.repiteCadaMeses, 12)
})

test('normalizarRecordatorio no exige que la fecha sea futura', () => {
  const r = normalizarRecordatorio({ titulo: 'ITV pasada', fechaEvento: '2020-01-01' })
  assert.equal(r.ok, true)
})

test('siguienteOcurrencia suma meses conservando el día', () => {
  const base = new Date('2027-03-15T00:00:00Z')
  assert.equal(siguienteOcurrencia(base, 12).toISOString(), '2028-03-15T00:00:00.000Z')
})

test('siguienteOcurrencia ajusta al último día cuando el mes destino es más corto', () => {
  // 31 de enero + 1 mes no puede caer en un 31 de febrero inexistente.
  const base = new Date('2027-01-31T00:00:00Z')
  assert.equal(siguienteOcurrencia(base, 1).toISOString(), '2027-02-28T00:00:00.000Z')
})

test('normalizarRecordatorio acepta que se asigne a una póliza de la cartera', () => {
  const r = normalizarRecordatorio({ titulo: 'ITV del Ibiza', fechaEvento: '2027-01-01', polizaId: 'p1' })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.datos.polizaId, 'p1')
    assert.equal(r.datos.polizaDeclaradaId, null)
  }
})

test('normalizarRecordatorio acepta que se asigne a una póliza declarada', () => {
  const r = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', polizaDeclaradaId: 'd1' })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.datos.polizaId, null)
    assert.equal(r.datos.polizaDeclaradaId, 'd1')
  }
})

test('normalizarRecordatorio rechaza los dos ids de póliza a la vez', () => {
  const r = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', polizaId: 'p1', polizaDeclaradaId: 'd1' })
  assert.deepEqual(r, { ok: false, error: 'poliza_ambigua' })
})

test('normalizarRecordatorio sin póliza deja los dos ids a null', () => {
  const r = normalizarRecordatorio({ titulo: 'Algo', fechaEvento: '2027-01-01' })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.datos.polizaId, null)
    assert.equal(r.datos.polizaDeclaradaId, null)
  }
})

test('normalizarRecordatorio rechaza un tipo que no es texto en vez de colarlo como libre', () => {
  // Hallazgo de code-review (Graphify): un `tipo` que SÍ viaja pero no es una
  // cadena (número, booleano…) caía a `'libre'` en silencio.
  assert.deepEqual(normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', tipo: 5 }), {
    ok: false,
    error: 'tipo_invalido',
  })
  assert.deepEqual(normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', tipo: true }), {
    ok: false,
    error: 'tipo_invalido',
  })
})

test('normalizarRecordatorio rechaza un repiteCadaMeses booleano', () => {
  // Hallazgo de code-review (Graphify): `Number(true) === 1` colaba un
  // booleano como «se repite cada mes».
  const r = normalizarRecordatorio({ titulo: 'ITV', fechaEvento: '2027-01-01', repiteCadaMeses: true })
  assert.deepEqual(r, { ok: false, error: 'repeticion_invalida' })
})

test('SUGERENCIAS_RECORDATORIO usa solo tipos del enum de BD', () => {
  const tiposValidos = new Set(['itv', 'carnet', 'mantenimiento', 'revision_gas', 'libre'])
  for (const s of SUGERENCIAS_RECORDATORIO) assert.ok(tiposValidos.has(s.tipo), `tipo desconocido: ${s.tipo}`)
})
