import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarLeads, interpretarOportunidad, MOTIVOS_PERDIDA_UI, rotuloCanal } from './seguimiento-asegura.ts'

const lead = {
  oportunidadId: 'o1', estado: 'competencia', clienteId: 'c1', cliente: 'Ana', ramo: 'auto', aseguradora: 'Mapfre',
  prima: null, vencimientoEstimado: '2026-11-12', dias: 50, ventana: '30_60', telefono: '600', email: null,
  intentos: 0, ultimoContactoEn: null, respondioAntes: false, fueCliente: false, canal: 'solo_telefono', puntuacion: 60,
  siguientePaso: { accion: 'primer_contacto', motivo: 'le vence pronto', dentroDeDias: 0 },
}

test('lista vacía con ok es «no hay»; sin configurar y error NO lo son', () => {
  const vacia = interpretarLeads(200, { estado: 'ok', leads: [], porVentana: {} })
  assert.equal(vacia.estado, 'ok')
  assert.equal(interpretarLeads(503, null).estado, 'sin_configurar')
  assert.equal(interpretarLeads(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  const err = interpretarLeads(500, { estado: 'error', causa: 'credenciales' })
  assert.deepEqual(err, { estado: 'error', motivo: 'credenciales' })
  assert.equal(interpretarLeads(401, null).estado, 'error')
})

test('la prima que no consta sigue siendo null, y una fila rota se cuenta, no se inventa', () => {
  const r = interpretarLeads(200, { estado: 'ok', leads: [lead, { oportunidadId: 'x' }], porVentana: { '30_60': 1 } })
  assert.ok(r.estado === 'ok')
  assert.equal(r.leads.length, 1)
  assert.equal(r.leads[0].prima, null)
  assert.equal(r.descartadas, 1)
  assert.equal(r.porVentana['30_60'], 1)
  assert.equal(r.porVentana.menos_30, 0)
})

test('asegura antigua sin canal: no se afirma «solo teléfono»', () => {
  const { canal: _c, fueCliente: _f, ...sinCanal } = lead
  void _c; void _f
  const r = interpretarLeads(200, { estado: 'ok', leads: [sinCanal] })
  assert.ok(r.estado === 'ok')
  assert.equal(r.leads[0].canal, null)
  assert.equal(r.leads[0].fueCliente, null)
  assert.equal(r.sinCanalPermitido, null)
  assert.equal(rotuloCanal(null), 'Canal sin comprobar')
})

test('oportunidad: 404 es «no encontrada», no un error; el contexto que falta queda null', () => {
  assert.equal(interpretarOportunidad(404, { estado: 'no_encontrado' }).estado, 'no_encontrado')
  const r = interpretarOportunidad(200, {
    estado: 'ok',
    oportunidad: { id: 'o1', clienteId: 'c1', estado: 'en_negociacion', primaCompetidor: null },
    tareas: [{ id: 't1', tipo: 'llamada', estado: 'pendiente', observaciones: 'x', fechaLimite: '2026-09-25' }, { sinId: true }],
    historial: [{ accion: 'interesado', actor: 'a', fecha: '2026-09-22T10:00:00Z' }],
  })
  assert.ok(r.estado === 'ok')
  assert.equal(r.cliente, null)
  assert.equal(r.fueCliente, null)
  assert.equal(r.tareas.length, 1)
  assert.equal(r.historial.length, 1)
})

test('los motivos de la pantalla son EXACTAMENTE los del módulo, en el mismo orden', () => {
  // Con una lista divergente, la pantalla ofrecería un motivo que el puerto rechaza con 422.
  const fuente = readFileSync(new URL('../../../packages/module-seguros/src/oportunidad-seguimiento.ts', import.meta.url), 'utf8')
  const bloque = fuente.match(/MOTIVOS_PERDIDA = \[([\s\S]*?)\] as const/)
  assert.ok(bloque, 'no se encuentra MOTIVOS_PERDIDA en el módulo')
  const delModulo = [...bloque[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual(MOTIVOS_PERDIDA_UI.map((m) => m.valor), delModulo)
})
