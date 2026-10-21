import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/api/huecos-proteccion/route.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

test('huecos: el canal de Telegram se comprueba ANTES de escribir la reserva', () => {
  const canal = src.indexOf('canalTelegramConfigurado()', src.indexOf('export async function POST'))
  const reserva = src.indexOf('claveReservaHuecos(ahora)')
  assert.ok(canal > 0 && reserva > 0, 'faltan la comprobación del canal o la reserva')
  assert.ok(canal < reserva, 'la comprobación del canal debe ir antes de la reserva')
  assert.match(src, /process\.env\.TELEGRAM_BOT_TOKEN\s*&&\s*process\.env\.TELEGRAM_CHAT_ID/)
  assert.match(src.slice(canal, reserva), /sin_canal[\s\S]*503/)
})
