import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenPasada, mensajeCompraPaper } from './trading-notify.ts'

test('resumenPasada incluye NAV en formato español y las ideas', () => {
  const txt = resumenPasada('2026-07-17', 2162.49, [{ simbolo: 'NVDA', estrategia: 'momentum', direccion: 'alcista', confianza: 78, operada: true }])
  assert.ok(txt.includes('2.162,49€'))
  assert.ok(txt.includes('NVDA'))
  assert.ok(txt.includes('✅ paper'))
})

test('mensajeCompraPaper muestra símbolo, cantidad, precio USD y deja claro que es paper', () => {
  const msg = mensajeCompraPaper('2026-07-18', { simbolo: 'NVDA', cantidad: 22, precio: 202.81, estrategia: 'momentum', confianza: 68, stop: 188.12, pctNav: 0.133 })
  assert.match(msg, /COMPRA PAPER/)
  assert.match(msg, /NVDA/)
  assert.match(msg, /22 acc @ 202\.81 USD/)
  assert.match(msg, /~13% NAV/)
  assert.match(msg, /stop 188\.12/)
  assert.match(msg, /ninguna orden real/)   // invariante visible: nunca real
  assert.doesNotMatch(msg, /€/)              // el precio es USD, no lleva €
})

test('mensajeCompraPaper omite el % de NAV si no se pasa', () => {
  const msg = mensajeCompraPaper('2026-07-18', { simbolo: 'META', cantidad: 5, precio: 646.01, estrategia: 'momentum', confianza: 68, stop: 584.7 })
  assert.doesNotMatch(msg, /NAV/)
  assert.match(msg, /5 acc @ 646\.01 USD/)
})
