// apps/plataforma/lib/subastas/rasterizar-pdf.test.ts
//
// Guardián del ESCALÓN que rescata un PDF sin capa de texto (02/09/2026). Antes de este test la
// cadena estaba probada solo por el lado del TEXTO del mensaje: si el rasterizador dejaba de
// devolver páginas, `extraerDesdeBuffer` caería en `ocr:'sin_paginas'` —«no he podido mirarlo»— y
// la suite seguiría en verde, porque ese es un desenlace legítimo. O sea: la regresión sería
// invisible y se leería como un documento ilegible, que es justo la mentira que el PR arregla.
//
// El fixture se FABRICA aquí en vez de commitear un .pdf binario: es una página cuyo único
// contenido es un JPEG (lo que produce un escáner o un «imprimir a PDF» desde una foto), y así el
// test declara qué se está probando en vez de esconderlo en un blob.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { rasterizarPdf } from './rasterizar-pdf.ts'

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754">
  <rect width="100%" height="100%" fill="white"/>
  <text x="80" y="440" font-family="sans-serif" font-size="40" fill="black">TOTAL: 84,50 EUR</text>
</svg>`

/** PDF de una página SIN una sola instrucción de texto: solo un XObject de imagen DCTDecode. */
async function pdfEscaneado(): Promise<Buffer> {
  const jpg = await sharp(Buffer.from(SVG)).jpeg({ quality: 88 }).toBuffer()
  const { width, height } = await sharp(jpg).metadata()

  const objetos: Record<number, string> = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
  }
  const contenido = 'q 595 0 0 842 0 0 cm /Im0 Do Q'

  const partes: Buffer[] = []
  const offsets: Record<number, number> = {}
  let off = 0
  const push = (b: Buffer) => { partes.push(b); off += b.length }

  push(Buffer.from('%PDF-1.4\n'))
  for (const n of [1, 2, 3]) {
    offsets[n] = off
    push(Buffer.from(`${n} 0 obj\n${objetos[n]}\nendobj\n`))
  }
  offsets[4] = off
  push(Buffer.from(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`))
  push(jpg)
  push(Buffer.from('\nendstream\nendobj\n'))
  offsets[5] = off
  push(Buffer.from(`5 0 obj\n<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream\nendobj\n`))

  const xrefOff = off
  let xref = 'xref\n0 6\n0000000000 65535 f \n'
  for (const n of [1, 2, 3, 4, 5]) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n'
  push(Buffer.from(xref))
  push(Buffer.from(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF\n`))

  return Buffer.concat(partes)
}

// La premisa del fixture: si esto dejara de ser cierto, el resto del test no probaría nada.
test('el fixture NO tiene capa de texto (pdf-parse no saca ni un carácter)', async () => {
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const r = await pdfParse(await pdfEscaneado())
  assert.equal(String(r?.text ?? '').trim(), '')
  assert.equal(r.numpages, 1)          // se ABRE bien: no es un PDF corrupto, es uno escaneado
})

test('rasterizarPdf rescata la página de un PDF escaneado', async () => {
  const paginas = await rasterizarPdf(await pdfEscaneado(), 4)
  assert.equal(paginas.length, 1)
  assert.equal(paginas[0].mediaType, 'image/jpeg')
  // Una página en blanco comprime a casi nada: el umbral separa «renderizó» de «devolvió folio».
  assert.ok(paginas[0].data.length > 5_000, `base64 demasiado corto: ${paginas[0].data.length}`)
})

test('maxPaginas acota lo que se manda a visión (cada página se paga)', async () => {
  assert.equal((await rasterizarPdf(await pdfEscaneado(), 0)).length, 0)
})

// Un PDF que no se puede abrir NO revienta: devuelve [] y el llamador lo cuenta como
// `ocr:'sin_paginas'` (= no se ha mirado), nunca como «el documento no pone nada».
test('un PDF ilegible degrada a [] sin lanzar', async () => {
  assert.deepEqual(await rasterizarPdf(Buffer.from('esto no es un pdf'), 4), [])
})
