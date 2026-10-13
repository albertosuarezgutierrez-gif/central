// Cepos de la revisión del PR #4592: reserva antes de enviar, anotación esperada y consentimiento antes de la suscripción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const APP = new URL('../apps/asegura-portal/', import.meta.url)
const leer = (r: string) =>
  readFileSync(new URL(r, APP), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('🚨 gestión: reserva y tope diario ANTES de tgSend; anotarEnFicha se espera dentro de try/catch', () => {
  const c = leer('app/api/polizas/[id]/gestion/route.ts')
  const envio = c.indexOf('tgSend(')
  assert.ok(envio !== -1)
  assert.ok(c.indexOf('claveReserva(') !== -1 && c.indexOf('claveReserva(') < envio, 'la reserva va antes del envío')
  assert.ok(c.indexOf('MAX_PETICIONES_DIA') < envio, 'el tope diario va antes del envío')
  assert.doesNotMatch(c, /void anotarEnFicha/)
  assert.match(c, /try \{\s*await anotarEnFicha\(/)
})

test('🚨 push: el consentimiento `avisos` se sella antes del upsert de la suscripción', () => {
  const c = leer('lib/push-suscripcion.ts')
  const sub = c.slice(c.indexOf('export async function suscribirDeSesion'))
  assert.ok(sub.indexOf('sellarAvisos(') < sub.indexOf('portalPushSuscripcion.upsert('))
})

test('🚨 avisos-push: la criba pagina por cursor y no usa un único take:500', () => {
  const c = leer('app/api/cron/avisos-push/route.ts')
  assert.match(c, /reunirAvisables\(/)
  assert.match(c, /cursor: \{ id: cursorId \}/)
})
