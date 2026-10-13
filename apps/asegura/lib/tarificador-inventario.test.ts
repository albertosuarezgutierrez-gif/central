// Cable del inventario de estructura de pantalla (13/10/2026). `node --test`. Fixtures SINTÉTICAS (NIF inventado).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerResultadoWorker } from './tarificador-reglas.ts'

const JOB = '33333333-3333-4333-8333-333333333333'
const base = { trabajoId: JOB, resultado: 'error', error: { tipo: 'portal', mensaje: 'allianz/auto: mapa incompleto: faltan el formulario', url: null } }
const inventario = {
  version: 1,
  marcos: [{ url: 'https://cloud.example.test/ngx-motor-azs/', nombre: 'appArea', elementos: [{ tag: 'input', id: 'matricula', formControlName: 'plate' }] }],
  totalElementos: 1,
  recortado: null,
  textosDescartados: 0,
}

test('el resultado de error conserva el inventario saneado', () => {
  const l = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: inventario } })
  assert.ok(l.ok && l.r.tipo === 'error')
  assert.deepEqual(l.ok && l.r.tipo === 'error' ? l.r.error.inventarioDom : null, inventario)
})

test('se re-sanea: un value o un dato personal que llegue por el cable NO se guarda', () => {
  const sucio = { ...inventario, marcos: [{ url: 'https://x.test/a?nif=12345678Z', nombre: 'appArea', elementos: [{ tag: 'input', id: 'nif', value: 'Pepa Pérez', ariaLabel: '12345678Z' }] }] }
  const l = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: sucio } })
  assert.ok(l.ok && l.r.tipo === 'error')
  const s = JSON.stringify(l.ok && l.r.tipo === 'error' ? l.r.error.inventarioDom : null)
  assert.ok(!s.includes('Pepa') && !s.includes('12345678Z'))
})

test('inventario sin forma → se descarta sin rechazar el resultado; con tope de tamaño', () => {
  const malo = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: 'x' } })
  assert.ok(malo.ok && malo.r.tipo === 'error' && malo.r.error.inventarioDom === undefined)
  const enorme = { marcos: [{ url: 'https://x.test', nombre: null, elementos: Array.from({ length: 600 }, (_, i) => ({ tag: 'button', id: `b${i}`, texto: 'Acción '.repeat(10) })) }] }
  const l = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: { marcos: Array.from({ length: 5 }, () => enorme.marcos[0]) } } })
  assert.ok(l.ok && l.r.tipo === 'error' && l.r.error.inventarioDom)
  const inv = l.ok && l.r.tipo === 'error' ? l.r.error.inventarioDom! : null
  assert.ok(Buffer.byteLength(JSON.stringify(inv)) <= 60 * 1024)
  assert.ok(inv!.recortado && inv!.recortado.elementosDescartados > 0)
})
