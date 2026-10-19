import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ADJ_MAX_POR_CORREO, adjuntosDeRespuestaLead, mimeAdjunto } from './lead-correduria-adjuntos.ts'

const RESPUESTA = { referencias: ['<lead@x.es>'], destinatarios: ['hola@grupoasegura.es'], automatico: false }
const foto = (n = 50_000, extra: object = {}) => ({ contentType: 'image/jpeg', filename: 'dni.jpg', content: Buffer.alloc(n, 1), ...extra })

test('🪤 solo se conservan en una posible respuesta de lead (hilo + buzón de la correduría, no automático)', () => {
  const p = { bytes: 10_000_000 }
  assert.equal(adjuntosDeRespuestaLead({ ...RESPUESTA, referencias: [] }, [foto()], p), null, 'correo que abre hilo')
  assert.equal(adjuntosDeRespuestaLead({ ...RESPUESTA, destinatarios: ['alberto@gmail.com'] }, [foto()], p), null, 'no iba a la correduría')
  assert.equal(adjuntosDeRespuestaLead({ ...RESPUESTA, automatico: true }, [foto()], p), null)
  assert.equal(adjuntosDeRespuestaLead(RESPUESTA, [foto()], p)?.adjuntos.length, 1)
})

test('🪤 solo fotos y PDF; ni logos de firma, ni inline, ni ejecutables', () => {
  const p = { bytes: 10_000_000 }
  const r = adjuntosDeRespuestaLead(RESPUESTA, [
    foto(2_000, { filename: 'logo.png', contentType: 'image/png' }),
    foto(50_000, { related: true }),
    { contentType: 'text/html', filename: 'x.html', content: Buffer.alloc(50_000) },
    { contentType: 'application/octet-stream', filename: 'poliza.PDF', content: Buffer.alloc(3_000) },
  ], p)
  assert.deepEqual(r?.adjuntos.map((a) => a.mime), ['application/pdf'])
  assert.equal(mimeAdjunto({ contentType: 'application/x-msdownload', filename: 'a.pdf' }), null)
})

test('topes por correo, por tamaño y por pasada: lo que no cabe se CUENTA (se dice), no desaparece', () => {
  const p = { bytes: 10_000_000 }
  const r = adjuntosDeRespuestaLead(RESPUESTA, [foto(), foto(), foto(), foto(), foto(2_500_000)], p)
  assert.equal(r?.adjuntos.length, ADJ_MAX_POR_CORREO)
  assert.equal(r?.omitidos, 2)
  const corto = { bytes: 60_000 }
  const r2 = adjuntosDeRespuestaLead(RESPUESTA, [foto(), foto()], corto)
  assert.equal(r2?.adjuntos.length, 1)
  assert.equal(r2?.omitidos, 1)
  assert.equal(corto.bytes, 10_000)
})
