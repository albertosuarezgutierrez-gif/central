// Push del portal: VAPID por requireSecret en UN helper, y los dos crons con TTL/urgencia/topic.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CRONES = ['apps/asegura-portal/app/api/cron/avisos-push/route.ts', 'apps/asegura-portal/app/api/cron/avisos-cima/route.ts']

test('🚨 el helper VAPID lee las claves con requireSecret, no con `|| ""`', () => {
  const h = sinComentarios(leer('apps/asegura-portal/lib/push-vapid.ts'))
  assert.match(h, /requireSecret/)
  assert.doesNotMatch(h, /process\.env\.VAPID/)
  assert.doesNotMatch(h, /\|\|\s*''/)
})

for (const f of CRONES) {
  test(`🚨 ${f.split('/').slice(-2, -1)[0]}: VAPID por el helper, 503 sin_vapid, sin subject ni clave a mano`, () => {
    const c = sinComentarios(leer(f))
    assert.match(c, /cargarVapid\(\)/)
    assert.match(c, /sin_vapid/)
    assert.match(c, /status: 503/)
    assert.doesNotMatch(c, /process\.env\.VAPID_PRIVATE_KEY/)
    assert.doesNotMatch(c, /mailto:/)
  })

  test(`🚨 ${f.split('/').slice(-2, -1)[0]}: el envío lleva TTL/urgencia (OPCIONES_AVISO) y un topic estable`, () => {
    const c = sinComentarios(leer(f))
    assert.match(c, /\.\.\.OPCIONES_AVISO/)
    assert.match(c, /topicAviso\(/)
  })
}

test('🚨 ActivarPush decide con el helper puro y reutiliza la detección de iOS de instalacion.tsx', () => {
  const c = sinComentarios(leer('apps/asegura-portal/app/ActivarPush.tsx'))
  assert.match(c, /decidirVistaPush/)
  assert.match(c, /useInstalacion/)
  assert.match(c, /InstruccionesIOS/)
  assert.doesNotMatch(c, /userAgent|maxTouchPoints|matchMedia/)
})
