import { test } from 'node:test'
import assert from 'node:assert/strict'
import { solicitudesIncompletas, solicitudesListas, type SolicitudCruda } from './listas.ts'

const base: SolicitudCruda = {
  id: 's1', reservationId: '160296956', piso: 'Socorro 24', estado: 'pendiente', receptorTipo: 'particular', receptorNombre: 'Ana Pérez',
  receptorNif: '12345678Z', receptorPais: 'ES', receptorEmail: 'ana@example.com', receptorCc: ['ana@example.com', 'conta@example.com'],
  receptorDireccion: { pais: 'ES', cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla', via: 'Calle Socorro', numero: '24', resto: null, viaCatastro: false },
  tieneFactura: false,
}

test('solicitud pendiente válida sin factura → lista (CC sin repetir el destinatario)', () => {
  const r = solicitudesListas([base])
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].cc, ['conta@example.com'])
  assert.equal(r[0].email, 'ana@example.com')
})

test('se excluyen: con factura/borrador, no pendiente e inválida o incompleta', () => {
  const r = solicitudesListas([
    { ...base, id: 'a', tieneFactura: true },
    { ...base, id: 'b', estado: 'completada' },
    { ...base, id: 'c', receptorNif: null },
    { ...base, id: 'd', receptorNif: '12345678A' },
    { ...base, id: 'e', receptorEmail: 'sin-arroba' },
    { ...base, id: 'f', receptorDireccion: null },
  ])
  assert.deepEqual(r, [])
})

test('incompletas: pendiente sin factura y datos que faltan → qué falta + token; las listas y las atendidas no salen', () => {
  const t = 'T'.repeat(43)
  const r = solicitudesIncompletas([
    { ...base, id: 'ok', token: t },
    { ...base, id: 'sin-nif', receptorNif: null, receptorEmail: null, token: t },
    { ...base, id: 'con-factura', receptorNif: null, tieneFactura: true, token: t },
    { ...base, id: 'completada', receptorNif: null, estado: 'completada', token: t },
  ])
  assert.deepEqual(r.map((x) => x.id), ['sin-nif'])
  assert.equal(r[0].token, t)
  assert.ok(r[0].faltan.some((x) => /NIF/.test(x)) && r[0].faltan.some((x) => /email/.test(x)))
})
