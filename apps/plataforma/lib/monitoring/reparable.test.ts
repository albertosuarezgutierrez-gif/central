// Tests de `reparable.ts` con PARTES REALES del histórico de latidos.
//
// El fixture importa: un parte inventado se escribe con la misma suposición que el código y por eso
// pasa (lección del parser de extractos de tarjeta, 08/08/2026). Los `detalle` de aquí están copiados
// de avisos reales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esExcepcion, firmaError, decidirReparacion, MAX_INTENTOS,
  type IntentoPrevio,
} from './reparable.ts'

const AHORA = new Date('2026-08-20T08:00:00Z')

/** El parte REAL que dejó `sivra_canal` el 20/08/2026 (truncado a 160 chars como lo guarda la tabla). */
const PARTE_CANAL_ROTO =
  'error: PrismaClientKnownRequestError: \n' +
  'Invalid `prisma.$queryRaw()` invocation:\n\n\n' +
  'Raw query failed. Code: `42883`. Message: `ERROR: operator does not exist: date - big'

/** El mismo fallo en otra pasada: el truncado cae un carácter más allá. */
const PARTE_CANAL_ROTO_OTRO_CORTE =
  'error: PrismaClientKnownRequestError: \n' +
  'Invalid `prisma.$queryRaw()` invocation:\n\n\n' +
  'Raw query failed. Code: `42883`. Message: `ERROR: operator does not exist: date - bigint'

/** Partes reales de agentes que están rojos SIN que el repo tenga la culpa. */
const PARTE_SWEEP_SIN_MERCADO = '0 comps en 44 ventanas · 41 búsquedas sin resultados'
const PARTE_BOOKING_MUDO = 'sin respuesta del conector en 4 de 4 pisos'
const PARTE_CANAL_SIN_MUESTRA =
  '4 pisos · 0 ajustados · 4 sin ajuste fiable (muestra_corta,muestra_corta,muestra_corta,' +
  'muestra_corta) · validación: 0 ok, 0 desviados, 4 sin ventanas nuevas'

test('esExcepcion distingue «el código revienta» de «no he podido mirar»', () => {
  assert.equal(esExcepcion(PARTE_CANAL_ROTO), true)
  assert.equal(esExcepcion('error: TypeError: x is not a function'), true)
  assert.equal(esExcepcion('error: connect ECONNREFUSED 10.0.0.1:5432'), true)

  // Ninguno de estos se arregla tocando este repo: son huecos de medición o servicios externos.
  assert.equal(esExcepcion(PARTE_SWEEP_SIN_MERCADO), false)
  assert.equal(esExcepcion(PARTE_BOOKING_MUDO), false)
  assert.equal(esExcepcion(PARTE_CANAL_SIN_MUESTRA), false)
  assert.equal(esExcepcion(null), false)
})

test('un «error» suelto en castellano NO es una excepción', () => {
  // Es el falso positivo caro: metería en el carril automático una avería de red.
  assert.equal(esExcepcion('error de red al consultar el portal de subastas'), false)
  assert.equal(esExcepcion('pasada sin errores'), false)
})

test('la firma es ESTABLE entre dos pasadas del mismo fallo', () => {
  const a = firmaError(PARTE_CANAL_ROTO)
  const b = firmaError(PARTE_CANAL_ROTO_OTRO_CORTE)
  assert.ok(a, 'debe extraer firma')
  assert.equal(a, b, 'el truncado del detalle no puede cambiar la firma')
})

test('la firma conserva el SQLSTATE y el mensaje, que es lo que distingue un 42883 de otro', () => {
  const f = firmaError(PARTE_CANAL_ROTO)!
  assert.match(f, /42883/)
  assert.match(f, /prismaclientknownrequesterror/)
  assert.match(f, /operator-does-not-exist-date/)
  // Dos 42883 por causas distintas NO pueden compartir firma (si no, arreglar uno «tapa» el otro).
  const otro = firmaError(
    'error: PrismaClientKnownRequestError: Raw query failed. Code: `42883`. ' +
    'Message: `ERROR: function make_interval(days => bigint) does not exist',
  )!
  assert.notEqual(f, otro)
})

