// Tests de la lógica PURA del agente de impagos. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diasVencida, escalonAEnviar, textoRecordatorio, resumenEmpresaTexto, type FacturaImpago } from './impagos.ts'

test('diasVencida cuenta días enteros', () => {
  assert.equal(diasVencida('2026-06-01', '2026-06-04'), 3)
  assert.equal(diasVencida('2026-06-10', '2026-06-10'), 0)
  assert.equal(diasVencida('2026-06-20', '2026-06-14'), -6) // aún no vence
})

test('escalonAEnviar: nada antes del primer escalón', () => {
  assert.equal(escalonAEnviar(0, []), null)
  assert.equal(escalonAEnviar(2, []), null)
})

test('escalonAEnviar: escalado +3/+10/+21 sin repetir ni bajar', () => {
  assert.equal(escalonAEnviar(3, []), 1)
  assert.equal(escalonAEnviar(10, [1]), 2)
  assert.equal(escalonAEnviar(21, [1, 2]), 3)
  assert.equal(escalonAEnviar(5, [1]), null)   // sigue en zona del 1, ya enviado
  assert.equal(escalonAEnviar(21, [3]), null)  // último ya enviado
  assert.equal(escalonAEnviar(30, []), 3)      // factura ya muy vencida → salta al último
})

test('textoRecordatorio incluye factura, importe y cliente', () => {
  const f: FacturaImpago = { numero_factura: 'F-2026-0007', cliente_nombre: 'Hotel Sol', total: 242, fecha_vencimiento: '2026-06-01' }
  const { asunto, texto } = textoRecordatorio('Sique Brilla', f, 1)
  assert.match(asunto, /F-2026-0007/)
  assert.match(texto, /Hotel Sol/)
  assert.match(texto, /242/)
  assert.match(texto, /Sique Brilla/)
})

test('resumenEmpresaTexto suma el total adeudado', () => {
  const items: FacturaImpago[] = [
    { numero_factura: 'F-1', cliente_nombre: 'A', total: 100, fecha_vencimiento: '2026-06-01' },
    { numero_factura: 'F-2', cliente_nombre: 'B', total: 250, fecha_vencimiento: '2026-06-02' },
  ]
  const { asunto, texto } = resumenEmpresaTexto('Sique Brilla', items)
  assert.match(asunto, /2 factura/)
  assert.match(texto, /F-1/)
  assert.match(texto, /F-2/)
  assert.match(texto, /350/) // total
})
