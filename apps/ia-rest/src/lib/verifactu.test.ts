// Adaptador VeriFactu de ia.rest sobre @central/core-fiscal: emisión → fila de BD → XML, sin perder la huella.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirFactura, construirAnulacion, eslabonDeFila, generarXmlLROE, registroDeFactura, numSerieIaRest,
} from './verifactu.ts'
import type { FacturaVeri } from './verifactu.ts'

const BASE = {
  nif_emisor: 'B12345674', razon_social: 'Bar Pepe SL', numero_serie: 'T',
  comanda_id: 'c1', mesa_label: 'Mesa 1', num_items: 2,
}

/** Lo que devuelve Supabase de una columna timestamptz: el instante en UTC, sin el huso original. */
function comoFilaBd(f: FacturaVeri): FacturaVeri {
  return { ...f, fecha_expedicion: new Date(f.fecha_expedicion).toISOString().replace('.000Z', '+00:00') }
}

test('construirFactura: ticket F2 en hora de Madrid aunque el servidor esté en UTC (cambia el día)', () => {
  const f = construirFactura({ ...BASE, numero_factura: 1, anterior: null, importe_total: 22, ahora: new Date('2026-07-15T22:30:05Z') })
  assert.equal(f.fecha_expedicion, '2026-07-16T00:30:05+02:00')
  assert.equal(f.base_imponible, 20)
  assert.equal(f.cuota_iva, 2)
  assert.equal(f.importe_total, 22)
  assert.equal(f.primer_registro, true)
  assert.equal(f.huella_anterior, null)
  assert.match(f.huella, /^[0-9A-F]{64}$/)
  assert.equal(f.qr_data,
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345674&numserie=T-00000001&fecha=16-07-2026&importe=22.00')
})

test('cadena de dos tickets → fila de BD → XML: la huella guardada se recalcula y el XML encadena bien', () => {
  const f1 = construirFactura({ ...BASE, numero_factura: 1, anterior: null, importe_total: 12.5, ahora: new Date('2026-03-01T12:00:00Z') })
  const fila1 = comoFilaBd(f1)
  const f2 = construirFactura({ ...BASE, numero_factura: 2, anterior: eslabonDeFila(fila1), importe_total: 8.8, ahora: new Date('2026-03-01T12:05:00Z') })
  assert.equal(f2.huella_anterior, f1.huella)
  assert.equal(f2.primer_registro, false)

  const fila2 = comoFilaBd(f2)
  const xml = generarXmlLROE({ factura: fila2, nif_emisor: BASE.nif_emisor, razon_social: BASE.razon_social, anterior: eslabonDeFila(fila1) })
  assert.ok(xml.includes(`<sum1:Huella>${f2.huella}</sum1:Huella>`))
  assert.ok(xml.includes('<sum1:RegistroAnterior><sum1:IDEmisorFactura>B12345674</sum1:IDEmisorFactura><sum1:NumSerieFactura>T-00000001</sum1:NumSerieFactura><sum1:FechaExpedicionFactura>01-03-2026</sum1:FechaExpedicionFactura>'))
  assert.ok(xml.includes('<sum1:TipoFactura>F2</sum1:TipoFactura>'))
  assert.ok(xml.includes('<sum1:CuotaTotal>0.80</sum1:CuotaTotal><sum1:ImporteTotal>8.80</sum1:ImporteTotal>'))
  assert.ok(xml.includes('<sum1:FechaHoraHusoGenRegistro>2026-03-01T13:05:00+01:00</sum1:FechaHoraHusoGenRegistro>'))
  assert.ok(!xml.includes('TipoRectificativa'))
})

test('registroDeFactura: una fila alterada o mal encadenada NO genera XML', () => {
  const f1 = construirFactura({ ...BASE, numero_factura: 1, anterior: null, importe_total: 10, ahora: new Date('2026-03-01T12:00:00Z') })
  assert.throws(() => registroDeFactura({ ...comoFilaBd(f1), importe_total: 11, base_imponible: 10, cuota_iva: 1 }, null), /huella guardada/)
  assert.throws(() => registroDeFactura(comoFilaBd(f1), { idEmisor: 'B12345674', numSerie: 'T-00000000', fechaExpedicion: '2026-03-01', huella: f1.huella }), /eslabón/)
})

test('construirAnulacion: huella recalculable desde la fila (fecha_anulacion = mismo instante)', () => {
  const f1 = construirFactura({ ...BASE, numero_factura: 7, anterior: null, importe_total: 10, ahora: new Date('2026-03-01T12:00:00Z') })
  const fila = comoFilaBd(f1)
  const ahora = new Date('2026-03-02T09:00:00.456Z')
  const a = construirAnulacion({ factura: fila, anterior: eslabonDeFila(fila), ahora })
  const b = construirAnulacion({ factura: fila, anterior: eslabonDeFila(fila), ahora: new Date(ahora.toISOString()) })
  assert.equal(a.huella, b.huella)
  assert.equal(a.facturaAnulada.numSerie, numSerieIaRest('T', 7))
  assert.notEqual(a.huella, f1.huella)
})
