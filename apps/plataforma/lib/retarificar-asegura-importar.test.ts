import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarImportacion, interpretarVistaImportacion } from './retarificar-asegura.ts'

// Contrato con `apps/asegura/app/api/operador/codeoscopic/importar/route.ts` (fila 13, 26/09/2026).

test('vista: el tomador sin comprobar NO se lee como «coincide»', () => {
  const v = interpretarVistaImportacion(200, {
    estado: 'ok', projectId: '40000001', tomador: 'raro', bloqueos: ['x'], ofertas: [], otras: 19,
  })
  assert.equal(v.estado, 'ok')
  if (v.estado !== 'ok') return
  assert.equal(v.tomador, 'sin_dato')
  assert.deepEqual(v.bloqueos, ['x'])
  assert.equal(v.otras, 19)
})

test('vista: ofertas con prima y primer recibo', () => {
  const v = interpretarVistaImportacion(200, {
    estado: 'ok', projectId: '40000001', tomador: 'coincide', bloqueos: [], otras: 0,
    ofertas: [{ quoteId: 'Q2024763856', compania: 'Allianz', categoria: 'Terceros Ampliado', primaEur: 520.97, primerReciboEur: 241.3, pago: 'Semestral' }, { sinId: true }],
  })
  if (v.estado !== 'ok') return assert.fail(v.mensaje)
  assert.equal(v.ofertas.length, 1)
  assert.equal(v.ofertas[0].primerReciboEur, 241.3)
})

test('vista: emisión apagada en asegura → sin_configurar, no error', () => {
  const v = interpretarVistaImportacion(503, { estado: 'error', causa: 'apagado', mensaje: 'CODEOSCOPIC_EMISION_ACTIVA=0' })
  assert.equal(v.estado, 'sin_configurar')
})

test('import ok: trae la oferta y la compañía para el panel de emisión', () => {
  const r = interpretarImportacion(200, {
    estado: 'ok', projectId: '40000001', compania: 'Allianz', categoria: 'Terceros Ampliado',
    oferta: { offerId: 'Q2024763856', primaEur: 520.97, firmeza: 'firme', caducaEn: '2026-09-29', avisos: [] },
    cuenta: null,
  })
  if (r.estado !== 'ok' || !('compania' in r)) return assert.fail(JSON.stringify(r))
  assert.equal(r.offerId, 'Q2024763856')
  assert.equal(r.compania, 'Allianz')
})

test('import ok sin compañía → ilegible, no se sigue a emitir a ciegas', () => {
  const r = interpretarImportacion(200, {
    estado: 'ok', projectId: '40000001',
    oferta: { offerId: 'Q1', primaEur: 1, firmeza: 'firme', caducaEn: null, avisos: [] }, cuenta: null,
  })
  assert.equal(r.estado, 'error')
})

test('import 422 bloqueado: el motivo de negocio viaja tal cual', () => {
  const r = interpretarImportacion(422, { estado: 'error', causa: 'bloqueado', mensaje: 'el tomador del proyecto no es el cliente de esta póliza (DNI distinto)' })
  assert.equal(r.estado, 'error')
  if (r.estado !== 'error') return
  assert.equal(r.mensaje, 'el tomador del proyecto no es el cliente de esta póliza (DNI distinto)')
})

test('vista: tomador y cuenta del proyecto para el resumen de Telegram; sin campo ≠ sin cuenta', () => {
  const vieja = interpretarVistaImportacion(200, { estado: 'ok', projectId: '40000001', tomador: 'coincide', bloqueos: [], ofertas: [], otras: 0 })
  if (vieja.estado !== 'ok') return assert.fail(vieja.mensaje)
  assert.equal(vieja.cuentaInformada, false)
  assert.equal(vieja.titular, null)
  const nueva = interpretarVistaImportacion(200, {
    estado: 'ok', projectId: '40000001', tomador: 'coincide', bloqueos: [], ofertas: [], otras: 0,
    titular: { nombre: 'Ana', documento: '…678Z', direccion: null, codigoPostal: null }, matricula: '1234ABC',
    cuenta: { aviso: 'no_comprobada' },
  })
  if (nueva.estado !== 'ok') return assert.fail(nueva.mensaje)
  assert.equal(nueva.cuentaInformada, true)
  assert.equal(nueva.cuenta, null)
  assert.equal(nueva.cuentaAviso, 'no_comprobada')
  assert.equal(nueva.titular?.documento, '…678Z')
  assert.equal(nueva.matricula, '1234ABC')
})

test('la dirección de emisión se lee con sus tres orígenes; una forma rara es null, nunca «proyecto»', () => {
  const base = { estado: 'ok', projectId: '1', tomador: 'coincide', vehiculo: 'coincide', bloqueos: [], ofertas: [], otras: 0 }
  const v = (direccion: unknown) => {
    const r = interpretarVistaImportacion(200, { ...base, direccion })
    return r.estado === 'ok' ? r.direccion : 'no-ok'
  }
  assert.deepEqual(v({ origen: 'ficha', texto: 'Calle Feria 12' }), { origen: 'ficha', texto: 'Calle Feria 12' })
  assert.deepEqual(v({ origen: 'falta', faltan: ['calle'] }), { origen: 'falta', faltan: ['calle'] })
  assert.deepEqual(v({ origen: 'proyecto', texto: null }), { origen: 'proyecto', texto: null })
  assert.equal(v({ origen: 'ficha', texto: '' }), null)
  assert.equal(v(undefined), null)
})
