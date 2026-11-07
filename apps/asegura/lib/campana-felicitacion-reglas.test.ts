// Cepo del embudo de felicitaciones (07/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { embudoFelicitacion, embudoFelicitacionPorGrupo, grupoFelicitacion } from './campana-felicitacion-reglas.ts'

const fila = (o: Partial<Parameters<typeof embudoFelicitacion>[0][number]> = {}) => ({
  enviado: true, eventos: ['email.delivered'] as string[] | null, visita: false, registrado: false, baja: false, portal: false, ...o,
})

test('entrar al portal NO cuenta como clic ni abre: se cuenta aparte', () => {
  const e = embudoFelicitacion([fila({ portal: true }), fila()])
  assert.equal(e.enviados, 2)
  assert.equal(e.entregados, 2)
  assert.equal(e.clics, 0)
  assert.equal(e.abiertos, 0)
  assert.equal(e.visitas, 1)
  assert.equal(e.registrados, 0)
})

test('un envío sin eventos legibles deja entregados en «no se sabe» (null), no en 0', () => {
  const e = embudoFelicitacion([fila({ eventos: null }), fila()])
  assert.equal(e.entregados, null)
  assert.equal(e.rebotados, null)
})

test('el que no salió no cuenta como felicitado, ni su portal', () => {
  const e = embudoFelicitacion([fila({ enviado: false, portal: true, eventos: null })])
  assert.equal(e.enviados, 0)
  assert.equal(e.fallidos, 1)
  assert.equal(e.visitas, 0)
  assert.equal(e.entregados, 0)
})

test('rebotes del pie salen de los eventos', () => {
  const e = embudoFelicitacion([fila({ eventos: ['email.bounced'] }), fila()])
  assert.equal(e.rebotados, 1)
})

test('grupos: vigentes y ex-clientes distinguibles', () => {
  assert.equal(grupoFelicitacion(null), 'Clientes en vigor')
  assert.equal(grupoFelicitacion('ex_cliente'), 'Ex-clientes')
  assert.equal(grupoFelicitacion('posible_cliente'), 'Posibles clientes')
  const g = embudoFelicitacionPorGrupo([{ ...fila(), g: 'Ex-clientes' }, { ...fila({ portal: true }), g: 'Clientes en vigor' }], (f) => f.g)
  assert.deepEqual(g.map((x) => [x.grupo, x.embudo.visitas]), [['Clientes en vigor', 1], ['Ex-clientes', 0]])
})
