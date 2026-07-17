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

test('bloque "En qué gastas de verdad" (consejos): personal por subcategoría + negocio por destino', () => {
  const txt = formatearContexto({
    year: 2026,
    porDestino: [],
    candidatos: [],
    facturas: [], memoria: [], historial: [],
    mayoresGastos: [
      { destino: 'personal', subcategoria: 'restaurantes', gastado: 1234, n: 20 },
      { destino: 'turistico_pisos', subcategoria: null, gastado: 5000, n: 40 },
      { destino: 'personal', subcategoria: null, gastado: 300, n: 1 },
    ],
  })
  assert.match(txt, /En qué gastas de verdad 2026/)
  assert.match(txt, /Personal · restaurantes: 1\.234€ \(20 mov\.\)/)
  assert.match(txt, /Pisos turísticos: 5\.000€/)
  assert.match(txt, /Personal · sin clasificar: 300€/)   // n=1 → sin "(N mov.)"
  assert.doesNotMatch(txt, /Personal · sin clasificar: 300€ \(/)
})

test('sin mayoresGastos → no aparece el bloque de consejos (turnos normales)', () => {
  const txt = formatearContexto({ year: 2026, porDestino: [], candidatos: [], facturas: [], memoria: [], historial: [] })
  assert.doesNotMatch(txt, /En qué gastas de verdad/)
})
