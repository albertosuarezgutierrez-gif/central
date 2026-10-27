import { test } from 'node:test'
import assert from 'node:assert'
import { generarPdfFactura } from './pdf.ts'
import { EMISOR_FACTURAS_HUESPED } from './emisor.ts'

const BASE = {
  numeroCompleto: 'HS-2026-0001', fechaExpedicion: '2026-10-27', emisor: EMISOR_FACTURAS_HUESPED,
  receptor: { tipo: 'particular' as const, nombre: 'Łukasz Żółć 😀', nif: 'PL1234567890', pais: 'PL', email: 'a@b.pl', direccion: { pais: 'PL', lineas: 'ul. Długa 5', ciudad: 'Gdańsk', cp: '80-001' } },
  concepto: 'Servicio de alojamiento turístico en «House sevillana» (3 noches) · reserva 157416681',
  estanciaDesde: '2026-10-01', estanciaHasta: '2026-10-04', total: 363, base: 330, tipoIva: 10, cuota: 33, mencionIva: null,
}

test('genera un PDF válido aunque el nombre traiga letras/emoji fuera de WinAnsi', async () => {
  const pdf = await generarPdfFactura(BASE, { borrador: false })
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-')
  assert.ok(pdf.length > 1500)
})

test('borrador sin número ni IVA configurado también se genera', async () => {
  const pdf = await generarPdfFactura({ ...BASE, numeroCompleto: null, fechaExpedicion: null, base: null, cuota: null, tipoIva: null }, { borrador: true })
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-')
})

test('determinista para la misma factura (se genera una vez y se guarda; regenerar daría lo mismo)', async () => {
  const a = await generarPdfFactura(BASE, { borrador: false })
  const b = await generarPdfFactura(BASE, { borrador: false })
  assert.equal(Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64'))
})
