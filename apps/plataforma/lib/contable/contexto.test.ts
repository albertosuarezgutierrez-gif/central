// apps/plataforma/lib/contable/contexto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearContexto } from './formato.ts'

test('formatea destinos, movimientos, memoria e historial', () => {
  const txt = formatearContexto({
    year: 2026,
    porDestino: [{ destino: 'turistico_pisos', gastos: 1200, ingresos: 5000 }],
    ultimos: [{ fecha: '2026-07-01', concepto: 'RECIBO ENDESA', importe: -66.98, destino: 'turistico_pisos' }],
    facturas: [{ proveedor: 'IONOS', importe: 12.1, estado: 'nueva' }],
    memoria: [{ clave: 'criterio_gasto', insight: 'Meter todo el gasto en el año' }],
    historial: [{ rol: 'user', mensaje: 'hola' }, { rol: 'assistant', mensaje: 'buenas' }],
  })
  assert.match(txt, /Pisos turísticos: gastos 1200€, ingresos 5000€/)
  assert.match(txt, /RECIBO ENDESA/)
  assert.match(txt, /IONOS · 12\.10€ · nueva/)
  assert.match(txt, /\[criterio_gasto\] Meter todo el gasto en el año/)
  assert.match(txt, /Alberto: hola/)
})

test('secciones vacías → textos por defecto, sin bloque de conversación', () => {
  const txt = formatearContexto({ year: 2026, porDestino: [], ultimos: [], facturas: [], memoria: [], historial: [] })
  assert.match(txt, /sin movimientos este año/)
  assert.match(txt, /aún no sé nada de tu rutina/)
  assert.doesNotMatch(txt, /# Conversación reciente/)
})
