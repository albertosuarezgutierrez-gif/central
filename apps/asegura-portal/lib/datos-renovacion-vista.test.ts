// Solicitud de datos de la renovación en el portal (05/11/2026): lo que devuelve el puente y la puerta del Catastro. Sintético.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { interpretarDatosRenovacion } from './datos-renovacion-vista.ts'

const CAMPO = { clave: 'conMadera', etiqueta: '¿La estructura del edificio lleva madera?', tipo: 'si_no', obligatorio: true }

test('ok solo con ramo conocido, campos válidos y papel conocido', () => {
  assert.deepEqual(interpretarDatosRenovacion(200, { estado: 'ok', ramo: 'hogar', campos: [CAMPO], papel: 'autorizado' }), { estado: 'ok', ramo: 'hogar', campos: [CAMPO], papel: 'autorizado' })
  assert.equal(interpretarDatosRenovacion(200, { estado: 'ok', ramo: 'hogar', campos: [CAMPO], papel: 'otro' }).estado, 'error', 'papel raro = error')
  assert.equal(interpretarDatosRenovacion(200, { estado: 'ok', ramo: 'castillo', campos: [CAMPO], papel: 'tomador' }).estado, 'error')
  assert.equal(interpretarDatosRenovacion(200, { estado: 'ok', ramo: 'hogar', campos: [], papel: 'tomador' }).estado, 'error', 'sin campos no se pinta un formulario vacío')
  assert.deepEqual(interpretarDatosRenovacion(200, { estado: 'ok', ramo: 'hogar', campos: [CAMPO, { clave: 1 }], papel: 'tomador' }).estado, 'ok')
})

test('404 = no encontrada (otra persona o sin ✅); un fallo NO es «no encontrada»', () => {
  assert.equal(interpretarDatosRenovacion(404, { estado: 'no_encontrada' }).estado, 'no_encontrada')
  assert.equal(interpretarDatosRenovacion(503, { estado: 'sin_migracion' }).estado, 'error')
  assert.equal(interpretarDatosRenovacion(500, null).estado, 'error')
  assert.equal(interpretarDatosRenovacion(200, 'raro').estado, 'error')
  assert.equal(interpretarDatosRenovacion(200, { estado: 'completada' }).estado, 'completada')
  assert.equal(interpretarDatosRenovacion(200, { estado: 'muerta' }).estado, 'muerta')
})

test('la tarjeta del Catastro exige una solicitud ABIERTA para esta sesión antes de consultar nada', () => {
  const ruta = readFileSync(new URL('../app/api/datos-renovacion/vivienda/route.ts', import.meta.url), 'utf8')
  const puerta = ruta.indexOf('await solicitudAbiertaParaSesion(')
  assert.ok(puerta > 0 && puerta < ruta.indexOf('await viviendaCatastro('), 'la puerta va ANTES del Catastro')
  assert.match(ruta, /await solicitudAbiertaParaSesion\(.*\)\)\) return NextResponse\.json\(\{ error: 'no_encontrada' \}, \{ status: 404 \}\)/)
  const lib = readFileSync(new URL('./datos-renovacion.ts', import.meta.url), 'utf8')
  const i = lib.indexOf('export async function solicitudAbiertaParaSesion')
  const f = lib.slice(i, lib.indexOf('\n}\n', i))
  assert.match(f, /const identidad = await getIdentidad\(\)/)
  assert.match(f, /if \(s\.estado !== 'ok' \|\| s\.ramo !== 'hogar'\) return false/)
  assert.match(f, /`\$\{identidad\.id\}:\$\{solicitudId\}`/, 'la caché es por identidad Y solicitud')
})
