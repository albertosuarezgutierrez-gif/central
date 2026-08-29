import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estadoEarnings,
  cruzaEvento,
  finDeVentana,
  partirPorEvento,
  atribuirPorEvento,
  resumenAtribucion,
} from '../src/evento.ts'

// ── estadoEarnings: los tres estados no se colapsan ───────────────────────────────────────────────

test('sin consultar NO es lo mismo que consultado sin fecha', () => {
  assert.equal(estadoEarnings(false, undefined), 'sin_consultar')
  assert.equal(estadoEarnings(false, '2026-08-26'), 'sin_consultar')   // no preguntamos: da igual lo que traiga
  assert.equal(estadoEarnings(true, null), 'sin_fecha')
  assert.equal(estadoEarnings(true, '2026-08-26'), 'con_fecha')
})

// ── cruzaEvento: el caso real de NVDA ─────────────────────────────────────────────────────────────

test('NVDA: tesis del 21/08 con ventana de 10 días cruza los resultados del 26/08', () => {
  assert.equal(cruzaEvento('2026-08-26', 'con_fecha', '2026-08-21', finDeVentana('2026-08-21', 10)), 'cruzado')
})

test('la misma fecha de evento queda LIMPIA si la ventana acaba antes', () => {
  assert.equal(cruzaEvento('2026-08-26', 'con_fecha', '2026-08-21', '2026-08-25'), 'limpio')
})

test('un evento anterior a la apertura no cuenta', () => {
  assert.equal(cruzaEvento('2026-08-20', 'con_fecha', '2026-08-21', '2026-08-31'), 'limpio')
})

test('los dos bordes cuentan como cruzado (conservador: los resultados post-cierre mueven D+1)', () => {
  assert.equal(cruzaEvento('2026-08-21', 'con_fecha', '2026-08-21', '2026-08-31'), 'cruzado')
  assert.equal(cruzaEvento('2026-08-31', 'con_fecha', '2026-08-21', '2026-08-31'), 'cruzado')
})

test('sin_consultar se PROPAGA: nunca se cuela como limpio', () => {
  assert.equal(cruzaEvento(undefined, 'sin_consultar', '2026-08-21', '2026-08-31'), 'sin_consultar')
  // Aunque venga una fecha suelta, si no se consultó no se afirma nada.
  assert.equal(cruzaEvento('2026-08-26', 'sin_consultar', '2026-08-21', '2026-08-31'), 'sin_consultar')
})

test('consultado y sin fecha SÍ es limpio: la fuente dijo que no hay', () => {
  assert.equal(cruzaEvento(null, 'sin_fecha', '2026-08-21', '2026-08-31'), 'limpio')
})

test('una fecha ilegible no se adivina: cae a sin_consultar', () => {
  assert.equal(cruzaEvento('mañana', 'con_fecha', '2026-08-21', '2026-08-31'), 'sin_consultar')
})

test('una fecha reconstruida se usa igual, pero su etiqueta la delata', () => {
  assert.equal(cruzaEvento('2026-08-26', 'reconstruido', '2026-08-21', '2026-08-31'), 'cruzado')
})

test('finDeVentana suma días naturales y cruza el fin de mes', () => {
  assert.equal(finDeVentana('2026-08-21', 10), '2026-08-31')
  assert.equal(finDeVentana('2026-08-26', 10), '2026-09-05')
  assert.equal(finDeVentana('2026-08-21', 0), '2026-08-21')
})

// ── partición y atribución ────────────────────────────────────────────────────────────────────────

type R = { c: ReturnType<typeof cruzaEvento>; r: number }
const cruce = (x: R) => x.c
const ret = (x: R) => x.r

test('los tres montones son disjuntos y suman el total', () => {
  const items: R[] = [
    { c: 'cruzado', r: 0.05 },
    { c: 'limpio', r: 0.01 },
    { c: 'limpio', r: -0.03 },
    { c: 'sin_consultar', r: 0.9 },
  ]
  const p = partirPorEvento(items, cruce)
  assert.equal(p.cruzado.length, 1)
  assert.equal(p.limpio.length, 2)
  assert.equal(p.sinConsultar.length, 1)
  assert.equal(p.cruzado.length + p.limpio.length + p.sinConsultar.length, items.length)
})

test('los sin_consultar NO entran en ninguna media', () => {
  const a = atribuirPorEvento(
    [
      { c: 'limpio', r: 0.02 },
      { c: 'limpio', r: 0.04 },
      { c: 'sin_consultar', r: 10 },   // un valor enorme: si contaminara, la media se dispararía
    ] as R[],
    cruce,
    ret,
  )
  assert.equal(a.medioLimpio, 0.03)
  assert.equal(a.nLimpio, 2)
  assert.equal(a.nSinConsultar, 1)
  assert.equal(a.medioCruzado, null)
})

test('un montón vacío da null, NUNCA 0 (0 se leería como «midió y salió plano»)', () => {
  const a = atribuirPorEvento([] as R[], cruce, ret)
  assert.equal(a.medioLimpio, null)
  assert.equal(a.medioCruzado, null)
  assert.equal(a.nLimpio, 0)
  assert.equal(a.nCruzado, 0)
})

test('el caso NVDA: el +6,79% del evento no infla la media de la señal', () => {
  const a = atribuirPorEvento(
    [
      { c: 'cruzado', r: 0.0679 },
      { c: 'limpio', r: -0.01 },
      { c: 'limpio', r: 0.005 },
    ] as R[],
    cruce,
    ret,
  )
  assert.equal(a.medioCruzado, 0.0679)
  assert.equal(a.medioLimpio, -0.0025)
  // Sin partir, la media conjunta sería positiva y la señal parecería buena.
  assert.ok(a.medioLimpio! < 0 && a.medioCruzado! > 0)
})

// ── resumen ───────────────────────────────────────────────────────────────────────────────────────

test('sin eventos ni huecos el resumen calla (no añade ruido)', () => {
  assert.equal(resumenAtribucion({ medioLimpio: 0.01, medioCruzado: null, nLimpio: 5, nCruzado: 0, nSinConsultar: 0 }), '')
})

test('el resumen canta SIEMPRE lo que no se ha comprobado', () => {
  const s = resumenAtribucion({ medioLimpio: 0.01, medioCruzado: null, nLimpio: 5, nCruzado: 0, nSinConsultar: 3 })
  assert.match(s, /3 sin fecha comprobada/)
})

test('con eventos, el resumen enfrenta los dos montones', () => {
  const s = resumenAtribucion({ medioLimpio: -0.0025, medioCruzado: 0.0679, nLimpio: 2, nCruzado: 1, nSinConsultar: 0 })
  assert.match(s, /1 con resultados dentro de la ventana \(medio 6\.79%\)/)
  assert.match(s, /2 sin evento \(medio -0\.25%\)/)
})
