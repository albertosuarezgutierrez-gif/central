import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeRetenidas, tipoCambio, urlOportunidadesCliente } from './retenidas-aviso.ts'
import type { CambioRetenida } from '../correduria-puerto.ts'

const cambio = (o: Partial<CambioRetenida> = {}): CambioRetenida => ({
  projectId: 'P1', clienteId: 'c-1', cliente: 'Ana <b>&', compania: 'Reale', antes: 'riesgo_condicionado',
  despues: 'emitida', numeroPoliza: 'AB-123', polizaId: 'pz-1', descripcion: '', ...o,
})
const BASE = 'https://ejemplo.test'

test('sin cambios → null (aunque sigan retenidas)', () => {
  assert.equal(mensajeRetenidas({ cambios: [], siguen: 5 }, BASE), null)
})

test('liberada: nº de póliza, «ya en cartera», HTML escapado y enlace a oportunidades', () => {
  const m = mensajeRetenidas({ cambios: [cambio()], siguen: 2 }, BASE) as string
  assert.match(m, /✅/)
  assert.match(m, /nº AB-123/)
  assert.match(m, /ya en cartera/)
  assert.ok(m.includes('Ana &lt;b&gt;&amp;'))
  assert.ok(!m.includes('<b>&'))
  assert.ok(m.includes('href="https://ejemplo.test/correduria/cliente/c-1?tab=oportunidades"'))
  assert.match(m, /2 siguen retenidas/)
})

test('rechazada → ⛔; estado desconocido → «otro», nunca liberada', () => {
  const m = mensajeRetenidas({ cambios: [cambio({ despues: 'rechazada' }), cambio({ despues: 'raro', projectId: 'P2' })], siguen: 1 }, BASE) as string
  assert.match(m, /⛔/)
  assert.match(m, /🔄/)
  assert.equal(tipoCambio({ despues: null }), 'otro')
  assert.equal(tipoCambio({ despues: 'raro' }), 'otro')
  assert.match(m, /1 sigue retenida/)
})

test('con proyectos sin revisar no afirma «no queda ninguna»', () => {
  const m = mensajeRetenidas({ cambios: [cambio()], siguen: 0, errores: 2 }, BASE) as string
  assert.ok(!m.includes('No queda ninguna'))
  assert.match(m, /2 no se han podido revisar/)
  assert.match(mensajeRetenidas({ cambios: [cambio()], siguen: 0 }, BASE) as string, /No queda ninguna retenida/)
})

test('urlOportunidadesCliente codifica el id y quita la barra final', () => {
  assert.equal(urlOportunidadesCliente('a b', 'https://x.test/'), 'https://x.test/correduria/cliente/a%20b?tab=oportunidades')
})
