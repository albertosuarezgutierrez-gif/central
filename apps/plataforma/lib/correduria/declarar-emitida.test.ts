import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OTRA, cuerpoAnulacion, cuerpoDeclaracion, formInicial, leerCatalogoCompanias, modoDeclaracion, puedeAnular, textoResultado } from './declarar-emitida.ts'
import { leerDeclaracion, rotuloEstadoDeclaracion } from '../seguimiento-asegura.ts'

// Reloj inyectado: `HOY` del reloj real y fechas relativas (nada de fechas fijas contra validaciones con reloj).
const HOY = new Date().toISOString().slice(0, 10)
const ABIERTA = { estado: 'en_negociacion', polizaGanadaId: null }

const CAT = [{ codigoDgs: 'C0072', nombreComun: 'Generali' }, { codigoDgs: 'C0468', nombreComun: 'Occident' }]
const F = { numeroPoliza: ' 540000123 ', codigoDgs: 'C0468', companiaLibre: '', fechaEfecto: '', nota: '' }

test('cuerpo: nº y compañía obligatorios; del catálogo va el código; el actor NO va (lo pone el servidor)', () => {
  const c = cuerpoDeclaracion('op1', ABIERTA, F, HOY, CAT)
  assert.ok(c.ok)
  if (!c.ok) return
  assert.deepEqual(c.cuerpo, { id: 'op1', accion: 'declarar_emitida', numeroPoliza: '540000123', codigoDgs: 'C0468', fechaEfecto: null, nota: null })
  assert.equal('actor' in c.cuerpo, false)
  assert.equal(cuerpoDeclaracion('op1', ABIERTA, { ...F, numeroPoliza: '' }, HOY, CAT).ok, false)
  assert.equal(cuerpoDeclaracion('op1', ABIERTA, { ...F, codigoDgs: '' }, HOY, CAT).ok, false)
})

test('cualquier aseguradora: «Otra» por nombre va sin código; sin catálogo legible solo vale «Otra»', () => {
  const o = cuerpoDeclaracion('op1', ABIERTA, { ...F, codigoDgs: OTRA, companiaLibre: 'Hiscox' }, HOY, CAT)
  assert.ok(o.ok && o.cuerpo.compania === 'Hiscox' && !('codigoDgs' in o.cuerpo))
  assert.equal(cuerpoDeclaracion('op1', ABIERTA, { ...F, codigoDgs: OTRA, companiaLibre: '' }, HOY, CAT).ok, false)
  assert.equal(cuerpoDeclaracion('op1', ABIERTA, F, HOY, null).ok, false)
  assert.equal(cuerpoDeclaracion('op1', ABIERTA, { ...F, codigoDgs: OTRA, companiaLibre: 'Hiscox' }, HOY, null).ok, true)
  assert.deepEqual(leerCatalogoCompanias(200, { estado: 'ok', companias: [{ codigoDgs: 'C0468', nombreComun: 'Occident' }, { codigoDgs: 'x', nombreComun: 'Mala' }] }), [{ codigoDgs: 'C0468', nombreComun: 'Occident' }])
  assert.equal(leerCatalogoCompanias(500, null), null, 'no se pudo leer ≠ catálogo vacío')
})

test('modo: abierta → declarar; ganada sin póliza → declarar o corregir; con póliza o perdida → nada', () => {
  const d = leerDeclaracion({ numeroPoliza: '540000123', compania: 'Occident', codigoDgs: 'C0468', fechaEfecto: null, declaradaAt: `${HOY}T10:00:00.000Z` })
  assert.equal(modoDeclaracion({ ...ABIERTA, declaracion: null }), 'declarar')
  assert.equal(modoDeclaracion({ estado: 'ganada', polizaGanadaId: null, declaracion: null }), 'declarar')
  assert.equal(modoDeclaracion({ estado: 'ganada', polizaGanadaId: null, declaracion: d }), 'corregir')
  assert.equal(modoDeclaracion({ estado: 'ganada', polizaGanadaId: 'p1', declaracion: d }), 'nada')
  assert.equal(modoDeclaracion({ estado: 'perdida', polizaGanadaId: null, declaracion: null }), 'nada')
  assert.equal(formInicial(d).numeroPoliza, '540000123')
  assert.equal(formInicial(d).codigoDgs, 'C0468')
  assert.equal(formInicial(leerDeclaracion({ numeroPoliza: '540000123', compania: 'Hiscox', declaradaAt: HOY })).codigoDgs, OTRA)
})

