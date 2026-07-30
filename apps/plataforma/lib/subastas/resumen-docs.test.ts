import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDocumentacion, resumenDocumentos } from './resumen-docs.ts'

const doc = (titulo: string, legible: boolean | null = null) => ({
  titulo,
  url: `https://subastas.boe.es/verDocumento.php?idDoc=${titulo}`,
  legible,
})

test('NULL es «sin revisar», no «sin adjuntos»', () => {
  // La regresión real: SUB-JA-2026-263723 publicaba edicto + certificación de
  // cargas y la ficha decía «sin documentos adjuntos» porque la columna estaba
  // a NULL (ingerida antes de que existiera).
  assert.equal(estadoDocumentacion(null), 'sin_revisar')
  assert.equal(estadoDocumentacion(undefined), 'sin_revisar')
  assert.equal(resumenDocumentos(null), 'adjuntos sin revisar')
  assert.notEqual(resumenDocumentos(null), resumenDocumentos([]))
})

test('las fuentes sin ficha documental (Junta) no quedan «pendientes» para siempre', () => {
  assert.equal(estadoDocumentacion(null, false), 'sin_adjuntos')
  assert.equal(resumenDocumentos(null, false), 'sin documentos adjuntos')
})

test('lista vacía SÍ afirma la ausencia (la ficha se revisó)', () => {
  assert.equal(estadoDocumentacion([]), 'sin_adjuntos')
  assert.equal(resumenDocumentos([]), 'sin documentos adjuntos')
})

test('cuenta los adjuntos y singulariza', () => {
  assert.equal(resumenDocumentos([doc('EDICTO')]), '1 documento')
  assert.equal(resumenDocumentos([doc('EDICTO'), doc('CERTIFICACION')]), '2 documentos')
})

test('avisa de los escaneados (sin capa de texto)', () => {
  assert.equal(
    resumenDocumentos([doc('EDICTO', true), doc('CERTIFICACION', false)]),
    '2 documentos, 1 sin capa de texto',
  )
  // `legible: null` = no se intentó leer: no es un escaneado confirmado.
  assert.equal(resumenDocumentos([doc('EDICTO', true), doc('CERTIFICACION', null)]), '2 documentos')
})
