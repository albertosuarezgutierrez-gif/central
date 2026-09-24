// Guardián: los webhooks de Telegram tienen que ser FAIL-CLOSED. Por ellos se aprueban pagos,
// envíos y borradores con un botón; si falta TELEGRAM_WEBHOOK_SECRET no pueden dejar pasar todo.
// El patrón vetado es el de antes del 23/09/2026: `if (secret) { …comprobar… }`, que sin env se salta
// la comprobación entera, y el `return true` de core-telegram cuando no había secreto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname

function rutasTelegram(): string[] {
  const salida: string[] = []
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n === '.next') continue
      const p = join(dir, n)
      if (statSync(p).isDirectory()) recorrer(p)
      else if (n === 'route.ts' && /telegram/i.test(p)) salida.push(p)
    }
  }
  for (const app of readdirSync(join(RAIZ, 'apps'))) {
    for (const base of ['app/api', 'src/app/api']) {
      const d = join(RAIZ, 'apps', app, base)
      if (existsSync(d)) recorrer(d)
    }
  }
  return salida
}

test('hay rutas de Telegram que vigilar (si no, el cepo mira al sitio equivocado)', () => {
  assert.ok(rutasTelegram().length >= 4)
})

test('ninguna ruta de Telegram se salta la comprobación del secreto cuando falta la env', () => {
  const infractores = rutasTelegram().filter(p => /if\s*\(\s*secret\s*\)\s*\{/.test(readFileSync(p, 'utf8')))
  assert.deepEqual(infractores.map(p => p.slice(RAIZ.length)), [])
})

test('core-telegram: verifyTelegramWebhook no acepta nada sin secreto', () => {
  const src = readFileSync(join(RAIZ, 'packages/core-telegram/src/index.ts'), 'utf8')
  assert.doesNotMatch(src, /if \(!secret\) return true/)
})

test('el webhook de plataforma exige que el update venga del chat autorizado', () => {
  const src = readFileSync(join(RAIZ, 'apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts'), 'utf8')
  assert.match(src, /if \(!emisorAutorizado\(body\)\)/)
})