test('🪤 anular: solo ganada SIN póliza y con declaración; el cuerpo es la acción del puerto', () => {
  const d = leerDeclaracion({ numeroPoliza: '540000123', compania: 'Occident', codigoDgs: 'C0468', declaradaAt: HOY })
  assert.equal(puedeAnular({ estado: 'ganada', polizaGanadaId: null, declaracion: d }), true)
  assert.equal(puedeAnular({ estado: 'ganada', polizaGanadaId: 'p1', declaracion: d }), false)
  assert.equal(puedeAnular({ estado: 'ganada', polizaGanadaId: null, declaracion: null }), false)
  assert.equal(puedeAnular({ estado: 'en_negociacion', polizaGanadaId: null, declaracion: d }), false)
  assert.deepEqual(cuerpoAnulacion('op1'), { id: 'op1', accion: 'anular_declaracion' })
  assert.match(textoResultado(200, { estado: 'ok' }, 'anular').texto, /en negociación/)
})

test('🪤 estado visible: «pendiente de confirmar con CIMA» sin póliza; nunca «En vigor»; forma rara → null', () => {
  const d = leerDeclaracion({ numeroPoliza: '540000123', compania: 'Occident', codigoDgs: 'C0468', declaradaAt: `${HOY}T10:00:00.000Z` })
  assert.equal(rotuloEstadoDeclaracion({ estado: 'ganada', polizaGanadaId: null, declaracion: d }), 'Emitida · pendiente de confirmar con CIMA')
  assert.equal(rotuloEstadoDeclaracion({ estado: 'ganada', polizaGanadaId: 'p1', declaracion: d }), 'Emitida · confirmada por CIMA')
  assert.equal(rotuloEstadoDeclaracion({ estado: 'ganada', polizaGanadaId: null, declaracion: null }), null)
  assert.doesNotMatch(rotuloEstadoDeclaracion({ estado: 'ganada', polizaGanadaId: null, declaracion: d }) ?? '', /en vigor/i)
  assert.equal(leerDeclaracion({ numeroPoliza: '540000123', compania: 'Axa', codigoDgs: 'axa', declaradaAt: HOY }), null, 'código DGS mal formado')
  assert.equal(leerDeclaracion(null), null)
})

test('resultado: solo un 200 ok es «guardada»; sin conexión no se afirma nada', () => {
  assert.equal(textoResultado(200, { estado: 'ok' }).ok, true)
  assert.match(textoResultado(200, { estado: 'ok', sinCambios: true }).texto, /no se ha cambiado nada/)
  assert.match(textoResultado(422, { estado: 'invalido', motivo: 'Falta el nº de póliza (obligatorio).' }).texto, /Falta el nº/)
  assert.match(textoResultado(0, null).texto, /no se sabe si se guardó/)
})

test('lector del puerto: la oportunidad y la tarjeta traen la declaración y la póliza ganada (sin ellas, null)', async () => {
  const { interpretarOportunidad, interpretarOportunidadesCliente } = await import('../seguimiento-asegura.ts')
  const decl = { numeroPoliza: '540000123', compania: 'Occident', codigoDgs: 'C0468', fechaEfecto: null, origen: 'manual', declaradaAt: `${HOY}T10:00:00.000Z`, actor: 'a@b.es' }
  const op = { id: 'op1', clienteId: 'c1', estado: 'ganada', ramo: 'accidentes', polizaGanadaId: null }
  const l = interpretarOportunidad(200, { estado: 'ok', oportunidad: op, declaracion: decl, historial: [], tareas: [] })
  assert.ok(l.estado === 'ok' && l.declaracion?.numeroPoliza === '540000123' && l.oportunidad.polizaGanadaId === null)
  const sin = interpretarOportunidad(200, { estado: 'ok', oportunidad: op, historial: [], tareas: [] })
  assert.ok(sin.estado === 'ok' && sin.declaracion === null)
  const c = interpretarOportunidadesCliente(200, { estado: 'ok', oportunidades: [{ ...op, creada: HOY, polizaGanadaId: 'p9', declaracion: decl }] })
  assert.ok(c.estado === 'ok' && c.oportunidades[0]?.declaracion?.compania === 'Occident' && c.oportunidades[0]?.polizaGanadaId === 'p9')
})
