import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { lineasJustificante, pdfDocumentoFirmado } from './documento-firmado-pdf.ts'

const ev = {
  firmante: 'María López',
  metodo: 'otp_email',
  selloTiempo: '2026-09-24T08:15:00Z',
  docHash: 'a'.repeat(64),
  ficheroOriginal: 'nombramiento-mediador-0732.txt',
}

test('🪤 el justificante dice quién, cómo, cuándo y qué huella, y qué fichero la respalda', () => {
  const l = lineasJustificante(ev).join('\n')
  assert.match(l, /Firmante: María López/)
  assert.match(l, /código de un solo uso enviado al correo/)
  assert.match(l, /24\/09\/2026, 10:15:00 \(hora de Madrid\)/)
  assert.match(l, new RegExp(`Huella SHA-256 del texto firmado: ${'a'.repeat(64)}`))
  assert.match(l, /fichero adjunto «nombramiento-mediador-0732\.txt»/)
})

test('el PDF se genera y aguanta un texto largo y caracteres fuera de la fuente', async () => {
  const texto = 'A la atención de Mapfre\n\nAsunto: nombramiento de mediador\n\n' + 'Línea con acentos ñ € y emoji 🙂. '.repeat(200)
  const bytes = await pdfDocumentoFirmado(texto, ev)
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  const doc = await PDFDocument.load(bytes)
  assert.ok(doc.getPageCount() >= 2, 'el texto largo pasa de página en vez de salirse')
  assert.equal(doc.getTitle(), 'nombramiento de mediador')
})
