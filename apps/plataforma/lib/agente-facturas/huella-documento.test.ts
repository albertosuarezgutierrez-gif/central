import test from 'node:test'
import assert from 'node:assert/strict'
import { huellaDocumento, yaImputadoPorDocumento, esHuellaDocumento, hashContenido } from './huella-documento.ts'

// Caso real 02/11 + 03/11/2026: WhatsApp Image, 644,81 €, sin proveedor/NIF/nº, drive_url distinto.
const whatsapp = { nombreArchivo: 'WhatsApp Image 2026-11-01 at 18.10.22.jpeg', fecha: '2026-11-01', total: 644.81 }

test('caso real: mismo adjunto reprocesado (sin messageId) = misma huella y el 2º no se inserta', () => {
  const primera = huellaDocumento(whatsapp)
  const segunda = huellaDocumento({ ...whatsapp })
  assert.notEqual(primera, '')
  assert.equal(primera, segunda)
  assert.equal(yaImputadoPorDocumento(segunda, [primera]), true)
})

test('con messageId + nombre manda esa clave, y no depende de fecha/total extraídos', () => {
  const a = huellaDocumento({ ...whatsapp, messageId: '<abc@mail.gmail.com>' })
  const b = huellaDocumento({ ...whatsapp, messageId: '<abc@mail.gmail.com>', total: 644.8 })
  assert.match(a, /^msg:/)
  assert.equal(a, b)
})

test('dos facturas distintas, mismo total y nombres de archivo distintos = ambas se insertan', () => {
  const a = huellaDocumento({ nombreArchivo: 'WhatsApp Image 2026-11-01 at 18.10.22.jpeg', fecha: '2026-11-01', total: 644.81 })
  const b = huellaDocumento({ nombreArchivo: 'WhatsApp Image 2026-11-01 at 18.11.40.jpeg', fecha: '2026-11-01', total: 644.81 })
  assert.notEqual(a, b)
  assert.equal(yaImputadoPorDocumento(b, [a]), false)
})

test('sin claves fuertes y sin nombre de archivo, fecha+total solos NO bastan: huella vacía', () => {
  assert.equal(huellaDocumento({ fecha: '2026-11-01', total: 644.81 }), '')
  assert.equal(huellaDocumento({ nombreArchivo: 'x.jpg', total: 10 }), '')
})

test('huella vacía no se compara con nada (ni con otra vacía)', () => {
  assert.equal(yaImputadoPorDocumento('', ['', null, undefined]), false)
})

test('hash de contenido: mismo archivo con otro nombre = mismo documento', () => {
  const buf = new Uint8Array([1, 2, 3, 4])
  const a = huellaDocumento({ nombreArchivo: 'a.pdf', hashContenido: hashContenido(buf) })
  const b = huellaDocumento({ nombreArchivo: 'b.pdf', hashContenido: hashContenido(buf) })
  assert.match(a, /^file:/)
  assert.equal(a, b)
  assert.notEqual(a, huellaDocumento({ nombreArchivo: 'a.pdf', hashContenido: hashContenido(new Uint8Array([9])) }))
})

test('factura con nº, proveedor, fecha y total: estable ante formato; otro nº = otra factura', () => {
  const f = { proveedor: 'Anthropic, PBC', numero_factura: 'INV-1', fecha: '2026-09-02', total: 170 }
  assert.equal(huellaDocumento(f), huellaDocumento({ ...f, proveedor: 'anthropic pbc', numero_factura: 'inv 1' }))
  assert.notEqual(huellaDocumento(f), huellaDocumento({ ...f, numero_factura: 'INV-2' }))
})

test('esHuellaDocumento distingue la huella de documento de la del proveedor', () => {
  assert.equal(esHuellaDocumento(huellaDocumento(whatsapp)), true)
  assert.equal(esHuellaDocumento('IE4276970QH'), false)
  assert.equal(esHuellaDocumento(''), false)
})
