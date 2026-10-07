import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPanelControl, interpretarProductividad, textoMotivoPendiente, type RespuestaAcuerdos } from './acuerdos-asegura.ts'

// Datos FICTICIOS (ninguna cifra de ningún acuerdo real).
const ok = (extra: Record<string, unknown> = {}) => ({
  estado: 'ok', anio: 2026, periodo: { desde: '2026-01-01', hasta: '2026-12-31' }, hoy: '2026-10-07',
  produccion: [], objetivos: [], ...extra,
})

test('interpretarProductividad: sin cartera en la respuesta = null (no «sin cartera»)', () => {
  const r = interpretarProductividad(200, ok())
  assert.ok(r.estado === 'ok' && r.cartera === null && r.carteraSinCompania === null)
})

test('interpretarProductividad: una fila de cartera ilegible invalida TODA la cartera', () => {
  const buena = { companiaCodigoDgs: 'C1', ramo: 'hogar', polizas: 2, prima: 10, sinPrima: 0 }
  const r1 = interpretarProductividad(200, ok({ cartera: [buena] }))
  assert.ok(r1.estado === 'ok' && r1.cartera?.length === 1)
  const r2 = interpretarProductividad(200, ok({ cartera: [buena, { ...buena, polizas: 'x' }] }))
  assert.ok(r2.estado === 'ok' && r2.cartera === null)
})

test('textoMotivoPendiente: conocido traducido, desconocido tal cual', () => {
  assert.equal(textoMotivoPendiente('sin_clave'), 'sin clave asignada')
  assert.equal(textoMotivoPendiente('inventado'), 'inventado')
})

test('construirPanelControl: acuerdos ilegibles → null; cartera ilegible → pólizas null', () => {
  assert.equal(construirPanelControl(null, null), null)
  assert.equal(construirPanelControl({ estado: 'error', motivo: 'x' }, null), null)
  const ra: RespuestaAcuerdos = {
    estado: 'ok', claves: [], conflictosCodigos: [],
    acuerdos: [{
      id: 'a1', companiaCodigoDgs: 'C1', fuente: { valor: 'directo' }, fuenteNombre: null, claveId: null,
      vigenciaDesde: '2026-01-01', vigenciaHasta: null, requisitosApertura: null, letraPequena: null,
      documentoFuente: 'doc', revisadoAt: null,
      comisiones: [{ id: 'l1', ramo: 'hogar', ramoTexto: 'Hogar', producto: null, modalidad: null, pctNp: 11, pctCartera: null, notas: null }],
      objetivos: [],
    }],
  }
  const p = construirPanelControl(ra, { estado: 'error', motivo: 'x' })!
  assert.equal(p.ramos[0].candidatas[0].polizas, null)
  assert.equal(p.ramos[0].candidatas[0].sinCotejar, true)
  assert.equal(p.ramos[0].recomendada, 'C1')
})
