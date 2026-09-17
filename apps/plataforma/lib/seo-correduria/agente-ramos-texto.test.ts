// Fixture: el ramos.ts REAL de asegura-web (no uno escrito a mano) — la lección de
// `docs/CONTEXTO-SESIONES.md` sobre parsers de documentos: el fixture se copia del real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aplicarCambioRamo, leerCampoRamo } from './agente-ramos-texto.ts'

const RUTA_RAMOS = join(import.meta.dirname, '..', '..', '..', 'asegura-web', 'lib', 'ramos.ts')
const REAL = readFileSync(RUTA_RAMOS, 'utf8')

test('leerCampoRamo lee el title y la description reales de "hogar"', () => {
  assert.equal(leerCampoRamo(REAL, 'hogar', 'title'), 'Seguro de hogar en toda España')
  assert.match(leerCampoRamo(REAL, 'hogar', 'description'), /^Correduría de seguros en toda España/)
})

test('leerCampoRamo lanza si el slug no existe (nunca un valor de relleno)', () => {
  assert.throws(() => leerCampoRamo(REAL, 'no-existe', 'title'))
})

test('aplicarCambioRamo cambia SOLO el ramo pedido, deja los demás intactos', () => {
  const salida = aplicarCambioRamo(REAL, 'hogar', { title: 'Título de prueba' })
  assert.equal(leerCampoRamo(salida, 'hogar', 'title'), 'Título de prueba')
  // el resto del fichero, byte a byte igual salvo la ventana de 'hogar'
  assert.equal(leerCampoRamo(salida, 'auto', 'title'), leerCampoRamo(REAL, 'auto', 'title'))
  assert.equal(leerCampoRamo(salida, 'comunidades', 'description'), leerCampoRamo(REAL, 'comunidades', 'description'))
})

test('aplicarCambioRamo cambia title y description a la vez', () => {
  const salida = aplicarCambioRamo(REAL, 'auto', { title: 'T2', description: 'Descripción con comillas \'raras\' de prueba.' })
  assert.equal(leerCampoRamo(salida, 'auto', 'title'), 'T2')
  assert.equal(leerCampoRamo(salida, 'auto', 'description'), "Descripción con comillas 'raras' de prueba.")
})

test('aplicarCambioRamo lanza si no se pide ningún campo (nunca un no-op silencioso)', () => {
  assert.throws(() => aplicarCambioRamo(REAL, 'hogar', {}))
})

test('aplicarCambioRamo lanza si el slug no existe', () => {
  assert.throws(() => aplicarCambioRamo(REAL, 'no-existe', { title: 'x' }))
})

test('el ramo modificado sigue siendo JS válido: comillas simples se escapan', () => {
  const salida = aplicarCambioRamo(REAL, 'flota', { title: "Seguro con \\ y ' dentro" })
  // eslint-disable-next-line no-new-func
  const contenidoEscapadoOk = /title: 'Seguro con \\\\ y \\' dentro',/.test(salida)
  assert.ok(contenidoEscapadoOk, 'la comilla/backslash deben quedar escapados en el literal')
})
