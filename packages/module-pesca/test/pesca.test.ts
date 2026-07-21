import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  importe,
  redondear2,
  pesoEnvasadoTotalKg,
  stockRestanteKg,
  canalLlevaLote,
  construirEtiqueta,
  validarPartida,
  validarEnvasado,
} from '../src/pesca.ts'
import type { Partida, Envasado } from '../src/types.ts'

const partida: Partida = {
  id: 'p1',
  producto: 'Gamba blanca',
  nombreCientifico: 'Parapenaeus longirostris',
  proveedor: 'Barcos del Sur SL',
  loteOrigen: 'L-2026-0042',
  albaran: 'ALB-778',
  marea: 'MAR-15',
  barco: 'Nuevo Amanecer',
  zonaCaptura: 'FAO 27 (Atlántico NE)',
  artePesca: 'Arrastre',
  metodoProduccion: 'capturado',
  fechaCaptura: '2026-07-18',
  fechaRecepcion: '2026-07-20',
  fechaCaducidad: '2028-07-20',
  calibre: '40/60',
  pesoRecibidoKg: 20,
  precioCompraKg: 12,
  precioVentaKg: 18,
  estado: 'en_camara',
}

const envasar = (over: Partial<Envasado>): Envasado => ({
  id: 'e',
  partidaId: 'p1',
  canal: 'mostrador',
  pesoKg: 2,
  precioKg: 18,
  fechaEnvasado: '2026-07-21',
  ...over,
})

test('importe y redondeo a céntimos', () => {
  assert.equal(importe(2.5, 18), 45)
  assert.equal(importe(1.005, 10), 10.05) // redondeo correcto sin drift de coma flotante
  assert.equal(redondear2(0.1 + 0.2), 0.3)
})

test('stock restante descuenta lo ya envasado y no baja de 0', () => {
  const envasados = [{ pesoKg: 5 }, { pesoKg: 3.5 }]
  assert.equal(pesoEnvasadoTotalKg(envasados), 8.5)
  assert.equal(stockRestanteKg(partida, envasados), 11.5)
  assert.equal(stockRestanteKg(partida, [{ pesoKg: 50 }]), 0)
})

test('LA regla del canal: catering/hotel llevan lote, mostrador no', () => {
  assert.equal(canalLlevaLote('catering'), true)
  assert.equal(canalLlevaLote('hotel'), true)
  assert.equal(canalLlevaLote('mostrador'), false)
})

test('la etiqueta HEREDA el lote de origen y solo lo muestra en catering/hotel', () => {
  const etiCatering = construirEtiqueta(partida, envasar({ canal: 'catering', pesoKg: 3 }))
  assert.equal(etiCatering.lote, 'L-2026-0042') // el MISMO que entró, no uno nuevo
  assert.equal(etiCatering.importe, 54)
  assert.equal(etiCatering.trazabilidad.barco, 'Nuevo Amanecer')

  const etiMostrador = construirEtiqueta(partida, envasar({ canal: 'mostrador', pesoKg: 1 }))
  assert.equal(etiMostrador.lote, null) // mostrador: sin nº de lote

  const etiHotel = construirEtiqueta(partida, envasar({ canal: 'hotel', pesoKg: 1 }))
  assert.equal(etiHotel.lote, 'L-2026-0042')
})

test('la info pesquera obligatoria al consumidor va SIEMPRE (aun en mostrador)', () => {
  const eti = construirEtiqueta(partida, envasar({ canal: 'mostrador' }))
  assert.equal(eti.nombreCientifico, 'Parapenaeus longirostris')
  assert.equal(eti.metodoProduccion, 'capturado')
  assert.equal(eti.zonaCaptura, 'FAO 27 (Atlántico NE)')
  assert.equal(eti.artePesca, 'Arrastre')
})

test('la caducidad del envase cae a la de la partida si no se especifica', () => {
  const eti = construirEtiqueta(partida, envasar({ fechaCaducidad: null }))
  assert.equal(eti.fechaCaducidad, '2028-07-20')
  const eti2 = construirEtiqueta(partida, envasar({ fechaCaducidad: '2026-08-01' }))
  assert.equal(eti2.fechaCaducidad, '2026-08-01')
})

test('validarPartida exige producto, lote de origen y peso > 0', () => {
  assert.deepEqual(validarPartida(partida), [])
  const errs = validarPartida({ producto: '', loteOrigen: '', pesoRecibidoKg: 0 })
  assert.equal(errs.length, 3)
  assert.ok(validarPartida({ ...partida, precioVentaKg: -1 }).some((e) => e.includes('venta')))
})

test('validarEnvasado bloquea peso > stock restante', () => {
  assert.deepEqual(validarEnvasado(partida, [], { pesoKg: 5, precioKg: 18 }), [])
  const errs = validarEnvasado(partida, [{ pesoKg: 18 }], { pesoKg: 5, precioKg: 18 })
  assert.ok(errs.some((e) => e.includes('No hay stock')))
  assert.ok(validarEnvasado(partida, [], { pesoKg: 0, precioKg: 18 }).length > 0)
})
