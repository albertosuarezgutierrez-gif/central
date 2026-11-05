// Factura imprimible: QR + leyenda VeriFactu, dinero en formato español, escapado y comprobación fiscal fail-closed (core-receipts).
// Visto fallar (04/11/2026): quitar la línea «Total factura» del HTML → rojo (assertFiscalIntegrity lanza por el total ausente).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEYENDA_VERIFACTU } from '@central/core-fiscal'
import { renderFacturaHtml, type FacturaImprimible } from '../lib/factura-html.ts'

const base = (o: Partial<FacturaImprimible> = {}): FacturaImprimible => ({
  numSerie: 'F2026-000001', tipo: 'F1', fechaExpedicion: '2026-11-04',
  emisor: { razon: 'Talleres de Prueba S.L.', nif: '12345678Z', domicilio: 'Calle Cañada Real, 14, 41900, Camas, Sevilla', nombreComercial: 'Taller' },
  cliente: { nombre: 'Taxis <Ana>', nif: '87654321X', domicilio: 'Calle Mayor, 1' },
  rectifica: null,
  lineas: [{ descripcion: 'Cambio de aceite <script>', cantidad: 4500, unidad: 'ml', baseCent: 181_701, ivaPuntosBasicos: 1900 }],
  desglose: [{ ivaPuntosBasicos: 1900, baseCent: 181_701, cuotaCent: 34_523 }],
  baseCent: 181_701, cuotaIvaCent: 34_523, totalCent: 216_224,
  huella: 'A'.repeat(64), qrUrl: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=12345678Z&numserie=F2026-000001',
  qrDataUrl: 'data:image/png;base64,AAAA', verifactu: true, estado: 'emitida', estadoEnvio: 'no_enviado', pie: '', cobros: [], ...o,
})

test('lleva QR, leyenda VeriFactu, huella, NIF de las dos partes e importes con formato español', () => {
  const h = renderFacturaHtml(base())
  assert.match(h, /<img src="data:image\/png;base64,AAAA" alt="Código QR tributario"\/>/)
  assert.ok(h.includes(LEYENDA_VERIFACTU))
  assert.ok(h.includes('A'.repeat(64)))
  assert.ok(h.includes('NIF 12345678Z') && h.includes('NIF 87654321X'))
  assert.ok(h.includes('2.162,24€'), 'total con punto de miles y € detrás')
  assert.ok(h.includes('4,5 l'))
  assert.match(h, /NO remitido a la AEAT/, 'mientras no se envíe, se dice')
})

test('escapa el texto (sin inyección de HTML)', () => {
  const h = renderFacturaHtml(base())
  assert.doesNotMatch(h, /<script>/)
  assert.ok(h.includes('Taxis &lt;Ana&gt;'))
})

test('simplificada sin cliente identificado y rectificativa negativa', () => {
  const s = renderFacturaHtml(base({ tipo: 'F2', cliente: { nombre: null, nif: null, domicilio: null } }))
  assert.match(s, /Factura simplificada F2026-000001/)
  assert.match(s, /Cliente no identificado/)
  const r = renderFacturaHtml(base({
    tipo: 'R1', numSerie: 'R2026-000001', rectifica: { numSerie: 'F2026-000001', modo: 'I', motivo: 'abono' },
    lineas: [{ descripcion: 'x', cantidad: 1, unidad: 'ud', baseCent: -10_000, ivaPuntosBasicos: 1900 }],
    desglose: [{ ivaPuntosBasicos: 1900, baseCent: -10_000, cuotaCent: -1_900 }], baseCent: -10_000, cuotaIvaCent: -1_900, totalCent: -11_900,
  }))
  assert.match(r, /Rectifica la factura F2026-000001 \(por diferencias\)/)
  assert.ok(r.includes('-119,00€'))
})

test('sin modalidad VERI*FACTU no se imprime la leyenda', () => {
  assert.ok(!renderFacturaHtml(base({ verifactu: false })).includes(LEYENDA_VERIFACTU))
})
