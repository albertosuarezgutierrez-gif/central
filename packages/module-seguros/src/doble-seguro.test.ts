import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoDobleSeguro, type ViejaParaDobleSeguro } from './doble-seguro.ts'

const GPAFS: ViejaParaDobleSeguro = { aseguradora: 'C0468', numeroPoliza: 'GPAFS0900547', estado: 'activa', fechaVencimiento: '2027-09-09', fechaEfectoUltimoRecibo: null }

test('caso real: GPAFS0900547 (vence 09/09/2027) → 61048939 con efecto 17/09/2026 avisa, sin PII', () => {
  const a = avisoDobleSeguro(GPAFS, { fechaEfecto: '2026-09-17', estado: 'en_vigor' })
  assert.deepEqual(a?.motivos, ['vencimiento_posterior'])
  assert.equal(a?.texto, 'posible doble seguro: pedir anulación de GPAFS0900547 a C0468')
})

test('recibo posterior al efecto de la nueva también avisa (aunque no conste vencimiento)', () => {
  const a = avisoDobleSeguro({ ...GPAFS, fechaVencimiento: null, fechaEfectoUltimoRecibo: '2026-12-01' }, { fechaEfecto: '2026-09-17', estado: 'en_vigor' })
  assert.deepEqual(a?.motivos, ['recibo_posterior'])
})

test('cambio a vencimiento (≤30 días) NO avisa: es lo normal', () => {
  assert.equal(avisoDobleSeguro({ ...GPAFS, fechaVencimiento: '2026-09-24' }, { fechaEfecto: '2026-09-22', estado: 'en_vigor' }), null)
})

test('vieja ya no vigente → sin aviso', () => {
  assert.equal(avisoDobleSeguro({ ...GPAFS, estado: 'anulada' }, { fechaEfecto: '2026-09-17', estado: 'en_vigor' }), null)
})

test('sin fecha de efecto de la nueva = no se sabe → sin aviso (no se inventa)', () => {
  assert.equal(avisoDobleSeguro(GPAFS, { fechaEfecto: null, estado: 'en_vigor' }), null)
  assert.equal(avisoDobleSeguro(GPAFS, { fechaEfecto: 'basura', estado: 'en_vigor' }), null)
})

test('sin número de la vieja el texto no inventa uno', () => {
  const a = avisoDobleSeguro({ ...GPAFS, numeroPoliza: null }, { fechaEfecto: '2026-09-17', estado: 'en_vigor' })
  assert.match(a!.texto, /anulación de la póliza sustituida a C0468/)
})

test('la NUEVA anulada/no vigente → sin aviso (no hay dos seguros vivos)', () => {
  assert.equal(avisoDobleSeguro(GPAFS, { fechaEfecto: '2026-09-17', estado: 'anulada' }), null)
})
