import { test } from 'node:test'
import assert from 'node:assert/strict'
import { solicitudesListas, type SolicitudCruda } from './listas.ts'

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
