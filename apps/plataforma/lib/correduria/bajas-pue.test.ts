import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarBajasPue, mensajeBajasPue, type BajaPue } from './bajas-pue.ts'

const baja = (o: Partial<BajaPue> = {}): BajaPue => ({
  anulacionId: 'a1', polizaId: 'p1', clienteId: 'c1', cliente: 'Ana <Pérez>', desde: '2026-09-29T10:00:00Z',
  ficha: {
    url: 'https://e-pacallianz.com/ngx-osn-ui-service/initial-selection', texto: 't',
    campos: [
      { etiqueta: 'Operativa', valor: 'Anulación a vencimiento - Póliza Individual NO Vida' },
      { etiqueta: 'Nº de póliza', valor: '123' }, { etiqueta: 'Fecha de efecto de la baja', valor: '05/11/2026' },
    ],
  },
  documentoId: null, esperaEmision: false, ...o,
})

test('interpretar: ok con bajas; un fallo NUNCA es lista vacía', () => {
  const j = { estado: 'ok', bajas: [baja()] }
  const r = interpretarBajasPue(200, j)
  assert.equal(r.estado, 'ok')
  assert.equal(interpretarBajasPue(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.equal(interpretarBajasPue(200, null).estado, 'error')
  assert.equal(interpretarBajasPue(404, null).estado, 'error')
})

test('interpretar: una baja ilegible hace error, no se esconde', () => {
  assert.equal(interpretarBajasPue(200, { estado: 'ok', bajas: [baja(), { anulacionId: 'x' }] }).estado, 'error')
})

test('interpretar: esperaEmision ausente se trata como que espera (conservador)', () => {
  const { esperaEmision: _e, ...sin } = baja()
  const r = interpretarBajasPue(200, { estado: 'ok', bajas: [sin] })
  assert.equal(r.estado === 'ok' && r.bajas[0]!.esperaEmision, true)
})

test('mensaje: vacío o solo bajas en espera → null, nunca «0 pendientes»', () => {
  assert.equal(mensajeBajasPue([]), null)
  assert.equal(mensajeBajasPue([baja({ esperaEmision: true })]), null)
})

test('mensaje: cliente, póliza, fecha, operativa, enlace al PUE, ficha y llamada a tramitar; HTML escapado', () => {
  const m = mensajeBajasPue([baja()], 'https://plataforma.test')
  assert.ok(m)
  assert.match(m, /Ana &lt;Pérez&gt;/)
  assert.match(m, /póliza 123/)
  assert.match(m, /05\/11\/2026/)
  assert.match(m, /Anulación a vencimiento - Póliza Individual NO Vida/)
  assert.match(m, /e-pacallianz\.com\/ngx-osn-ui-service\/initial-selection/)
  assert.match(m, /plataforma\.test\/correduria\/cliente\/c1/)
  assert.match(m, /Tramítala en el PUE y márcala como tramitada/)
})
