import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANIOS_CADUCIDAD_ANOTACION,
  caducidadDelCuadro,
  estadoCaducidad,
  parsearFechaRegistral,
} from '../src/caducidad.ts'
import { cargasQueSubsisten, resumirCargas } from '../src/cargas.ts'
import type { Carga, CuadroCargas } from '../src/cargas.ts'

const HOY = new Date('2026-07-30T00:00:00Z')

const carga = (extra: Partial<Carga> = {}): Carga => ({
  tipo: 'embargo',
  acreedor: 'AEAT',
  importe: 3600,
  fecha: '2015-04-10',
  rango: 'anterior',
  cancelada: false,
  literal: null,
  ...extra,
})

// ── Parseo de fechas registrales ────────────────────────────────────────────

test('lee las tres formas en que el registro escribe una fecha', () => {
  assert.equal(parsearFechaRegistral('2015-04-10')?.fecha.toISOString().slice(0, 10), '2015-04-10')
  assert.equal(parsearFechaRegistral('10/04/2015')?.fecha.toISOString().slice(0, 10), '2015-04-10')
  assert.equal(parsearFechaRegistral('10 de abril de 2015')?.fecha.toISOString().slice(0, 10), '2015-04-10')
})

test('con solo el año se asume el 31 de diciembre (la lectura que menos caduca)', () => {
  const p = parsearFechaRegistral('anotación letra C) del año 2015')
  assert.equal(p?.fecha.toISOString().slice(0, 10), '2015-12-31')
  assert.equal(p?.exacta, false)
})

test('un texto sin fecha no se inventa una', () => {
  assert.equal(parsearFechaRegistral('anotación preventiva letra C'), null)
  assert.equal(parsearFechaRegistral(null), null)
})

// ── Estado de una carga ─────────────────────────────────────────────────────

test('el art. 86 LH NO aplica a una hipoteca: es inscripción, no anotación', () => {
  const e = estadoCaducidad(carga({ tipo: 'hipoteca', fecha: '2009-03-02' }), HOY)
  assert.equal(e.estado, 'no_aplica')
  assert.equal(e.nota, null)
})

test('un embargo de hace 11 años sin prórroga sale como posible caducada', () => {
  const e = estadoCaducidad(carga({ fecha: '2015-04-10' }), HOY)
  assert.equal(e.estado, 'posible_caducada')
  assert.ok(e.aniosDesde! > 11)
  assert.match(e.nota!, /86 LH/)
  assert.match(e.nota!, /NO se descuenta/)
})

test('un embargo reciente está vigente', () => {
  const e = estadoCaducidad(carga({ fecha: '2024-01-15' }), HOY)
  assert.equal(e.estado, 'vigente')
})

test('el margen evita concluir justo en el límite de los 4 años', () => {
  // Exactamente 4 años y 2 meses: pasado el plazo nominal, dentro del margen.
  const e = estadoCaducidad(carga({ fecha: '2022-05-30' }), HOY)
  assert.ok(e.aniosDesde! > ANIOS_CADUCIDAD_ANOTACION)
  assert.equal(e.estado, 'vigente')
})

test('cualquier rastro de PRÓRROGA desactiva la conclusión', () => {
  const e = estadoCaducidad(
    carga({ fecha: '2015-04-10', literal: 'Anotación letra C, prorrogada por mandamiento de fecha…' }),
    HOY,
  )
  assert.equal(e.estado, 'prorrogada')
  assert.match(e.nota!, /puede reiterarse/)
})

test('sin fecha legible no se concluye nada y se dice', () => {
  const e = estadoCaducidad(carga({ fecha: null }), HOY)
  assert.equal(e.estado, 'sin_fecha')
  assert.match(e.nota!, /Se cuenta entera/)
})

// ── Cuadro completo ─────────────────────────────────────────────────────────

test('el cuadro reparte y cuantifica el ahorro potencial', () => {
  const c = caducidadDelCuadro([carga({ fecha: '2015-04-10', importe: 3600 }), carga({ tipo: 'hipoteca', fecha: '2009-01-01', importe: 44850 })], HOY)
  assert.equal(c.posiblesCaducadas.length, 1)
  assert.equal(c.ahorroPotencial, 3600)
  assert.equal(c.ahorroIncompleto, false)
})

test('una posible caducada sin importe deja el ahorro incompleto', () => {
  const c = caducidadDelCuadro([carga({ fecha: '2015-04-10', importe: null })], HOY)
  assert.equal(c.posiblesCaducadas.length, 1)
  assert.equal(c.ahorroIncompleto, true)
})

// ── Integración con la regla de subsistencia ────────────────────────────────

const CUADRO: CuadroCargas = {
  cargas: [
    { tipo: 'hipoteca', acreedor: 'CAJA DE AHORROS DE ASTURIAS', importe: 44850, fecha: '2009-03-02', rango: 'anterior', cancelada: false, literal: null },
    { tipo: 'embargo', acreedor: 'AEAT', importe: 3600, fecha: '2015-04-10', rango: 'anterior', cancelada: false, literal: null },
    { tipo: 'embargo', acreedor: 'LIBERBANK', importe: 7016.54, fecha: '2019-11-20', rango: 'la_que_ejecuta', cancelada: false, literal: null },
  ],
  procedimiento: 'embargo',
  sinMasCargas: true,
  notas: [],
  fuente: 'ocr_ia',
  confianza: 0.9,
}

test('el importe que MANDA sigue incluyendo la posible caducada', () => {
  const r = cargasQueSubsisten(CUADRO, HOY)
  assert.equal(r.importe, 48450) // 44.850 hipoteca + 3.600 embargo viejo
  assert.equal(r.posiblesCaducadas.length, 1)
  assert.equal(r.importeSiCaducan, 44850)
  assert.ok(r.avisos.some((a) => /bajaría de/.test(a)))
})

test('sin fecha de referencia no se evalúa la caducidad (comportamiento anterior)', () => {
  const r = cargasQueSubsisten(CUADRO)
  assert.equal(r.importe, 48450)
  assert.deepEqual(r.posiblesCaducadas, [])
  assert.equal(r.importeSiCaducan, null)
})

test('el resumen enseña el escenario alternativo DEBAJO del conservador', () => {
  const texto = resumirCargas(CUADRO, cargasQueSubsisten(CUADRO, HOY))
  const posConservador = texto.indexOf('Hereda el adjudicatario')
  const posAlternativo = texto.indexOf('podría')
  assert.ok(posConservador >= 0 && posAlternativo > posConservador)
  assert.match(texto, /Sin confirmar/)
})

test('una hipoteca vieja NUNCA se marca como caducada por mucho que pasen los años', () => {
  const soloHipoteca: CuadroCargas = { ...CUADRO, cargas: [CUADRO.cargas[0]] }
  const r = cargasQueSubsisten(soloHipoteca, HOY)
  assert.deepEqual(r.posiblesCaducadas, [])
  assert.equal(r.importe, 44850)
})
