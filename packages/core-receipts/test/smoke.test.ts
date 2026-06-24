import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CORE_RECEIPTS_VERSION } from '../src/index.ts'

test('el paquete expone su versión', () => {
  assert.equal(CORE_RECEIPTS_VERSION, '0.0.0')
})
