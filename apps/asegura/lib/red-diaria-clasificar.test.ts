import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  causaAnulacionParada, clasificarAnulaciones, clasificarAprobaciones, type FilaAnulacion, type FilaAprobacion,
} from './red-diaria-clasificar.ts'

const AHORA = new Date('2026-10-13T06:00:00Z')
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000)
const en = (h: number) => hace(-h)

const ap = (o: Partial<FilaAprobacion> = {}): FilaAprobacion => ({
  id: 'a1', accion: 'enviar_correo_cliente', origen: 'recibo_devuelto', clienteId: 'c1', cliente: 'Ana', estado: 'pendiente',
  caduca: en(5), decididaPor: null, urgente: false, ...o,
})
const an = (o: Partial<FilaAnulacion> = {}): FilaAnulacion => ({
  anulacionId: 'n1', clienteId: 'c1', cliente: 'Ana', compania: 'Mapfre', numeroPoliza: '1', firmadaAt: hace(60),
  tieneCarta: true, tieneFirma: true, esAllianz: false, esperaEmision: false, estadosAprobacion: [], ...o,
})

test('aprobaciones: pendiente que caduca en <24 h entra; en >24 h o ya vencida, no', () => {
  const r = clasificarAprobaciones([ap({ id: 'a' }), ap({ id: 'b', caduca: en(30) }), ap({ id: 'c', caduca: hace(1) })], AHORA)
  assert.deepEqual(r.porCaducar.map((x) => x.id), ['a'])
})

test('aprobaciones: caducada POR TIEMPO en las últimas 24 h entra; antigua u obsoleta (otro motivo), no', () => {
  const caducada = (o: Partial<FilaAprobacion>) => ap({ estado: 'caducada', decididaPor: 'sistema:caducidad', caduca: hace(3), ...o })
  const r = clasificarAprobaciones([
    caducada({ id: 'ok' }),
    caducada({ id: 'vieja', caduca: hace(40) }),
    caducada({ id: 'obsoleta', decididaPor: 'sistema:recibo_resuelto' }),
  ], AHORA)
  assert.deepEqual(r.caducadas.map((x) => x.id), ['ok'])
})

test('aprobaciones: el tipo sale de la acción', () => {
  const r = clasificarAprobaciones([ap({ accion: 'enviar_correo_compania' })], AHORA)
  assert.equal(r.porCaducar[0]!.tipo, 'compania')
})

test('anulaciones: menos de 48 h desde la firma no se avisa; más, sí', () => {
  const r = clasificarAnulaciones([an({ anulacionId: 'fresca', firmadaAt: hace(47) }), an({ anulacionId: 'vieja', firmadaAt: hace(49) })], AHORA)
  assert.deepEqual(r.map((x) => x.anulacionId), ['vieja'])
  assert.equal(r[0]!.horas, 49)
})

test('causa: sin carta o sin firma (caso 69f82e00)', () => {
  assert.equal(causaAnulacionParada(an({ tieneCarta: false })), 'sin_carta_firma')
  assert.equal(causaAnulacionParada(an({ tieneFirma: false })), 'sin_carta_firma')
})

test('causa: propuesta rechazada bloquea la repropuesta (caso 676a6ff9)', () => {
  assert.equal(causaAnulacionParada(an({ estadosAprobacion: ['rechazada'] })), 'propuesta_rechazada')
})

test('causa: esperando OK, sin propuesta, Allianz/PUE, espera emisión, ejecutada sin marcar, envío incierto', () => {
  assert.equal(causaAnulacionParada(an({ estadosAprobacion: ['pendiente'] })), 'esperando_ok')
  assert.equal(causaAnulacionParada(an({ estadosAprobacion: [] })), 'sin_propuesta')
  assert.equal(causaAnulacionParada(an({ estadosAprobacion: ['caducada', 'fallida'] })), 'sin_propuesta')
  assert.equal(causaAnulacionParada(an({ esAllianz: true, tieneCarta: false })), 'allianz_pue')
  assert.equal(causaAnulacionParada(an({ esperaEmision: true })), 'espera_emision')
  assert.equal(causaAnulacionParada(an({ estadosAprobacion: ['ejecutada'] })), 'enviada_sin_marcar')
  assert.equal(causaAnulacionParada(an({ estadosAprobacion: ['enviando'] })), 'envio_incierto')
})

test('🪤 la lectura aplica retirarObsoletas ANTES de leer y nunca traga un fallo como lista vacía', () => {
  const src = readFileSync(new URL('./red-diaria.ts', import.meta.url), 'utf8')
  assert.ok(src.indexOf('await retirarObsoletas(correduriaId)') > 0 && src.indexOf('await retirarObsoletas(correduriaId)') < src.indexOf('from aprobacion a'))
  assert.doesNotMatch(src, /catch/, 'un catch aquí convertiría un fallo en «no hay nada»')
  assert.match(src, /a\.comunicada_at is null/)
  assert.match(src, /interval '48 hours'/)
})
