import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIMES_DOCUMENTO,
  NECESARIOS_EMISION_AUTO,
  documentosQueFaltan,
  estadoDocumento,
  mimeDocumento,
  mimeParaServir,
  resumenDocumentos,
  revisarDocumento,
  tipoAdjuntoParte,
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
  assert.match(revisarDocumento({ type: 'application/x-msdownload', size: 1000 }) ?? '', /no admitido/)
  assert.match(revisarDocumento({ type: 'image/png', size: 0 }) ?? '', /vacío/)
  assert.match(revisarDocumento({ type: 'image/png', size: 11 * 1024 * 1024 }) ?? '', /máximo son 10 MB/)
})

test('🚨 el vídeo se rechaza DICIENDO por qué, no como «tipo raro»', () => {
  // Es lo primero que graba quien tiene un accidente delante. Un «no admitido»
  // a secas le deja creyendo que ha hecho algo mal, en vez de entender que le
  // estamos pidiendo otra cosa.
  const motivo = revisarDocumento({ type: 'video/mp4', size: 1000, name: 'golpe.mp4' }) ?? ''
  assert.match(motivo, /vídeos/)
  assert.match(motivo, /fotos/)
  assert.doesNotMatch(motivo, /no admitido/)
})

test('🚨 el mime que se guarda sale de la lista, nunca del navegador', () => {
  // Un `text/html` guardado tal cual y devuelto con ese Content-Type se ejecuta
  // en nuestro dominio. `mimeDocumento` es la única puerta.
  assert.equal(mimeDocumento({ type: 'text/html', name: 'foto.png' }), null)
  assert.equal(mimeDocumento({ type: 'IMAGE/JPEG', name: 'a.jpg' }), 'image/jpeg')
  assert.equal(mimeDocumento({ type: 'image/png', name: 'a.png' }), 'image/png')
  // Navegadores que no saben decir el tipo de un PDF: pasa de verdad.
  assert.equal(mimeDocumento({ type: '', name: 'poliza.PDF' }), 'application/pdf')
  assert.equal(mimeDocumento({ type: 'application/octet-stream', name: 'p.pdf' }), 'application/pdf')
  assert.equal(mimeDocumento({ type: 'application/octet-stream', name: 'p.exe' }), null)
})

test('el tipo de un adjunto de parte sale del MIME, no del nombre', () => {
  assert.equal(tipoAdjuntoParte('application/pdf'), 'parte_siniestro')
  assert.equal(tipoAdjuntoParte('image/jpeg'), 'foto')
  assert.equal(tipoAdjuntoParte('image/heic'), 'foto')
  // `IMG_0421.pdf` no es una foto: manda el mime resuelto.
  assert.equal(tipoAdjuntoParte(mimeDocumento({ type: '', name: 'IMG_0421.pdf' })!), 'parte_siniestro')
})

test('valores raros de la base no revientan: caen a otro/recibido', () => {
  assert.equal(tipoDocumento('lo que sea'), 'otro')
  assert.equal(tipoDocumento('dni'), 'dni')
  assert.equal(estadoDocumento(null), 'recibido')
  assert.equal(estadoDocumento('pedido'), 'pedido')
})

test('🚨 `mimeParaServir` no deja volver un tipo ejecutable a la cabecera', () => {
  // El caso del ataque: una fila escrita antes de que `guardarDocumento`
  // normalizara (o por cualquier vía futura que se lo salte) lleva el tipo que
  // eligió quien subió el fichero. Devolverlo tal cual con los bytes es un XSS
  // en nuestro propio dominio.
  assert.equal(mimeParaServir('text/html'), 'application/octet-stream')
  assert.equal(mimeParaServir('image/svg+xml'), 'application/octet-stream')
  assert.equal(mimeParaServir('application/xhtml+xml'), 'application/octet-stream')
  // «No se sabe» tampoco se adivina, y no se pierde el acceso al fichero: sale
  // como descarga opaca.
  assert.equal(mimeParaServir(null), 'application/octet-stream')
  assert.equal(mimeParaServir(''), 'application/octet-stream')
  // Lo que SÍ está en la lista vuelve entero, normalizado.
  assert.equal(mimeParaServir('  APPLICATION/PDF '), 'application/pdf')
  for (const m of MIMES_DOCUMENTO) assert.equal(mimeParaServir(m), m)
})

test('🚨 al servir NO hay atajo por nombre: eso solo vale al subir', () => {
  // `mimeDocumento` reetiqueta un `.pdf` sin tipo fiable porque el navegador no
  // sabe decirlo; al leer no hay navegador que disculpar, hay una fila ya
  // escrita, y fiarse del nombre volvería a meter el tipo del atacante.
  assert.equal(mimeDocumento({ type: 'text/html', name: 'poliza.pdf' }), 'application/pdf')
  assert.equal(mimeParaServir('text/html'), 'application/octet-stream')
})
