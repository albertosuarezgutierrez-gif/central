import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarSolicitud } from './solicitud-datos.ts'

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
