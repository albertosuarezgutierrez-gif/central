// Tests de la clasificación de IVA de proveedores extranjeros. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarProveedorIva, requiereAutoliquidacion, calcularAutoliquidacion } from './iva-autoliquidacion.ts'

test('clasifica por país / VAT / nombre', () => {
  assert.equal(clasificarProveedorIva({ proveedor: 'X', pais: 'IE' }), 'intracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'X', pais: 'US' }), 'extracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'X', nif: 'NL853746333B01' }), 'intracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'X', nif: 'B41234567' }), 'nacional')
  assert.equal(clasificarProveedorIva({ proveedor: 'Anthropic Ireland, Limited' }), 'intracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'Booking.com B.V.' }), 'intracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'Vercel Inc.' }), 'extracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'OpenRouter, Inc' }), 'extracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'PriceLabs Revenue Inc.' }), 'extracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'Anthropic, PBC' }), 'extracomunitario')
  assert.equal(clasificarProveedorIva({ proveedor: 'IONOS Cloud S.L.U.' }), 'nacional')
  assert.equal(clasificarProveedorIva({ proveedor: 'DIGI Spain Telecom, S.A.U.' }), 'nacional')
  assert.equal(clasificarProveedorIva({ proveedor: 'pepephone' }), null)
  assert.equal(clasificarProveedorIva({ proveedor: null }), null)
})

test('requiereAutoliquidacion: solo extranjero con cuota 0; cuota null = no se sabe', () => {
  const b = { proveedor: 'Anthropic Ireland, Limited', importe: 100, fecha: '2026-08-01' }
  assert.equal(requiereAutoliquidacion({ ...b, cuota_iva: 0 }), true)
  assert.equal(requiereAutoliquidacion({ ...b, cuota_iva: null }), null)
  assert.equal(requiereAutoliquidacion({ ...b, cuota_iva: 21 }), false)
  assert.equal(requiereAutoliquidacion({ ...b, proveedor: 'IONOS Cloud S.L.U.', cuota_iva: 0 }), false)
  assert.equal(requiereAutoliquidacion({ ...b, proveedor: 'pepephone', cuota_iva: 0 }), null)
})

test('calcularAutoliquidacion agrupa por trimestre, separa UE/extra, ignora rechazadas', () => {
  const r = calcularAutoliquidacion([
    { proveedor: 'Anthropic Ireland, Limited', importe: 100, cuota_iva: 0, fecha: '2026-07-10', estado: 'pagada' },
    { proveedor: 'Anthropic Ireland, Limited', importe: 50, cuota_iva: 0, fecha: '2026-09-30', estado: 'pendiente_revision' },
    { proveedor: 'Vercel Inc.', importe: 20, cuota_iva: 0, fecha: '2026-08-01', estado: 'pendiente_revision' },
    { proveedor: 'Vercel Inc.', importe: 999, cuota_iva: 0, fecha: '2026-08-01', estado: 'rechazada' },
    { proveedor: 'Vercel Inc.', importe: 10, cuota_iva: 0, fecha: '2026-10-01' },
    { proveedor: 'Vercel Inc.', importe: 10, cuota_iva: null, fecha: '2026-08-01' },
    { proveedor: 'IONOS Cloud S.L.U.', importe: 10, cuota_iva: 0, fecha: '2026-08-01' },
  ], 2026)
  const t3 = r.trimestres[2]
  assert.equal(t3.baseUE, 150); assert.equal(t3.cuotaUE, 31.5)
  assert.equal(t3.baseExtra, 20); assert.equal(t3.cuotaExtra, 4.2)
  assert.equal(t3.base, 170); assert.equal(t3.cuota, 35.7)
  assert.equal(t3.facturas.length, 3)
  assert.equal(r.trimestres[3].base, 10)
  assert.equal(r.sinClasificar, 1)
})
