// Captura JPEG y opciones de lista de un atasco (21/10/2026). Un brazo por regla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capturaParaCable, limpiarOpciones, pideCapturaAtasco, MAX_OPCIONES_ATASCO } from '../src/opciones-atasco.ts'

const png = Buffer.from('png-bytes')
const jpg = Buffer.from('jpeg-bytes')

test('captura: con atasco viaja el JPEG aunque haya datos personales, MARCADO conDatos', () => {
  assert.deepEqual(capturaParaCable({ png, jpegAtasco: jpg, hayDatosPersonales: true, maxBytes: 100 }), { base64: jpg.toString('base64'), conDatos: true })
  assert.deepEqual(capturaParaCable({ png, jpegAtasco: jpg, hayDatosPersonales: false, maxBytes: 100 }), { base64: jpg.toString('base64'), conDatos: false })
})

test('captura: sin atasco y con datos personales NO viaja (una imagen no se redacta)', () => {
  assert.equal(capturaParaCable({ png, jpegAtasco: null, hayDatosPersonales: true, maxBytes: 100 }), null)
})

test('captura: sin atasco ni datos, el PNG de siempre; por encima del tope, nada', () => {
  assert.deepEqual(capturaParaCable({ png, jpegAtasco: null, hayDatosPersonales: false, maxBytes: 100 }), { base64: png.toString('base64'), conDatos: false })
  assert.equal(capturaParaCable({ png, jpegAtasco: jpg, hayDatosPersonales: false, maxBytes: 3 }), null)
})

test('pideCapturaAtasco: solo atasco o hueco de mapa', () => {
  assert.equal(pideCapturaAtasco({ hayAtasco: false, huecoMapa: false }), false)
  assert.equal(pideCapturaAtasco({ hayAtasco: true, huecoMapa: false }), true)
  assert.equal(pideCapturaAtasco({ hayAtasco: false, huecoMapa: true }), true)
})

test('limpiarOpciones: colapsa espacios, quita vacíos y repetidas, redacta y pone tope', () => {
  assert.deepEqual(limpiarOpciones(['  SEVILLA\n ', 'SEVILLA', '', null, 'DOS  HERMANAS']), ['SEVILLA', 'DOS HERMANAS'])
  assert.deepEqual(limpiarOpciones(['PEPE PÉREZ', 'UTRERA'], (t) => t.replace('PEPE PÉREZ', '[dato]')), ['[dato]', 'UTRERA'])
  assert.equal(limpiarOpciones(Array.from({ length: 80 }, (_, i) => `P${i}`)).length, MAX_OPCIONES_ATASCO)
})
