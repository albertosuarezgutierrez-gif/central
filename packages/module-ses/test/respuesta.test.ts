import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerRespuesta, clasificarCodigo } from '../src/respuesta.ts'

const soap = (codigo: string, desc = '', extra = '') =>
  `<soapenv:Envelope><soapenv:Body><ns2:comunicacionResponse><respuesta>` +
  `<codigo>${codigo}</codigo><descripcion>${desc}</descripcion></respuesta>${extra}` +
  `</ns2:comunicacionResponse></soapenv:Body></soapenv:Envelope>`

test('codigo 0 es la única pasada buena', () => {
  const r = leerRespuesta(200, soap('0', 'Ok'))
  assert.equal(r.ok, true)
  assert.equal(r.clase, 'ok')
  assert.equal(r.codigo, 0)
})

test('SES caído (5xx) es TRANSPORTE, no un problema del parte', () => {
  // El caso real del 20/08/2026: `pre-ses` devolvía 502 a todo, con credenciales válidas y sin
  // ellas. Confundirlo con un error de datos manda a reescribir un XML que estaba bien.
  const r = leerRespuesta(502, '<html>Proxy Error</html>')
  assert.equal(r.clase, 'transporte')
  assert.equal(r.codigo, null)
  assert.match(r.detalle, /502/)
})

test('401 es configuración: lo arregla una persona, no un reintento', () => {
  const r = leerRespuesta(401, '')
  assert.equal(r.clase, 'configuracion')
  assert.match(r.detalle, /contraseña del servicio web/)
})

test('10111 (formato) es culpa nuestra y no se reintenta igual', () => {
  // El código que habría devuelto CADA petición mientras el módulo usaba gzip.
  const r = leerRespuesta(200, soap('10111', 'Ha de ir comprimido (zip) y codificado en Base64.'))
  assert.equal(r.ok, false)
  assert.equal(r.clase, 'datos')
})

test('10120 (servicio web no habilitado) es configuración, no datos', () => {
  assert.equal(clasificarCodigo(10120), 'configuracion')
  assert.equal(clasificarCodigo(10103), 'configuracion')
  assert.equal(clasificarCodigo(10107), 'configuracion')
})

test('10150 es DATOS aunque hable de un máximo: trocear el lote no lo arregla', () => {
  // Es la longitud del campo `aplicacion` de la cabecera, no el tamaño del envío.
  assert.equal(clasificarCodigo(10150), 'datos')
  assert.equal(clasificarCodigo(10136), 'limite')
})

test('10999 (error no controlado) es el único código reintentable', () => {
  assert.equal(clasificarCodigo(10999), 'transporte')
})

test('un código no catalogado NO se da por bueno: sale como desconocido', () => {
  assert.equal(clasificarCodigo(99999), 'desconocido')
})

test('un 200 sin codigoRetorno legible no cuenta como pasada buena', () => {
  // Es el fallo que el CLAUDE.md llama el más caro: ponerse verde porque no se ha sabido mirar.
  const r = leerRespuesta(200, '<html>mantenimiento</html>')
  assert.equal(r.ok, false)
  assert.equal(r.clase, 'desconocido')
  assert.match(r.detalle, /sin codigoRetorno legible/)
})

test('recoge los lotes devueltos, con o sin prefijo de namespace', () => {
  const r = leerRespuesta(200, soap('0', 'Ok',
    '<resultado><ns2:lote>11111111-1111-1111-1111-111111111111</ns2:lote></resultado>' +
    '<resultado><lote>22222222-2222-2222-2222-222222222222</lote></resultado>'))
  assert.deepEqual(r.lotes, [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
  ])
})
