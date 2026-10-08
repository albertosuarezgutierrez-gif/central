// Cepos de la bandeja «Necesita tu atención» y de la traza del tarificador RPA (08/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerMetaWorker, leerResultadoWorker } from './tarificador-reglas.ts'
import { leerPaginacion, proyectarItemBandeja, proyectarPaso, tipoDeError } from './tarificador-bandeja-reglas.ts'

const JOB = '11111111-1111-4111-8111-111111111111'
const fila = (extra: Record<string, unknown> = {}) => ({
  id: JOB, compania: 'allianz', ramo: 'comunidades', estado: 'requiere_humano', intentos: 1,
  error: { tipo: 'captcha', mensaje: 'requiere_verificacion_humana: Generali pide un código SMS', url: 'https://portal/x' },
  oportunidad_id: null, bot_version: '0.1.0', fecha: new Date('2026-10-08T10:00:00Z'), ...extra,
})

test('item de la bandeja: motivo legible, acciones permitidas y lista blanca', () => {
  const i = proyectarItemBandeja(fila())
  assert.equal(i.motivo, 'Generali pide un código SMS')
  assert.equal(i.tipoError, 'captcha')
  assert.equal(i.puedeReintentar, true)
  assert.equal(i.puedeCancelar, true)
  assert.equal(i.fecha, '2026-10-08T10:00:00.000Z')
  // nada del error crudo ni de la URL del portal
  assert.ok(!JSON.stringify(i).includes('portal/x'))
  assert.ok(!('error' in i))
})

test('item: un error de emisión no admite reintento; un estado vivo no admite nada', () => {
  const e = proyectarItemBandeja(fila({ estado: 'error_definitivo', error: { tipo: 'emision', mensaje: 'x' } }))
  assert.equal(e.puedeReintentar, false)
  assert.equal(e.puedeCancelar, true)
  const v = proyectarItemBandeja(fila({ estado: 'en_curso' }))
  assert.equal(v.puedeReintentar, false)
  assert.equal(v.puedeCancelar, false)
})

test('item: el mensaje técnico no sale; sin error hay texto neutro', () => {
  const t = proyectarItemBandeja(fila({ estado: 'error_definitivo', error: { tipo: 'portal', mensaje: 'locator(#x) timeout at /app/src/a.ts:10' } }))
  assert.ok(!t.motivo.includes('locator'))
  assert.ok(proyectarItemBandeja(fila({ error: null })).motivo.length > 10)
  assert.equal(tipoDeError('x'), null)
})

test('paginación: valores por defecto ante basura, tope de 100', () => {
  assert.deepEqual(leerPaginacion(null, null), { limite: 50, desde: 0 })
  assert.deepEqual(leerPaginacion('abc', '-3'), { limite: 50, desde: 0 })
  assert.deepEqual(leerPaginacion('101', '1.5'), { limite: 50, desde: 0 })
  assert.deepEqual(leerPaginacion('20', '40'), { limite: 20, desde: 40 })
})

test('paso de traza: proyección sin tocar nada más', () => {
  const p = proyectarPaso({ paso: 'login', inicio: new Date('2026-10-08T10:00:00Z'), duracion_ms: 1500, ok: false, error_codigo: 'portal', captura_ref: null })
  assert.deepEqual(p, { paso: 'login', inicio: '2026-10-08T10:00:00.000Z', duracionMs: 1500, ok: false, errorCodigo: 'portal', capturaRef: null })
})

// ─── La traza que llega del worker ───────────────────────────────────────────

const paso = (extra: Record<string, unknown> = {}) => ({ paso: 'login', inicio: '2026-10-08T10:00:00.000Z', duracionMs: 900, ok: true, errorCodigo: null, ...extra })

test('traza limpia + versión válida se leen tal cual', () => {
  const m = leerMetaWorker({ pasos: [paso()], botVersion: '0.1.0' })
  assert.equal(m.pasos.length, 1)
  assert.equal(m.botVersion, '0.1.0')
  assert.equal(m.trazaRechazada, undefined)
})

test('una traza con claves de datos personales se DESCARTA entera, sin repetir el valor', () => {
  for (const clave of ['nombre', 'dni', 'email', 'telefono', 'valor', 'direccion']) {
    const m = leerMetaWorker({ pasos: [paso(), paso({ [clave]: 'Juan Pérez 12345678Z' })], botVersion: '0.1.0' })
    assert.deepEqual(m.pasos, [], clave)
    assert.ok(m.trazaRechazada && m.trazaRechazada.length > 0, clave)
    assert.ok(!JSON.stringify(m).includes('12345678Z'), clave)
    assert.equal(m.botVersion, '0.1.0') // la versión no depende de la traza
  }
})

test('versión que no es semver → null (no se guarda basura en bot_version)', () => {
  for (const v of ['v1', '1.0', "0.1.0'; drop table x", 7, null, undefined]) assert.equal(leerMetaWorker({ botVersion: v }).botVersion, null)
})

test('un resultado de error con traza sucia se acepta igual (la traza es accesoria)', () => {
  const r = leerResultadoWorker({
    trabajoId: JOB, resultado: 'error', error: { tipo: 'portal', mensaje: 'x' },
    pasos: [paso({ email: 'a@b.es' })], botVersion: '0.1.0',
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.r.pasos, [])
    assert.ok(r.r.trazaRechazada)
    assert.equal(r.r.botVersion, '0.1.0')
  }
})

test('sin pasos ni versión (worker antiguo) el resultado sigue siendo válido', () => {
  const r = leerResultadoWorker({ trabajoId: JOB, resultado: 'error', error: { tipo: 'portal', mensaje: 'x' } })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([r.r.pasos, r.r.botVersion], [[], null])
})
