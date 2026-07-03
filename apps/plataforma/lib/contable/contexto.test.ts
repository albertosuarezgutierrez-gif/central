// apps/plataforma/lib/contable/contexto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearContexto } from './formato.ts'

test('formatea candidatos con #ref y marca por revisar', () => {
  const txt = formatearContexto({
    year: 2026,
    porDestino: [{ destino: 'turistico_pisos', gastos: 1200, ingresos: 5000 }],
    candidatos: [
      { ref: '#1', movId: 'uuid-a', fecha: '2026-07-01', concepto: 'RECIBO ENDESA', importe: -66.98, destino: 'turistico_pisos', porRevisar: true },
      { ref: '#2', movId: 'uuid-b', fecha: '2026-06-30', concepto: 'BIZUM', importe: -30, destino: 'personal', porRevisar: false },
    ],
    facturas: [{ proveedor: 'IONOS', importe: 12.1, estado: 'nueva' }],
    memoria: [{ clave: 'criterio_gasto', insight: 'Meter todo el gasto en el año' }],
    historial: [],
  })
  assert.match(txt, /#1 · 2026-07-01 · RECIBO ENDESA · -66\.98€/)
  assert.match(txt, /por revisar/)
  assert.match(txt, /#2 /)
  assert.match(txt, /\[criterio_gasto\] Meter todo el gasto en el año/)
})

test('sin candidatos → texto por defecto', () => {
  const txt = formatearContexto({ year: 2026, porDestino: [], candidatos: [], facturas: [], memoria: [], historial: [] })
  assert.match(txt, /sin movimientos/)
})
