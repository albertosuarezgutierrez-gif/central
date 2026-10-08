import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reutilizaDocumentoPrevio } from './cartera-documentos-reglas.ts'

test('🪤 guardarDocumento NO reutiliza el documento previo por defecto (opt-in)', () => {
  assert.equal(reutilizaDocumentoPrevio({}), false)
  assert.equal(reutilizaDocumentoPrevio({ reutilizarSiIdentico: false }), false)
  assert.equal(reutilizaDocumentoPrevio({ reutilizarSiIdentico: undefined }), false)
  assert.equal(reutilizaDocumentoPrevio({ reutilizarSiIdentico: true }), true)
})
