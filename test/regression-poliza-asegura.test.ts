import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarPoliza } from '../apps/plataforma/lib/poliza-asegura.ts'

const POLIZA_OK = {
  estado: 'ok',
  poliza: {
    id: 'p1', cliente: { id: 'c1', nombre: 'Jose Suarez Salas' }, tipo: 'hogar', aseguradora: 'Occident',
    codigoEntidadDgs: 'C0468', numeroPoliza: 'GPDFL0600228', idPolizaEntidad: null, ramoDgs: null, estado: 'activa', situacion: null,
    origen: 'cima', viva: true, fechaEfectoInicial: '2015-07-06', fechaInicio: '2026-07-06', fechaVencimiento: '2027-07-06',
    prima: 396.83, primaAnual: 396.83, primaBruta: null, primaMensual: null,
    objeto: { estado: 'no_informado', titulo: null, detalle: null, nota: null },
    gemela: { polizaId: 'p9', clienteId: 'c9', importRef: 'asegura_app:pol2:175', objeto: { estado: 'conocido', titulo: 'ROTA · CP 11520', detalle: '110 m² · construida en 1989', nota: null }, fechaVencimiento: null },
    coberturas: [{ orden: 1, codigo: 'CONT', descripcion: 'Continente', capital: '105000', descripcionCapital: null, franquicia: null, desde: null, hasta: null }],
    recibos: { total: 1, pendientes: 0, devueltos: 0, cobrados: 1, anulados: 0, cobradoEur: 396.83, ilegibles: 0, ultimo: null },
    listaRecibos: [{ id: 'r1', situacion: 'cobrado', importe: 396.83, fechaEmision: '2026-07-06', fechaVencimiento: null, formaPago: 'domiciliado' }],
    siniestros: [], intervinientes: [], documentos: 0,
    pago: { fraccionamiento: 'anual', formaCobro: 'domiciliado', recargo: { estado: 'no_aplica' } },
    retarificable: false,
  },
}

test('una póliza completa se lee entera, con su gemela y sus coberturas', () => {
  const r = interpretarPoliza(200, POLIZA_OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.poliza.gemela?.objeto?.titulo, 'ROTA · CP 11520')
  assert.equal(r.poliza.coberturas[0].capital, '105000')
  assert.equal(r.poliza.documentos, 0)
  assert.equal(r.poliza.pago?.recargo.estado, 'no_aplica')
})

test('🚨 sin clave `gemela` no se afirma que no exista; con `gemela: null` sí', () => {
  const { gemela: _g, ...sinClave } = POLIZA_OK.poliza
  const a = interpretarPoliza(200, { estado: 'ok', poliza: sinClave })
  assert.equal(a.estado, 'ok')
  if (a.estado !== 'ok') return
  assert.equal(a.poliza.gemelaInformada, false)
  const b = interpretarPoliza(200, { estado: 'ok', poliza: { ...POLIZA_OK.poliza, gemela: null } })
  assert.equal(b.estado, 'ok')
  if (b.estado !== 'ok') return
  assert.equal(b.poliza.gemelaInformada, true)
  assert.equal(b.poliza.gemela, null)
})

test('🚨 documentos sin contar (null) ≠ cero documentos', () => {
  const r = interpretarPoliza(200, { estado: 'ok', poliza: { ...POLIZA_OK.poliza, documentos: null } })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.poliza.documentos, null)
})

test('«no se pudo mirar» y «se miró y no está» no son lo mismo', () => {
  assert.deepEqual(interpretarPoliza(404, null), { estado: 'no_encontrado' })
  assert.equal(interpretarPoliza(200, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarPoliza(200, { estado: 'ok', poliza: { id: 'x' } }).estado, 'error')
})
