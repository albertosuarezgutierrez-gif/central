import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tipoRealFactura } from './tipo-fichero.ts'

const b = (...x: number[]) => new Uint8Array(x)

test('PDF, JPEG, PNG y WebP se reconocen por sus bytes', () => {
  assert.equal(tipoRealFactura(Buffer.from('%PDF-1.4\n...')), 'application/pdf')
  assert.equal(tipoRealFactura(Buffer.from('\n\n%PDF-1.7')), 'application/pdf')
  assert.equal(tipoRealFactura(b(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
  assert.equal(tipoRealFactura(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'image/png')
  assert.equal(tipoRealFactura(Buffer.concat([Buffer.from('RIFF'), b(1, 2, 3, 4), Buffer.from('WEBPVP8 ')])), 'image/webp')
})

test('lo demás es null: HTML, ZIP, HEIC, WAV (RIFF no WebP), vacío, truncado', () => {
  assert.equal(tipoRealFactura(Buffer.from('<html><script>')), null)
  assert.equal(tipoRealFactura(Buffer.from('PK\x03\x04')), null)
  assert.equal(tipoRealFactura(Buffer.concat([b(0, 0, 0, 0x18), Buffer.from('ftypheic')])), null)
  assert.equal(tipoRealFactura(Buffer.concat([Buffer.from('RIFF'), b(1, 2, 3, 4), Buffer.from('WAVEfmt ')])), null)
  assert.equal(tipoRealFactura(new Uint8Array(0)), null)
  assert.equal(tipoRealFactura(b(0xff, 0xd8)), null)
  assert.equal(tipoRealFactura(b(0x89, 0x50, 0x4e)), null)
})