test('la firma ignora las cifras volátiles del parte', () => {
  const uno = firmaError('error: TypeError: no se pudo leer 12 filas en 3.4 s')
  const dos = firmaError('error: TypeError: no se pudo leer 981 filas en 11.9 s')
  assert.equal(uno, dos)
})

test('decidirReparacion dispara con la avería real del canal', () => {
  const d = decidirReparacion({
    ahora: AHORA, detalle: PARTE_CANAL_ROTO, alerta: true, historial: [],
  })
  assert.equal(d.reparar, true)
  assert.ok(d.firma)
})

test('no dispara si el latido no está rojo', () => {
  const d = decidirReparacion({
    ahora: AHORA, detalle: PARTE_CANAL_ROTO, alerta: false, historial: [],
  })
  assert.equal(d.reparar, false)
})

test('no dispara con un parte que no es excepción, aunque el latido esté rojo', () => {
  const d = decidirReparacion({
    ahora: AHORA, detalle: PARTE_CANAL_SIN_MUESTRA, alerta: true, historial: [],
  })
  assert.equal(d.reparar, false)
  assert.match(d.motivo, /no describe una excepción/)
})

test('una firma = un intento: el mismo síntoma no se reintenta a diario', () => {
  const firma = firmaError(PARTE_CANAL_ROTO)!
  const historial: IntentoPrevio[] = [
    { firma, estado: 'fallida', intentoAt: new Date('2026-08-19T08:00:00Z') },
  ]
  const d = decidirReparacion({ ahora: AHORA, detalle: PARTE_CANAL_ROTO, alerta: true, historial })
  assert.equal(d.reparar, false)
  assert.match(d.motivo, /síntoma NUEVO/)
})

test('un síntoma NUEVO sí merece otro intento', () => {
  const historial: IntentoPrevio[] = [
    { firma: 'otra:firma:distinta', estado: 'fallida', intentoAt: new Date('2026-08-19T08:00:00Z') },
  ]
  const d = decidirReparacion({ ahora: AHORA, detalle: PARTE_CANAL_ROTO, alerta: true, historial })
  assert.equal(d.reparar, true)
})

test('no se solapan dos reparaciones del mismo agente', () => {
  for (const estado of ['intentando', 'pr_abierto', 'mergeada']) {
    const historial: IntentoPrevio[] = [
      { firma: 'vieja', estado, intentoAt: new Date('2026-08-20T07:00:00Z') },
    ]
    const d = decidirReparacion({ ahora: AHORA, detalle: PARTE_CANAL_ROTO, alerta: true, historial })
    assert.equal(d.reparar, false, `estado ${estado} debería frenar`)
    assert.match(d.motivo, /reparación viva/)
  }
})

test(`se rinde tras ${MAX_INTENTOS} intentos en la ventana y lo declara`, () => {
  const historial: IntentoPrevio[] = Array.from({ length: MAX_INTENTOS }, (_, i) => ({
    firma: `firma-${i}`,
    estado: 'fallida',
    intentoAt: new Date(`2026-08-1${i + 1}T08:00:00Z`),
  }))
  const d = decidirReparacion({ ahora: AHORA, detalle: PARTE_CANAL_ROTO, alerta: true, historial })
  assert.equal(d.reparar, false)
  assert.equal(d.agotado, true, 'el llamador tiene que poder avisar UNA vez y rendirse')
})

test('los intentos viejos caen fuera de la ventana y no cuentan', () => {
  const historial: IntentoPrevio[] = Array.from({ length: MAX_INTENTOS }, (_, i) => ({
    firma: `firma-${i}`,
    estado: 'fallida',
    intentoAt: new Date(`2026-05-0${i + 1}T08:00:00Z`), // ~3 meses atrás
  }))
  const d = decidirReparacion({ ahora: AHORA, detalle: PARTE_CANAL_ROTO, alerta: true, historial })
  assert.equal(d.reparar, true)
  assert.equal(d.agotado, false)
})
