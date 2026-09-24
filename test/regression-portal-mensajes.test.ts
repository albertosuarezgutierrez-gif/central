import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Mensajes con tu corredor (ASegura OS §Q.7), el lado del portal.
 *
 * El rol del portal no tiene RLS: la ficha en la que se escribe la decide el CÓDIGO. Un
 * `clienteId` que llegara en la petición no fallaría: escribiría en la ficha de otro. Y la
 * sesión del corredor (Alberto viendo el portal de un cliente) no escribe en su nombre.
 */
const lib = readFileSync('apps/asegura-portal/lib/mensajes.ts', 'utf8')
const ruta = readFileSync('apps/asegura-portal/app/api/mensajes/route.ts', 'utf8')

test('🪤 la ficha sale de portal_vinculo de la sesión, nunca de la petición', () => {
  assert.doesNotMatch(ruta, /clienteId/, 'la ruta no puede leer un clienteId del cuerpo')
  const envio = lib.slice(lib.indexOf('export async function enviarMensajeDeSesion'))
  assert.match(envio, /getIdentidad\(\)/)
  assert.match(envio, /portalVinculo\.findMany\(\{\s*where: \{ identidadId: identidad\.id, origen: \{ not: 'corredor' \} \}/)
  assert.match(envio, /clienteId: ficha\.clienteId/, 'se escribe en la ficha que decide decidirFichaPropia')
})

test('🪤 la vista de corredor no escribe ni marca leído como el cliente', () => {
  const envio = lib.slice(lib.indexOf('export async function enviarMensajeDeSesion'))
  const corte = envio.indexOf("return { estado: 'modo_corredor' }")
  assert.ok(corte > 0 && corte < envio.indexOf('portalMensaje.create'), 'modo_corredor se decide ANTES de escribir')
  const leidos = lib.slice(lib.indexOf('export async function marcarLeidosDeSesion'), lib.indexOf('export type ResultadoEnvio'))
  assert.match(leidos, /identidad\.corredor !== null\) return/, 'si Alberto lo abre, el cliente no lo ha leído')
})
