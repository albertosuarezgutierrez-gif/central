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

// ── El muro del Portal (20/08/2026) ─────────────────────────────────────────
// El bloque «Información complementaria» del BOE —donde vive la lista de
// adjuntos— solo se enseña con sesión iniciada en unas subastas. El cron entra
// anónimo: su `[]` es «no me lo enseñan», no «la subasta no adjunta nada».

test('con muro, un `[]` no se afirma como «sin documentos adjuntos»', () => {
  for (const muro of ['total', 'parcial'] as const) {
    assert.equal(estadoDocumentacion([], true, muro), 'ocultos', muro)
    assert.equal(resumenDocumentos([], true, muro), 'documentos ocultos: hay que iniciar sesión en el Portal')
    // Y un NULL con muro tampoco es «pendiente de revisar»: ya se revisó.
    assert.equal(estadoDocumentacion(null, true, muro), 'ocultos', muro)
  }
})

test('con muro PARCIAL la lista visible se cuenta, pero se avisa de que está capada', () => {
  assert.equal(estadoDocumentacion([doc('EDICTO')], true, 'parcial'), 'con_adjuntos')
  assert.equal(
    resumenDocumentos([doc('EDICTO')], true, 'parcial'),
    '1 documento visible sin sesión (el Portal esconde el resto)',
  )
  assert.equal(
    resumenDocumentos([doc('EDICTO'), doc('CERTIFICACION')], true, 'parcial'),
    '2 documentos visibles sin sesión (el Portal esconde el resto)',
  )
})

test('sin muro nada cambia', () => {
  assert.equal(estadoDocumentacion([], true, 'ninguno'), 'sin_adjuntos')
  assert.equal(estadoDocumentacion(null, true, 'ninguno'), 'sin_revisar')
  assert.equal(resumenDocumentos([doc('EDICTO')], true, 'ninguno'), '1 documento')
})
