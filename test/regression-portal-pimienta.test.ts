// La pimienta del canal del portal NO puede degradarse en silencio.
//
// `hashCanal` guarda el email del cliente como SHA-256 con pimienta para que la
// tabla `portal_canal` no sea una lista de emails revertible con un diccionario.
// Con `process.env.ASEGURA_PORTAL_CANAL_PEPPER ?? ''` la app NO fallaba cuando la
// env no estaba: seguía aceptando altas y escribía hashes SIN pimienta. Medido en
// producción el 03/09/2026 — el código de acceso se envió con normalidad y nada
// avisó.
//
// El guardián general de secretos (`regression-secrets.test.ts`) no lo cubre a
// propósito: su regla es «un literal vacío no es una credencial usable», que es
// cierta para un secreto que firma y falsa para una pimienta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const src = readFileSync(join(ROOT, 'apps/asegura-portal/lib/auth.ts'), 'utf8')

test('la pimienta del canal falla en produccion en vez de quedarse vacia', () => {
  assert.match(
    src,
    /requireSecret\(\s*'ASEGURA_PORTAL_CANAL_PEPPER'/,
    'la pimienta tiene que pasar por requireSecret (lanza en producción)',
  )
  assert.doesNotMatch(
    src,
    /process\.env\.ASEGURA_PORTAL_CANAL_PEPPER\s*(?:\?\?|\|\|)/,
    'un fallback deja el hash sin pimienta sin que nada falle',
  )
})

test('el secreto de sesion del portal sigue pasando por requireSecret', () => {
  assert.match(src, /requireSecret\(\s*'ASEGURA_PORTAL_SESSION_SECRET'/)
})
