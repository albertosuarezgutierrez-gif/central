import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolucionDeAnulacion, siguientePaso, transicion, validarSolicitud } from './anulacion.ts'

const base = { tipo: 'no_renovacion', solicitadaPor: 'cliente', motivo: 'precio', fechaEfecto: '2027-01-10' }
const ctx = { vencimiento: '2027-01-10', hoy: '2026-09-23' }

test('al vencimiento: el efecto es el vencimiento, y un vencimiento pasado no se anula', () => {
  const r = validarSolicitud(base, ctx)
  assert.ok(r.ok && r.advertencia === null)
  assert.equal(validarSolicitud({ ...base, fechaEfecto: '2026-12-01' }, ctx).ok, false)
  assert.equal(validarSolicitud(base, { ...ctx, vencimiento: null }).ok, false)
  assert.equal(validarSolicitud({ ...base, fechaEfecto: '2026-09-01' }, { ...ctx, vencimiento: '2026-09-01' }).ok, false)
})

test('art. 22 LCS: fuera del mes de preaviso se deja tramitar, pero avisado', () => {
  const r = validarSolicitud({ ...base, fechaEfecto: '2026-10-10' }, { ...ctx, vencimiento: '2026-10-10' })
  assert.ok(r.ok)
  assert.match(r.advertencia ?? '', /art\. 22 LCS.*10\/09\/2026/)
  const corr = validarSolicitud({ ...base, solicitadaPor: 'correduria', fechaEfecto: '2026-10-10' }, { ...ctx, vencimiento: '2026-10-10' })
  assert.ok(corr.ok && /art\. 22/.test(corr.advertencia ?? ''), 'la correduría la pide en nombre del tomador: mismo plazo')
  const cia = validarSolicitud({ ...base, solicitadaPor: 'compania', fechaEfecto: '2026-11-10' }, { ...ctx, vencimiento: '2026-11-10' })
  assert.ok(cia.ok && /dos meses/.test(cia.advertencia ?? ''))
})

test('anticipada: ni de hace más de 90 días ni después del vencimiento; avisa de que depende del condicionado', () => {
  const ant = { ...base, tipo: 'inmediata', fechaEfecto: '2026-09-30' }
  const r = validarSolicitud(ant, ctx)
  assert.ok(r.ok && /condicionado/.test(r.advertencia ?? ''))
  const venta = validarSolicitud({ ...ant, motivo: 'venta_del_bien' }, ctx)
  assert.ok(venta.ok && venta.advertencia === null)
  assert.equal(validarSolicitud({ ...ant, fechaEfecto: '2026-05-01' }, ctx).ok, false)
  assert.equal(validarSolicitud({ ...ant, fechaEfecto: '2027-02-01' }, ctx).ok, false)
})

test('datos obligatorios: tipo, quién, motivo (y texto con «otro»), fecha real', () => {
  assert.equal(validarSolicitud({ ...base, tipo: 'x' }, ctx).ok, false)
  assert.equal(validarSolicitud({ ...base, solicitadaPor: undefined }, ctx).ok, false)
  assert.equal(validarSolicitud({ ...base, motivo: 'otro' }, ctx).ok, false)
  assert.ok(validarSolicitud({ ...base, motivo: 'otro', motivoTexto: 'fallecimiento' }, ctx).ok)
  assert.equal(validarSolicitud({ ...base, tipo: 'inmediata', fechaEfecto: '2026-02-30' }, ctx).ok, false)
})

test('sin firma no se comunica a la compañía; lo cerrado no se mueve', () => {
  assert.equal(transicion('solicitada', 'marcar_comunicada'), null)
  assert.equal(transicion('solicitada', 'marcar_firmada'), 'firmada')
  assert.equal(transicion('firmada', 'marcar_comunicada'), 'comunicada')
  assert.equal(transicion('comunicada', 'confirmar'), 'confirmada')
  assert.equal(transicion('solicitada', 'confirmar'), null, 'sin firma ni comunicación no hay qué confirmar')
  assert.equal(transicion('firmada', 'confirmar'), null)
  assert.equal(transicion('solicitada', 'desistir'), 'desistida')
  assert.equal(transicion('confirmada', 'desistir'), null)
  assert.equal(transicion('desistida', 'marcar_firmada'), null)
})

test('siguiente paso: alarma si CIMA no la refleja pasados 15 días del efecto', () => {
  const a = { estado: 'comunicada' as const, fechaEfecto: '2026-09-01', compania: 'MAPFRE' }
  assert.equal(siguientePaso(a, '2026-09-10')?.alerta, false)
  const tarde = siguientePaso(a, '2026-09-23')!
  assert.ok(tarde.alerta && /MAPFRE/.test(tarde.texto) && /22 días/.test(tarde.texto))
  assert.equal(siguientePaso({ ...a, estado: 'confirmada' }, '2026-09-23'), null)
  assert.match(siguientePaso({ ...a, estado: 'solicitada', fechaEfecto: '2027-01-10' }, '2026-09-23')!.texto, /firma/)
})

test('la baja que explica: sustitución no es pérdida; el resto lleva un motivo de la lista', () => {
  assert.deepEqual(resolucionDeAnulacion({ tipo: 'sustitucion', motivo: 'precio' }), { resolucion: 'no_es_perdida' })
  assert.deepEqual(resolucionDeAnulacion({ tipo: 'no_renovacion', motivo: 'competidor' }), { resolucion: 'perdida', motivo: 'competidor' })
  assert.deepEqual(resolucionDeAnulacion({ tipo: 'inmediata', motivo: 'venta_del_bien' }), { resolucion: 'perdida', motivo: 'otro' })
})
