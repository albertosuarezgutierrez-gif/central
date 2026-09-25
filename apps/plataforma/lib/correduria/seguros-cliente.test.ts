import test from 'node:test'
import assert from 'node:assert/strict'
import { repartirSegurosCliente, estaHuerfana } from './seguros-cliente.ts'
import type { PolizaDeclaradaFicha, PolizaFicha } from '../ficha-asegura'
import type { OportunidadDeCliente } from '../seguimiento-asegura'

const pol = (id: string, over: Partial<PolizaFicha> = {}): PolizaFicha => ({
  id, tipo: 'auto', aseguradora: 'Reale', numeroPoliza: id, estado: 'en_vigor',
  fechaInicio: null, fechaVencimiento: '2027-01-01', prima: 300, fraccionamiento: null, matricula: null,
  objeto: null, viva: true, confirmadaCima: true, retarificable: false, retarificacion: null,
  recibos: null, pago: null, evolucionPrima: null,
  ...over,
} as PolizaFicha)

const opo = (id: string, over: Partial<OportunidadDeCliente> = {}): OportunidadDeCliente => ({
  id, clienteId: 'c', ramo: 'auto', estado: 'competencia', fechaFinVigencia: null, motivoPerdida: null,
  competidor: null, primaCompetidor: null, aparcadaHasta: null, cerradaAt: null,
  aseguradora: 'Mapfre', prima: null, creada: '2026-09-01', proximaTarea: { tipo: 'llamada', fechaLimite: '2026-09-30' },
  ...over,
})

const ids = (l: { id: string }[]) => l.map(s => s.id)

test('en vigor y pendiente de CIMA están con nosotros; cancelada y vencida son oportunidad; fin_riesgo ya no existe', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('vigor'),
      pol('emitida', { confirmadaCima: false }),
      pol('anula', { estado: 'anula_al_vencimiento' }),
      pol('cancel', { estado: 'cancelada' }),
      pol('venc', { estado: 'vencida' }),
      pol('comp', { estado: 'competencia' }),
      pol('fin', { estado: 'fin_riesgo' }),
    ],
    declaradas: [],
    oportunidades: [],
  })
  assert.deepEqual(ids(r.conNosotros).sort(), ['anula', 'emitida', 'vigor'])
  assert.deepEqual(ids(r.oportunidades).sort(), ['cancel', 'comp', 'venc'])
  assert.deepEqual(ids(r.yaNoExiste), ['fin'])
})

test('el volcado histórico va aparte, no entre las oportunidades vivas', () => {
  const r = repartirSegurosCliente({ polizas: [pol('h', { viva: false, estado: 'vencida' })], declaradas: [], oportunidades: [] })
  assert.deepEqual(ids(r.historicas), ['h'])
  assert.equal(r.oportunidades.length, 0)
})

test('una oportunidad abierta se engancha a la póliza perdida del mismo ramo, sin duplicar tarjeta', () => {
  const r = repartirSegurosCliente({
    polizas: [pol('cancel', { estado: 'cancelada', tipo: 'hogar' })],
    declaradas: [],
    oportunidades: [opo('o1', { ramo: 'hogar' }), opo('o2', { ramo: 'moto' })],
  })
  assert.deepEqual(ids(r.oportunidades).sort(), ['cancel', 'o2'])
  const p = r.oportunidades.find(s => s.id === 'cancel')
  assert.ok(p && p.clase === 'poliza' && p.oportunidad?.id === 'o1')
})

test('perdidas: «ya no lo necesita» = ya no existe; por precio se reintenta; error_alta y ganadas no salen', () => {
  const r = repartirSegurosCliente({
    polizas: [],
    declaradas: [],
    oportunidades: [
      opo('desiste', { ramo: 'moto', estado: 'perdida', motivoPerdida: 'cliente_desiste' }),
      opo('precio', { ramo: 'hogar', estado: 'perdida', motivoPerdida: 'precio' }),
      opo('error', { ramo: 'vida', estado: 'perdida', motivoPerdida: 'error_alta' }),
      opo('ganada', { ramo: 'salud', estado: 'ganada' }),
    ],
  })
  assert.deepEqual(ids(r.yaNoExiste), ['desiste'])
  assert.deepEqual(ids(r.oportunidades), ['precio'])
})

test('una perdida no se repite si ya hay algo abierto del mismo ramo', () => {
  const r = repartirSegurosCliente({
    polizas: [],
    declaradas: [],
    oportunidades: [opo('vieja', { estado: 'perdida', motivoPerdida: 'precio' }), opo('nueva')],
  })
  assert.deepEqual(ids(r.oportunidades), ['nueva'])
})

test('las aportadas desde el portal son oportunidad salvo que ya estén en cartera', () => {
  const d = (id: string, yaEnCartera: boolean | null) => ({ id, yaEnCartera, fechaVencimiento: null } as PolizaDeclaradaFicha)
  const r = repartirSegurosCliente({ polizas: [], declaradas: [d('fuera', false), d('dentro', true), d('nose', null)], oportunidades: [] })
  assert.deepEqual(ids(r.oportunidades).sort(), ['fuera', 'nose'])
})

test('lo que no se pudo leer se declara, no se da por vacío', () => {
  const r = repartirSegurosCliente({ polizas: [], declaradas: null, oportunidades: null })
  assert.equal(r.oportunidadesLeidas, false)
  assert.equal(r.declaradasLeidas, false)
})

test('huérfana = abierta, sin próxima tarea y sin aparcar', () => {
  assert.equal(estaHuerfana(opo('a', { proximaTarea: null })), true)
  assert.equal(estaHuerfana(opo('b', { proximaTarea: null, aparcadaHasta: '2026-12-01' })), false)
  assert.equal(estaHuerfana(opo('c', { proximaTarea: null, estado: 'perdida' })), false)
})

test('una perdida no sale si ese ramo ya está con nosotros, ni como reintento ni como «ya no existe»', () => {
  const r = repartirSegurosCliente({
    polizas: [pol('hogar-vivo', { tipo: 'hogar' }), pol('moto-viva', { tipo: 'moto' })],
    declaradas: [],
    oportunidades: [
      opo('hogar-perdida', { ramo: 'hogar', estado: 'perdida', motivoPerdida: 'precio' }),
      opo('moto-desiste', { ramo: 'moto', estado: 'perdida', motivoPerdida: 'cliente_desiste' }),
    ],
  })
  assert.deepEqual(ids(r.oportunidades), [])
  assert.deepEqual(ids(r.yaNoExiste), [])
})

test('una abierta sin ramo no tapa las perdidas sin ramo', () => {
  const r = repartirSegurosCliente({
    polizas: [],
    declaradas: [],
    oportunidades: [opo('abierta', { ramo: null }), opo('perdida', { ramo: null, estado: 'perdida', motivoPerdida: 'precio' })],
  })
  assert.deepEqual(ids(r.oportunidades).sort(), ['abierta', 'perdida'])
})
