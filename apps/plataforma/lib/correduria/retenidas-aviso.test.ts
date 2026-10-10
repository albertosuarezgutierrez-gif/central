import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esPasadaDeManana, mensajeRetenidas, tipoCambio, urlOportunidadesCliente } from './retenidas-aviso.ts'
import type { CambioRetenida, SigueRetenida } from '../correduria-puerto.ts'

const cambio = (o: Partial<CambioRetenida> = {}): CambioRetenida => ({
  projectId: 'P1', clienteId: 'c-1', cliente: 'Ana <b>&', compania: 'Reale', antes: 'riesgo_condicionado',
  despues: 'emitida', numeroPoliza: 'AB-123', polizaId: 'pz-1', descripcion: '', ...o,
})
const sigue = (o: Partial<SigueRetenida> = {}): SigueRetenida => ({ projectId: 'P9', clienteId: 'c-9', cliente: 'Manuel Piña', compania: 'Allianz', desde: '2026-09-29T10:00:00Z', ...o })
const sigues = (n: number): SigueRetenida[] => Array.from({ length: n }, (_, i) => sigue({ projectId: `P${i}`, clienteId: `c-${i}` }))
const BASE = 'https://ejemplo.test'

test('sin cambios → null (aunque sigan retenidas)', () => {
  assert.equal(mensajeRetenidas({ cambios: [], siguen: sigues(5), recordatorio: false }, BASE), null)
})

test('liberada: nº de póliza, «ya en cartera», HTML escapado y enlace a oportunidades', () => {
  const m = mensajeRetenidas({ cambios: [cambio()], siguen: sigues(2), recordatorio: false }, BASE) as string
  assert.match(m, /✅/)
  assert.match(m, /nº AB-123/)
  assert.match(m, /ya en cartera/)
  assert.ok(m.includes('Ana &lt;b&gt;&amp;'))
  assert.ok(!m.includes('<b>&'))
  assert.ok(m.includes('href="https://ejemplo.test/correduria/cliente/c-1?tab=oportunidades"'))
  assert.match(m, /2 siguen retenidas/)
})

test('rechazada → ⛔; estado desconocido → «otro», nunca liberada', () => {
  const m = mensajeRetenidas({ cambios: [cambio({ despues: 'rechazada' }), cambio({ despues: 'raro', projectId: 'P2' })], siguen: sigues(1), recordatorio: false }, BASE) as string
  assert.match(m, /⛔/)
  assert.match(m, /🔄/)
  assert.equal(tipoCambio({ despues: null }), 'otro')
  assert.equal(tipoCambio({ despues: 'raro' }), 'otro')
  assert.match(m, /1 sigue retenida/)
})

test('con proyectos sin revisar no afirma «no queda ninguna»', () => {
  const m = mensajeRetenidas({ cambios: [cambio()], siguen: [], errores: 2, recordatorio: false }, BASE) as string
  assert.ok(!m.includes('No queda ninguna'))
  assert.match(m, /2 no se han podido revisar/)
  assert.match(mensajeRetenidas({ cambios: [cambio()], siguen: [], recordatorio: false }, BASE) as string, /No queda ninguna retenida/)
})

test('urlOportunidadesCliente codifica el id y quita la barra final', () => {
  assert.equal(urlOportunidadesCliente('a b', 'https://x.test/'), 'https://x.test/correduria/cliente/a%20b?tab=oportunidades')
})

test('recordatorio de la mañana: sin cambios pero con retenidas → manda la lista y el «⛔ Bloqueada»', () => {
  const m = mensajeRetenidas({ cambios: [], siguen: [sigue()], recordatorio: true }, BASE) as string
  assert.ok(m)
  assert.match(m, /Manuel Piña/)
  assert.match(m, /Allianz · desde el 29\/09\/2026/)
  assert.match(m, /⛔ Bloqueada: tienes que intervenir tú en la intranet de la compañía\./)
  assert.match(m, /Allianz: responde solo en su intranet/)
})

test('tarde (sin recordatorio) y sin cambios → null; mañana sin retenidas y sin cambios → null', () => {
  assert.equal(mensajeRetenidas({ cambios: [], siguen: [sigue()], recordatorio: false }, BASE), null)
  assert.equal(mensajeRetenidas({ cambios: [], siguen: [], recordatorio: true }, BASE), null)
})

test('el recordatorio corto sale solo en líneas de Allianz (cambio y retenida)', () => {
  const a = mensajeRetenidas({ cambios: [cambio({ compania: 'Allianz' })], siguen: [sigue({ compania: 'Reale' })], recordatorio: true }, BASE) as string
  assert.equal(a.split('responde solo en su intranet').length - 1, 1)
  const r = mensajeRetenidas({ cambios: [cambio({ compania: 'Reale' })], siguen: [sigue({ compania: 'Reale' })], recordatorio: true }, BASE) as string
  assert.ok(!r.includes('intranet · sin otra'))
  assert.ok(!r.includes('responde solo en su intranet'))
})

test('esPasadaDeManana: hora de Madrid < 12 (verano UTC+2 e invierno UTC+1)', () => {
  assert.equal(esPasadaDeManana(new Date('2026-09-30T05:30:00Z')), true) // 07:30
  assert.equal(esPasadaDeManana(new Date('2026-09-30T09:59:00Z')), true) // 11:59
  assert.equal(esPasadaDeManana(new Date('2026-09-30T10:00:00Z')), false) // 12:00
  assert.equal(esPasadaDeManana(new Date('2026-09-30T15:30:00Z')), false) // 17:30
  assert.equal(esPasadaDeManana(new Date('2026-01-15T10:30:00Z')), true) // 11:30 invierno
  assert.equal(esPasadaDeManana(new Date('2026-01-15T11:00:00Z')), false) // 12:00 invierno
})
