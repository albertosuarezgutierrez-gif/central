import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { admiteMarca, conRevisado, interpretarCorreosCompania, pideMirar } from './correos-compania.ts'

const f = (o: Record<string, unknown> = {}) => ({
  id: 'e1', creado: '2026-10-14T09:10', tipo: 'pre_anulacion', subtipo: null, clave: 'BIDS1/480-H', compania: 'occident',
  numeroPoliza: 'BIDS1', estado: 'aplicado', motivo: null, resumen: 'tarea creada, vence 15/10/2026', clienteId: 'c1',
  cliente: 'Persona Prueba', fechaLimite: '2026-10-15', importe: null, ...o,
})

test('ok: filas válidas, las raras se CUENTAN (no se pintan), los sin resolver primero', () => {
  const r = interpretarCorreosCompania(200, { estado: 'ok', truncado: false, filas: [f(), f({ id: 'e2', estado: 'sin_resolver', creado: '2026-10-01T08:00' }), { id: 'x' }] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.filas.map((x) => x.id), ['e2', 'e1'])
  assert.equal(r.descartadas, 1)
  assert.equal(r.filas[1].importe, null) // sin importe = null, nunca 0
})

test('lista vacía con ok = comprobado; error y sin_migracion NUNCA se leen como «no hay»', () => {
  const vacia = interpretarCorreosCompania(200, { estado: 'ok', filas: [] })
  assert.equal(vacia.estado, 'ok')
  assert.equal(interpretarCorreosCompania(503, { estado: 'sin_migracion' }).estado, 'sin_migracion')
  assert.deepEqual(interpretarCorreosCompania(500, null), { estado: 'error', motivo: 'respuesta 500' })
  assert.deepEqual(interpretarCorreosCompania(503, { estado: 'sin_configurar' }), { estado: 'error', motivo: 'falta conectar el puerto de asegura' })
  assert.equal(interpretarCorreosCompania(200, { estado: 'ok' }).estado, 'error')
})

test('pideMirar: sin resolver y a medias', () => {
  assert.equal(pideMirar({ estado: 'sin_resolver' }), true)
  assert.equal(pideMirar({ estado: 'procesando' }), true)
  assert.equal(pideMirar({ estado: 'duplicado_cima' }), false)
})

test('la bandeja pinta ≤50 + «Ver más», importes con eur() y tiene el ancla del aviso', () => {
  const src = readFileSync(join(import.meta.dirname, '../../app/(usuario)/correduria/mesa/CorreosCompania.tsx'), 'utf8')
  assert.match(src, /const PAGINA = 50/)
  assert.match(src, /Ver más/)
  assert.match(src, /eur\(/)
  assert.doesNotMatch(src, /toFixed\(/)
  assert.match(src, /id="correos-compania"/)
})

test('revisado: ausente = no mirado; un mirado ya no pide mirar y va al final', () => {
  const r = interpretarCorreosCompania(200, { estado: 'ok', filas: [
    f({ id: 'a', estado: 'sin_resolver', revisado: true, creado: '2026-10-14T10:00' }),
    f({ id: 'b', estado: 'aplicado', creado: '2026-10-13T10:00' }),
    f({ id: 'c', estado: 'procesando', creado: '2026-10-01T10:00' }),
  ] })
  if (r.estado !== 'ok') throw new Error('esperaba ok')
  assert.deepEqual(r.filas.map((x) => x.id), ['c', 'b', 'a'])
  assert.equal(r.filas[0].revisado, false)
  assert.equal(admiteMarca({ estado: 'aplicado' }), false)
  assert.equal(pideMirar({ estado: 'sin_resolver', revisado: true }), false)
})

test('conRevisado: marca y deshace en local; solo filas que admiten marca', () => {
  const r = interpretarCorreosCompania(200, { estado: 'ok', filas: [f({ id: 'a', estado: 'sin_resolver' }), f({ id: 'b', estado: 'aplicado' })] })
  if (r.estado !== 'ok') throw new Error('esperaba ok')
  const m = conRevisado(r.filas, 'a', true)
  assert.deepEqual(m.map((x) => [x.id, x.revisado]), [['b', false], ['a', true]])
  assert.deepEqual(conRevisado(m, 'a', false).map((x) => x.id), ['a', 'b'])
  assert.equal(conRevisado(r.filas, 'b', true).find((x) => x.id === 'b')?.revisado, false)
  assert.deepEqual(conRevisado(r.filas, 'zz', true), r.filas)
})

test('emisión: la bandeja la rotula «Póliza nueva» y pinta «Póliza nueva emitida: …»', async () => {
  const { ROTULO_TIPO_CORREO, textoElementoCorreo } = await import('./correos-compania.ts')
  assert.equal(ROTULO_TIPO_CORREO.emision, 'Póliza nueva')
  assert.equal(textoElementoCorreo({ tipo: 'emision', clave: '061000001', numeroPoliza: '061000001' }), 'Póliza nueva emitida: 061000001')
  assert.equal(textoElementoCorreo({ tipo: 'siniestro', clave: '43000001', numeroPoliza: '806000001' }), 'Siniestro 43000001 · póliza 806000001')
  assert.equal(textoElementoCorreo({ tipo: 'suplemento', clave: 'BIDS000001', numeroPoliza: null }), 'Póliza BIDS000001')
  const src = readFileSync(join(import.meta.dirname, '..', '..', 'app', '(usuario)', 'correduria', 'mesa', 'CorreosCompania.tsx'), 'utf8')
  assert.match(src, /textoElementoCorreo\(e\)/)
})

test('solicitud (20/10/2026): la bandeja la rotula «Solicitud» y pinta «Solicitud <nº>» (sin póliza)', async () => {
  const { ROTULO_TIPO_CORREO, textoElementoCorreo } = await import('./correos-compania.ts')
  assert.equal(ROTULO_TIPO_CORREO.solicitud, 'Solicitud')
  assert.equal(textoElementoCorreo({ tipo: 'solicitud', clave: '170000001', numeroPoliza: null }), 'Solicitud 170000001')
})
