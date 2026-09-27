import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CASOS_EVAL, veredictoEval } from './eval-asistente-casos.ts'

const llamada = (name: string, args: unknown) => ({ tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] })

test('eval: solo aprueba proponer_oportunidad con el documento; una pregunta suspende', () => {
  assert.equal(veredictoEval(llamada('proponer_oportunidad', { usarDocumentos: true })).ok, true)
  assert.equal(veredictoEval(llamada('proponer_oportunidad', { ramo: 'auto' })).ok, false)
  assert.equal(veredictoEval({ content: '¿De quién es la póliza?' }).ok, false)
  assert.equal(veredictoEval(llamada('buscar', { texto: 'Rafael' })).ok, false)
})

test('eval: están los cinco casos reales y la orden del botón es la misma que usa el bot', () => {
  assert.equal(CASOS_EVAL.length, 5)
  const script = readFileSync(fileURLToPath(new URL('../scripts/eval-asistente-correduria.ts', import.meta.url)), 'utf8')
  const bot = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  const orden = /const ORDEN = '([^']+)'/.exec(script)?.[1]
  assert.ok(orden && bot.includes(`ORDEN_DOCUMENTO_CLIENTE = '${orden}'`), 'si cambia la orden del bot, el eval probaría otra frase')
})
