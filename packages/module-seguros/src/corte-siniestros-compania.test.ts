import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  corteSiniestrosPorCompania, textoCorteSiniestrosPorCompania, FACTOR_CADENCIA_SIN, MIN_FICHEROS_SIN,
} from './corte-siniestros-compania.ts'

const AHORA = new Date('2026-10-10T10:00:00Z')
const DIA = 86_400_000
const hace = (d: number) => new Date(AHORA.getTime() - d * DIA).toISOString()
/** Entrada con `n` ficheros, cadencia `media` días y último SIN hace `dias` días. */
const entrada = (entidad: string, n: number, media: number, dias: number, extra = {}) => ({
  entidad, enVigor: 10, sinN: n,
  ultimoSin: hace(dias),
  primerSin: hace(dias + media * (n - 1)),
  ...extra,
})

test('constantes: factor 3 y mínimo 3 ficheros', () => {
  assert.equal(FACTOR_CADENCIA_SIN, 3)
  assert.equal(MIN_FICHEROS_SIN, 3)
})
test('Occident (n=29, media 3,3 días, 15 días sin SIN): alerta', () => {
  const r = corteSiniestrosPorCompania([entrada('C0468', 29, 3.3, 15, { nombre: 'Occident' })], AHORA)
  assert.deepEqual(r.alertas.map(a => a.entidad), ['C0468'])
})
test('Occident: el mensaje incluye días sin SIN, cadencia habitual y umbral', () => {
  const r = corteSiniestrosPorCompania([entrada('C0468', 29, 3.3, 15, { nombre: 'Occident' })], AHORA)
  const t = textoCorteSiniestrosPorCompania(r.alertas)
  assert.match(t, /C0468 Occident/)
  assert.match(t, /15 días sin SIN/)
  assert.match(t, /cadencia habitual 3,3 días/)
  assert.match(t, /umbral 9,9 días/)
})
test('Allianz (n=17, media 7, 13 días): no alerta, umbral 21', () => {
  const r = corteSiniestrosPorCompania([entrada('C0061', 17, 7, 13)], AHORA)
  assert.deepEqual(r.alertas, [])
})
test('Allianz: a 22 días sí alerta con umbral 21', () => {
  const r = corteSiniestrosPorCompania([entrada('C0061', 17, 7, 22)], AHORA)
  assert.equal(r.alertas.length, 1)
  assert.equal(r.alertas[0].umbralDias, 21)
})
test('Mapfre (n=6, media 22, 2 días): no alerta', () => {
  const r = corteSiniestrosPorCompania([entrada('C0058', 6, 22, 2)], AHORA)
  assert.deepEqual(r.alertas, [])
})
test('Generali (n=1): histórico insuficiente y sin alerta', () => {
  const r = corteSiniestrosPorCompania([{ entidad: 'C0072', enVigor: 9, sinN: 1, ultimoSin: hace(40), primerSin: hace(40) }], AHORA)
  assert.deepEqual(r.alertas, [])
})
test('Generali (n=1): queda listada en sinHistorico', () => {
  const r = corteSiniestrosPorCompania([{ entidad: 'C0072', enVigor: 9, sinN: 1, ultimoSin: hace(40), primerSin: hace(40) }], AHORA)
  assert.deepEqual(r.sinHistorico, ['C0072'])
})
test('n=2 (por debajo del mínimo): sin alerta aunque lleve 100 días', () => {
  const r = corteSiniestrosPorCompania([entrada('X', 2, 5, 100)], AHORA)
  assert.deepEqual(r.alertas, [])
})
test('n=3 (justo el mínimo) y muy cortada: alerta', () => {
  const r = corteSiniestrosPorCompania([entrada('X', 3, 5, 100)], AHORA)
  assert.equal(r.alertas.length, 1)
})
test('borde exacto (media 10, umbral 30, 30 días): no alerta', () => {
  const r = corteSiniestrosPorCompania([entrada('X', 5, 10, 30)], AHORA)
  assert.deepEqual(r.alertas, [])
})
test('un poco por encima del borde (30 días y 1 hora): alerta', () => {
  const e = entrada('X', 5, 10, 30 + 1 / 24)
  assert.equal(corteSiniestrosPorCompania([e], AHORA).alertas.length, 1)
})
test('piso de 7 días: media 1 día, 7 días exactos no alerta', () => {
  assert.deepEqual(corteSiniestrosPorCompania([entrada('X', 10, 1, 7)], AHORA).alertas, [])
})
test('piso de 7 días: media 1 día, 8 días alerta', () => {
  assert.equal(corteSiniestrosPorCompania([entrada('X', 10, 1, 8)], AHORA).alertas.length, 1)
})
test('sinN nulo o ausente: sin alerta y a sinHistorico', () => {
  const r = corteSiniestrosPorCompania([
    { entidad: 'A', enVigor: 1, sinN: null, ultimoSin: hace(90), primerSin: hace(200) },
    { entidad: 'B', enVigor: 1, ultimoSin: hace(90), primerSin: hace(200) },
  ], AHORA)
  assert.deepEqual(r.alertas, [])
  assert.deepEqual(r.sinHistorico, ['A', 'B'])
})
test('media nula (primero = último con n>=3): umbral = piso de 7 días, no revienta', () => {
  const r = corteSiniestrosPorCompania([{ entidad: 'A', enVigor: 1, sinN: 5, ultimoSin: hace(3), primerSin: hace(3) }], AHORA)
  assert.deepEqual(r.alertas, [])
})
test('media ilegible (primerSin no es fecha): no alerta y a sinHistorico', () => {
  const r = corteSiniestrosPorCompania([{ entidad: 'A', enVigor: 1, sinN: 5, ultimoSin: hace(90), primerSin: 'no-es-fecha' }], AHORA)
  assert.deepEqual(r.alertas, [])
  assert.deepEqual(r.sinHistorico, ['A'])
})
test('media negativa (primero posterior al último): no alerta', () => {
  const r = corteSiniestrosPorCompania([{ entidad: 'A', enVigor: 1, sinN: 5, ultimoSin: hace(90), primerSin: hace(10) }], AHORA)
  assert.deepEqual(r.alertas, [])
})
test('ultimoSin ausente con n suficiente: sin alerta, sin histórico', () => {
  const r = corteSiniestrosPorCompania([{ entidad: 'A', enVigor: 1, sinN: 5, primerSin: hace(90) }], AHORA)
  assert.deepEqual(r.alertas, [])
  assert.deepEqual(r.sinHistorico, ['A'])
})
test('sin pólizas en vigor (0, null o ausente): no se vigila ni consta como sin histórico', () => {
  const r = corteSiniestrosPorCompania([
    entrada('A', 10, 1, 90, { enVigor: 0 }),
    entrada('B', 10, 1, 90, { enVigor: null }),
    entrada('C', 10, 1, 90, { enVigor: undefined }),
  ], AHORA)
  assert.deepEqual(r.alertas, [])
  assert.deepEqual(r.sinHistorico, [])
})
test('varias compañías: solo las cortadas, la más antigua primero', () => {
  const r = corteSiniestrosPorCompania([
    entrada('C0468', 29, 3.3, 2),
    entrada('C0061', 17, 7, 40),
    entrada('C0058', 6, 22, 100),
  ], AHORA)
  assert.deepEqual(r.alertas.map(a => a.entidad), ['C0058', 'C0061'])
})
test('entrada nula: sin alertas', () => {
  assert.deepEqual(corteSiniestrosPorCompania(null, AHORA), { alertas: [], sinHistorico: [] })
})
