// Cepos de la separación panel ↔ operador (I-4) y de «el empleado no ve contratos» en el servidor (I-1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n === 'node_modules' || n === '.next') return []
    return statSync(p).isDirectory() ? ficheros(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}
const codigo = [...ficheros(join(RAIZ, 'app')), ...ficheros(join(RAIZ, 'lib')), join(RAIZ, 'middleware.ts')]
  .map((p) => ({ ruta: relative(RAIZ, p).split('\\').join('/'), txt: readFileSync(p, 'utf8') }))

test('CEPO solo las rutas /api/operador/* importan el cliente del operador', () => {
  const importan = codigo.filter((f) => /from ['"](@\/lib\/db-operador|\.\.?\/[^'"]*db-operador(\.ts)?)['"]/.test(f.txt)).map((f) => f.ruta)
  assert.ok(importan.length >= 3, `esperaba las 3 rutas del operador: ${importan.join(', ')}`)
  for (const r of importan) assert.match(r, /^app\/api\/operador\//, `${r} importa db-operador`)
})

test('CEPO la URL del operador solo la lee db-operador.ts (requireSecret) y el panel no llama a op_*', () => {
  for (const f of codigo) {
    if (f.ruta === 'lib/db-operador.ts') continue
    assert.ok(!f.txt.includes('HERRAMIENTAS_OP_DATABASE_URL'), `${f.ruta} lee la URL del operador`)
    assert.doesNotMatch(f.txt, /herramientas\.op_[a-z_]+\(/, `${f.ruta} llama a una función op_*`)
  }
  const op = codigo.find((f) => f.ruta === 'lib/db-operador.ts')!.txt
  assert.match(op, /requireSecret\(ENV_OP_DATABASE_URL\)/)
  assert.match(op, /ENV_OP_DATABASE_URL = 'HERRAMIENTAS_OP_DATABASE_URL'/)
  assert.doesNotMatch(op, /process\.env/)
})

test('CEPO documento, /contratos y /contrato/[version] exigen puede(rol, ver_contrato)', () => {
  for (const r of ['app/api/documento/[version]/route.ts', 'app/contratos/page.tsx', 'app/contrato/[version]/page.tsx']) {
    const f = codigo.find((x) => x.ruta === r)
    assert.ok(f, r)
    assert.match(f!.txt, /puede\([^)]*'ver_contrato'\)/, `${r} sin puede(…, 'ver_contrato')`)
  }
})
