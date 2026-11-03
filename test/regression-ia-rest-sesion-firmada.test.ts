import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Guardián de la sesión de ia-rest (02/11/2026). La cabecera `x-ia-session` la manda
// el CLIENTE: leerla con JSON.parse y fiarse de `restaurante_id`/`rol`/`id` permitía
// leer/escribir datos de OTRO restaurante, hacerse pasar por super_admin (impersonate)
// o firmar tickets como otro camarero. La única puerta es lib/session.ts
// (getSession / getSesionCuenta / sesionParaReenviar), que exige la firma HMAC SIEMPRE.
// Hermano: los crons con `Bearer ${process.env.CRON_SECRET}` autenticaban
// "Bearer undefined" si faltaba la variable; ahora pasan por lib/cron-auth.ts.

const RAIZ = join(import.meta.dirname, '..')
const API = join(RAIZ, 'apps/ia-rest/src/app/api')
const LIB = join(RAIZ, 'apps/ia-rest/src/lib')

function rutas(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...rutas(p))
    else if (n === 'route.ts') out.push(p)
  }
  return out
}

const RUTAS = rutas(API).map(p => ({ p: relative(RAIZ, p), src: readFileSync(p, 'utf8') }))

test('hay rutas que vigilar (el recorrido no está vacío)', () => {
  assert.ok(RUTAS.length > 100, `solo ${RUTAS.length} route.ts en ${relative(RAIZ, API)}: ¿se movió la app?`)
})

test('ninguna route.ts de ia-rest lee la cabecera x-ia-session directamente (solo lib/session.ts)', () => {
  const malas = RUTAS.filter(r => /headers\.get\(\s*['"`]x-ia-session['"`]\s*\)/.test(r.src)).map(r => r.p)
  assert.deepEqual(malas, [],
    `estas rutas leen x-ia-session sin verificar la firma; usa getSession()/getSesionCuenta()/sesionParaReenviar() de @/lib/session:\n${malas.join('\n')}`)
})

test('getSession no tiene modo permisivo: sin SESSION_ENFORCE en lib/session.ts', () => {
  const src = readFileSync(join(LIB, 'session.ts'), 'utf8')
  assert.doesNotMatch(src, /SESSION_ENFORCE/,
    'lib/session.ts vuelve a depender de SESSION_ENFORCE: las sesiones sin firma no se aceptan nunca')
})

test('sesionAceptable no tiene modo permisivo: sin SESSION_ENFORCE en lib/session-sign.ts', () => {
  const src = readFileSync(join(LIB, 'session-sign.ts'), 'utf8')
  assert.doesNotMatch(src, /SESSION_ENFORCE/,
    'lib/session-sign.ts vuelve a depender de SESSION_ENFORCE (portales asesoría/almacén/cuenta)')
})

test('ninguna ruta compara a mano con `Bearer ${process.env.CRON_SECRET}` (usa cronAutorizado)', () => {
  const malas = RUTAS.filter(r => /[!=]==\s*`Bearer \$\{process\.env\.CRON_SECRET\}`/.test(r.src)).map(r => r.p)
  assert.deepEqual(malas, [], `comparación fail-open ("Bearer undefined") en:\n${malas.join('\n')}`)
})

test('ningún cron se abre cuando falta CRON_SECRET (`if (!secret) return true`)', () => {
  const malas = RUTAS.filter(r => /if\s*\(\s*!secret\s*\)\s*return\s+true/.test(r.src)).map(r => r.p)
  assert.deepEqual(malas, [], `cron fail-open sin CRON_SECRET en:\n${malas.join('\n')}`)
})

test('webhooks/vercel-deploy rechaza si falta el secreto o la cabecera de firma', () => {
  const src = readFileSync(join(API, 'webhooks/vercel-deploy/route.ts'), 'utf8')
  assert.match(src, /if\s*\(\s*!secret\s*\|\|\s*!signature\s*\)\s*\{\s*\n\s*return NextResponse\.json\([^)]*\{\s*status:\s*401\s*\}/,
    'webhooks/vercel-deploy ya no devuelve 401 sin firma: omitir la cabecera dispararía runQA')
})

test('push/send toma el restaurante de la sesión firmada; el del cuerpo solo para super_admin o CRON_SECRET', () => {
  const src = readFileSync(join(API, 'push/send/route.ts'), 'utf8')
  // Antes: `rid !== '0000…0001' ? rid : (ridOverride ?? rid)` → sin sesión, el body elegía el restaurante.
  assert.doesNotMatch(src, /ridOverride\s*\?\?\s*rid/,
    'push/send vuelve a aceptar restaurante_id del cuerpo sin autenticar: push a cualquier restaurante')
  assert.match(src, /getSession\(req\)/, 'push/send debe leer la sesión firmada con getSession()')
  assert.match(src, /secretoCronValido\(/, 'push/send debe validar CRON_SECRET para las llamadas internas')
  assert.match(src, /if\s*\(\s*esCron\s*\|\|\s*session\?\.rol\s*===\s*'super_admin'\s*\)/,
    'solo un cron con CRON_SECRET o un super_admin pueden elegir el restaurante')
  assert.match(src, /status:\s*401/, 'sin sesión ni CRON_SECRET push/send debe responder 401')
})
