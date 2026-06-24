import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  generarEscPos, generarTextoPlano, generarTicketCuenta,
} from '../src/renderers/thermal.ts'
import { FIXTURES, withFrozenClock } from './fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const golden = (name: string) => readFileSync(join(here, 'fixtures', `${name}.b64`), 'utf8')
const b64 = (data: Buffer | string) =>
  Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data, 'utf8').toString('base64')

test('generarEscPos: bytes idénticos al golden', () => {
  assert.equal(withFrozenClock(() => b64(generarEscPos(FIXTURES.comanda))), golden('escpos-comanda'))
})
test('generarTextoPlano: bytes idénticos al golden', () => {
  assert.equal(withFrozenClock(() => b64(generarTextoPlano(FIXTURES.comanda))), golden('texto-comanda'))
})
test('generarTicketCuenta: bytes idénticos al golden', () => {
  assert.equal(withFrozenClock(() => b64(generarTicketCuenta(FIXTURES.ticketCuenta))), golden('ticket-cuenta'))
})
