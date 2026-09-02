// Guardián del lector de relaciones entre clientes de la correduría en
// plataforma (`apps/plataforma/lib/relaciones-asegura.ts`). Puro: sin red.
//
// Lo que fija: `relaciones: null` = «no se pudo consultar» y `[]` = «se miró y
// no hay ninguna anotada» no se confunden; los dos flags de autorización son
// direccionales y se leen tal cual; `polizasVivas: null` se conserva (no es 0);
// y los estados de escritura del puerto (ok / conflicto / invalido /
// no_encontrado / sin_configurar / error) llegan cada uno con su motivo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarRelaciones,
  leerRelacion,
  leerRelaciones,
  textoMotivoRelaciones,
} from '../apps/plataforma/lib/relaciones-asegura.ts'

const CONYUGE = {
  idIda: 'r1', idVuelta: 'r2', relacionadoId: 'c2', tipo: 'Cónyuge/Pareja de Hecho',
  autorizaVer: true, puedeVer: false, observaciones: null,
  nombre: 'María Antonia Gutierrez Alcala', tipoCliente: 'cliente', polizasVivas: 3,
}

test('🚨 sin bloque de relaciones → null; con lista vacía → [] (son cosas distintas)', () => {
  assert.equal(leerRelaciones(undefined), null)
  assert.equal(leerRelaciones(null), null)
  assert.equal(leerRelaciones('no'), null, 'una lista que no es lista degrada a null, no a []')
  assert.equal(leerRelaciones({ relaciones: [] }), null)
  assert.deepEqual(leerRelaciones([]), [], 'lista vacía SÍ es «sin relaciones anotadas»')
})

test('los flags de autorización son direccionales y se leen tal cual', () => {
  const r = leerRelacion(CONYUGE)
  assert.ok(r)
  assert.equal(r.autorizaVer, true, 'la ficha autoriza a María Antonia')
  assert.equal(r.puedeVer, false, 'María Antonia NO ha autorizado a la ficha')
  assert.equal(r.tipo, 'Cónyuge/Pareja de Hecho')
  assert.equal(r.nombre, 'María Antonia Gutierrez Alcala')
  assert.equal(r.polizasVivas, 3)
  // Sin booleanos de verdad no hay relación legible: un `'true'` de texto se salta.
  assert.equal(leerRelacion({ ...CONYUGE, autorizaVer: 'true' }), null)
  assert.equal(leerRelacion({ ...CONYUGE, puedeVer: undefined }), null)
})

test('🚨 polizasVivas null se conserva como null, jamás como 0', () => {
  const r = leerRelacion({ ...CONYUGE, polizasVivas: null })
  assert.equal(r?.polizasVivas, null)
  const sin = leerRelacion({ ...CONYUGE, polizasVivas: undefined })
  assert.equal(sin?.polizasVivas, null, 'asegura sin contar ≠ cero pólizas')
  assert.equal(leerRelacion({ ...CONYUGE, polizasVivas: 0 })?.polizasVivas, 0, 'cero contado SÍ es un dato')
})

test('una fila rara se salta sin tumbar el bloque; idIda/idVuelta pueden faltar', () => {
  const l = leerRelaciones([CONYUGE, 'basura', { relacionadoId: 'x' }, { ...CONYUGE, relacionadoId: 'c3', idIda: null, nombre: undefined }])
  assert.ok(l)
  assert.equal(l.length, 2)
  assert.equal(l[1].idIda, null, 'el volcado a veces solo trajo la inversa')
  assert.equal(l[1].nombre, 'sin nombre')
})

test('GET/escrituras: ok / sin_configurar / no_encontrado / conflicto / invalido / error no se confunden', () => {
  const ok = interpretarRelaciones(200, { estado: 'ok', relaciones: [CONYUGE] })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') assert.equal(ok.relaciones.length, 1)

  const vacio = interpretarRelaciones(200, { estado: 'ok', relaciones: [] })
  assert.deepEqual(vacio, { estado: 'ok', relaciones: [] })

  // Un `ok` sin lista NO se lee como «sin relaciones».
  assert.deepEqual(interpretarRelaciones(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })

  assert.deepEqual(interpretarRelaciones(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarRelaciones(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarRelaciones(404, { estado: 'no_encontrado', motivo: 'no existe c9' }), { estado: 'no_encontrado', motivo: 'no existe c9' })
  assert.deepEqual(interpretarRelaciones(409, { estado: 'conflicto', motivo: 'ya están relacionados' }), { estado: 'conflicto', motivo: 'ya están relacionados' })
  assert.deepEqual(interpretarRelaciones(422, { estado: 'invalido', motivo: 'tipo desconocido' }), { estado: 'invalido', motivo: 'tipo desconocido' })
  assert.deepEqual(interpretarRelaciones(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarRelaciones(500, { estado: 'error', causa: 'password authentication failed' }), { estado: 'error', motivo: 'password authentication failed' })
  assert.deepEqual(interpretarRelaciones(502, { estado: 'error', motivo: 'red' }), { estado: 'error', motivo: 'red' })
  assert.deepEqual(interpretarRelaciones(500, null), { estado: 'error', motivo: 'HTTP 500' })
})

test('los motivos técnicos se traducen; una frase se deja tal cual', () => {
  assert.match(textoMotivoRelaciones('red'), /asegura/)
  assert.equal(textoMotivoRelaciones('ya están relacionados'), 'ya están relacionados')
})
