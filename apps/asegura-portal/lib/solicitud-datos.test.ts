import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarDocSubido, interpretarSolicitud } from './solicitud-datos.ts'

test('muerta, completada y ok se distinguen; lo raro es error (no «muerta»)', () => {
  assert.deepEqual(interpretarSolicitud(200, { estado: 'muerta' }), { estado: 'muerta' })
  assert.deepEqual(interpretarSolicitud(200, { estado: 'completada' }), { estado: 'completada' })
  const ok = interpretarSolicitud(200, { estado: 'ok', ramo: 'moto', campos: [{ clave: 'matricula', etiqueta: 'Matrícula', tipo: 'texto', obligatorio: true }, 3] })
  assert.equal(ok.estado, 'ok')
  assert.equal(ok.estado === 'ok' ? ok.campos.length : 0, 1)
  assert.deepEqual(interpretarSolicitud(503, null), { estado: 'error' })
  assert.deepEqual(interpretarSolicitud(200, { estado: 'ok', ramo: 'barco', campos: [] }), { estado: 'error' })
})

test('la página del enlace no pide ni pinta nada de la ficha del cliente', () => {
  const page = readFileSync(new URL('../app/datos/[token]/page.tsx', import.meta.url), 'utf8')
  for (const prohibido of ['nombre', 'dni', 'direccion', 'telefono', 'email']) {
    assert.doesNotMatch(page, new RegExp(`\\.${prohibido}\\b`), `la página no lee .${prohibido}`)
  }
})

test('la subida de un documento: valores propuestos y fallos con motivo, nunca «ok» vacío', () => {
  const ok = interpretarDocSubido(200, { ok: true, etiqueta: 'Carné de conducir', valores: { fechaCarnet: '2015-03-15', tieneSeguro: true, raro: { x: 1 } }, aviso: null })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') {
    assert.equal(ok.valores.fechaCarnet, '2015-03-15')
    assert.equal(ok.valores.tieneSeguro, true)
    assert.equal('raro' in ok.valores, false)
  }
  assert.equal(interpretarDocSubido(200, { ok: false }).estado, 'fallo')
  const tope = interpretarDocSubido(409, { motivo: 'Como máximo 6 documentos por enlace.' })
  assert.equal(tope.estado === 'fallo' && tope.texto, 'Como máximo 6 documentos por enlace.')
  assert.equal(interpretarDocSubido(502, null).estado, 'fallo')
})
