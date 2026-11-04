// Dirección con el patrón del repo: CP → provincia → municipio → calle del Catastro → número. Nunca a medias ni inventada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { direccionOpcional, DIRECCION_VACIA, validarDireccion } from '../lib/direccion.ts'

const buena = { cp: '41900', provincia: 'Sevilla', municipio: 'Camas', via: 'CL CAÑADA REAL', numero: '14' }

test('dirección completa y coherente con su CP: válida', () => {
  assert.deepEqual(validarDireccion(buena), [])
  assert.deepEqual(direccionOpcional({ ...buena, via: '  CL CAÑADA REAL ' }), { ok: true, direccion: buena })
})

test('vacía → sin dirección (null); a medias → errores y no se guarda', () => {
  assert.deepEqual(direccionOpcional(DIRECCION_VACIA), { ok: true, direccion: null })
  const r = direccionOpcional({ ...DIRECCION_VACIA, cp: '41900' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.errores.some((e) => /municipio/.test(e)) && r.errores.some((e) => /calle/.test(e)) && r.errores.some((e) => /número/.test(e)))
})

test('CP inválido, y provincia que no es la del CP, se rechazan', () => {
  assert.ok(validarDireccion({ ...buena, cp: '4190' }).some((e) => /5 cifras/.test(e)))
  assert.ok(validarDireccion({ ...buena, provincia: 'Madrid' }).some((e) => /es de Sevilla/.test(e)))
  assert.deepEqual(validarDireccion({ ...buena, provincia: 'SEVILLA' }), [], 'sin distinguir mayúsculas')
})

test('nunca valores por defecto: ni provincia ni municipio literales en el buscador ni en las acciones', () => {
  const lee = (...r: string[]) => readFileSync(join(import.meta.dirname, '..', ...r), 'utf8')
  for (const f of [['app', '_direccion', 'DireccionCp.tsx'], ['lib', 'direccion.ts']]) {
    assert.ok(!/Sevilla|Camas|41900['"]/.test(lee(...f).replace(/placeholder="41900"/g, '')), f.join('/'))
  }
  // Ajustes (taller) y recepción (cliente) usan el buscador y validan en servidor.
  assert.match(lee('app', 'ajustes', 'AjustesCliente.tsx'), /<DireccionCp /)
  assert.match(lee('app', 'recepcion', 'RecepcionCliente.tsx'), /<DireccionCp /)
  assert.match(lee('app', 'ajustes', 'acciones.ts'), /direccionOpcional\(/)
  assert.match(lee('app', 'recepcion', 'acciones.ts'), /direccionOpcional\(/)
  // El autocompletado de calle es del Catastro y el endpoint exige sesión.
  assert.match(lee('app', 'api', 'direccion', 'vias', 'route.ts'), /listarViasPorTermino/)
  assert.match(lee('app', 'api', 'direccion', 'vias', 'route.ts'), /getSession\(\)/)
  assert.match(lee('app', 'api', 'direccion', 'cp', 'route.ts'), /getSession\(\)/)
})
