// Guardián del lector de documentos de la correduría en plataforma
// (`apps/plataforma/lib/documentos-asegura.ts`). Puro: sin red.
//
// Lo que fija: `null` = «no se pudo consultar» y `[]` = «se miró y no hay» no
// se confunden nunca, y un documento «pedido» (sin fichero) sigue siendo una fila.

import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarDocumentos, leerDocumentos } from '../apps/plataforma/lib/documentos-asegura.ts'

const DOC = {
  id: 'd1',
  tipo: 'dni',
  estado: 'pedido',
  nombre: null,
  mime: null,
  bytes: null,
  sha256: null,
  notas: 'pedido por WhatsApp',
  subidoPor: 'corredor',
  clienteId: 'c1',
  polizaId: null,
  siniestroId: null,
  creado: '2026-09-02T10:00:00.000Z',
  revisadoEn: null,
}

test('una lista ok se lee entera, incluido el «pedido» sin fichero', () => {
  const r = interpretarDocumentos(200, { estado: 'ok', documentos: [DOC] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.documentos.length, 1)
  assert.equal(r.documentos[0].estado, 'pedido')
  assert.equal(r.documentos[0].nombre, null)
})

test('🚨 lista vacía con estado ok SÍ es «no hay documentos»; sin lista NO lo es', () => {
  const vacia = interpretarDocumentos(200, { estado: 'ok', documentos: [] })
  assert.equal(vacia.estado, 'ok')
  if (vacia.estado === 'ok') assert.deepEqual(vacia.documentos, [])
  // `documentos` que no es una lista → error, nunca []
  assert.deepEqual(interpretarDocumentos(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.equal(leerDocumentos(null), null)
})

test('sin configurar, secreto rechazado y error de asegura no se confunden', () => {
  assert.deepEqual(interpretarDocumentos(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarDocumentos(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarDocumentos(200, { estado: 'error', motivo: 'no se pudo leer la tabla' }), {
    estado: 'error',
    motivo: 'no se pudo leer la tabla',
  })
})

test('un tipo o estado desconocido no revienta: cae a otro/recibido', () => {
  const r = leerDocumentos([{ ...DOC, tipo: 'raro', estado: 'raro', subidoPor: 'bot' }])
  assert.equal(r?.[0].tipo, 'otro')
  assert.equal(r?.[0].estado, 'recibido')
  assert.equal(r?.[0].subidoPor, 'corredor')
})
