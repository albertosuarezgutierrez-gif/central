// «Mis nóminas»: URL del Portal del Empleado por RRHH_PORTAL_URL, sin fallback literal a un dominio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { urlPortalEmpleado } from '../lib/enlaces.ts'

test('con la variable (https) → URL; sin ella, vacía, no-https, con credenciales o basura → null (el botón no se muestra)', () => {
  assert.equal(urlPortalEmpleado({ RRHH_PORTAL_URL: 'https://portal.example.test/entrar' }), 'https://portal.example.test/entrar')
  for (const v of [undefined, '', '   ', 'http://portal.example.test', 'javascript:alert(1)', 'https://u:p@portal.example.test', 'no es url']) {
    assert.equal(urlPortalEmpleado({ RRHH_PORTAL_URL: v }), null, String(v))
  }
  assert.equal(urlPortalEmpleado({}), null)
})

test('el menú pinta «Mis nóminas» solo si hay URL, y no hay ningún dominio escrito en el código', () => {
  const lee = (...r: string[]) => readFileSync(join(import.meta.dirname, '..', ...r), 'utf8')
  const home = lee('app', 'page.tsx')
  assert.match(home, /\{nominas && \(/)
  assert.match(home, /Mis nóminas/)
  assert.ok(!/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(home + lee('lib', 'enlaces.ts')), 'ningún dominio literal')
  assert.ok(!/RRHH_PORTAL_URL\s*(\|\||\?\?)/.test(lee('lib', 'enlaces.ts')), 'sin fallback')
})
