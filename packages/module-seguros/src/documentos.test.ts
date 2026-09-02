import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NECESARIOS_EMISION_AUTO,
  documentosQueFaltan,
  estadoDocumento,
  resumenDocumentos,
  revisarDocumento,
  tipoDocumento,
  type DocumentoResumen,
} from './documentos.ts'

const doc = (p: Partial<DocumentoResumen>): DocumentoResumen => ({
  id: 'd1',
  tipo: 'otro',
  estado: 'recibido',
  nombre: 'x.pdf',
  mime: 'application/pdf',
  bytes: 10,
  sha256: null,
  notas: null,
  subidoPor: 'corredor',
  clienteId: 'c1',
  polizaId: null,
  siniestroId: null,
  creado: '2026-09-02T00:00:00Z',
  revisadoEn: null,
  ...p,
})

test('🚨 lista null es «sin consultar», NO «ninguno»', () => {
  assert.equal(resumenDocumentos(null).estado, 'sin_consultar')
  assert.equal(resumenDocumentos([]).estado, 'ninguno')
})

test('el resumen cuenta pedidos, por revisar y revisados por separado', () => {
  const r = resumenDocumentos([
    doc({ estado: 'pedido', nombre: null, bytes: null }),
    doc({ id: 'd2' }),
    doc({ id: 'd3', estado: 'revisado' }),
  ])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual([r.pedidos, r.recibidos, r.revisados], [1, 1, 1])
  assert.match(r.titular, /1 pedido\(s\) sin recibir · 1 por revisar · 1 revisado/)
})

test('un documento «pedido» sigue FALTANDO para emitir', () => {
  const lista = [doc({ tipo: 'dni' }), doc({ id: 'd2', tipo: 'permiso_circulacion', estado: 'pedido' })]
  assert.deepEqual(documentosQueFaltan(lista, NECESARIOS_EMISION_AUTO), ['permiso_circulacion', 'ficha_tecnica'])
  assert.equal(documentosQueFaltan(null, NECESARIOS_EMISION_AUTO), null)
})

test('el fichero se revisa antes de subir: tipo, vacío y tamaño', () => {
  assert.equal(revisarDocumento({ type: 'application/pdf', size: 1000 }), null)
  assert.equal(revisarDocumento({ type: '', size: 1000, name: 'poliza.PDF' }), null)
  assert.match(revisarDocumento({ type: 'video/mp4', size: 1000 }) ?? '', /no admitido/)
  assert.match(revisarDocumento({ type: 'image/png', size: 0 }) ?? '', /vacío/)
  assert.match(revisarDocumento({ type: 'image/png', size: 11 * 1024 * 1024 }) ?? '', /máximo son 10 MB/)
})

test('valores raros de la base no revientan: caen a otro/recibido', () => {
  assert.equal(tipoDocumento('lo que sea'), 'otro')
  assert.equal(tipoDocumento('dni'), 'dni')
  assert.equal(estadoDocumento(null), 'recibido')
  assert.equal(estadoDocumento('pedido'), 'pedido')
})
