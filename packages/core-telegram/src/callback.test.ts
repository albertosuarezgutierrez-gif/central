import { test } from 'node:test'
import assert from 'node:assert'
import { parseCallback } from './index.ts'

test('parseCallback separa prefijo y args', () => {
  assert.deepEqual(parseCallback('hsp_send:123'), { prefix: 'hsp', action: 'send', args: ['123'] })
})

test('parseCallback con varios args', () => {
  assert.deepEqual(parseCallback('hsp_grant_late:123:2026-07-01'),
    { prefix: 'hsp', action: 'grant_late', args: ['123', '2026-07-01'] })
})

test('parseCallback vacío', () => {
  assert.deepEqual(parseCallback(''), { prefix: '', action: '', args: [] })
})

test('parseCallback sin guion bajo', () => {
  assert.deepEqual(parseCallback('ping:1'), { prefix: 'ping', action: '', args: ['1'] })
})
