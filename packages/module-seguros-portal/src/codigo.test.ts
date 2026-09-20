import test from 'node:test'
import assert from 'node:assert/strict'
import { generarCodigo, estadoCodigo, esHashCodigo, igualEnTiempoConstante, MAX_INTENTOS, VALIDEZ_MINUTOS } from './codigo.ts'

const T0 = new Date('2026-09-01T10:00:00Z')

/** Un hash con la forma que produce `hashCodigo()`: 64 hex en minúscula. */
const hash = (semilla: string) => semilla.repeat(64).slice(0, 64)
const BUENO = hash('a1b2c3d4')
const OTRO = hash('f9e8d7c6')

test('el código son 6 dígitos', () => {
  for (let i = 0; i < 50; i++) assert.match(generarCodigo(), /^\d{6}$/)
})

test('dos códigos seguidos no son iguales (no es un contador)', () => {
  const muestras = new Set(Array.from({ length: 30 }, () => generarCodigo()))
  assert.ok(muestras.size > 1)
})

test('el código correcto y dentro de plazo es válido', () => {
  const r = estadoCodigo(
    { codigoHash: BUENO, creadoEn: T0, intentos: 0, usadoEn: null },
    BUENO,
    new Date('2026-09-01T10:05:00Z'),
  )
  assert.equal(r, 'valido')
})

test('caducado a los VALIDEZ_MINUTOS, aunque el código sea el bueno', () => {
  const despues = new Date(T0.getTime() + (VALIDEZ_MINUTOS + 1) * 60_000)
  assert.equal(estadoCodigo({ codigoHash: BUENO, creadoEn: T0, intentos: 0, usadoEn: null }, BUENO, despues), 'caducado')
})

test('un código ya usado no vale una segunda vez', () => {
  const r = estadoCodigo(
    { codigoHash: BUENO, creadoEn: T0, intentos: 0, usadoEn: new Date('2026-09-01T10:01:00Z') },
    BUENO,
    new Date('2026-09-01T10:02:00Z'),
  )
  assert.equal(r, 'ya_usado')
})

test('al superar MAX_INTENTOS se bloquea aunque acierte: si no, es fuerza bruta sobre 6 dígitos', () => {
  const r = estadoCodigo(
    { codigoHash: BUENO, creadoEn: T0, intentos: MAX_INTENTOS, usadoEn: null },
    BUENO,
    new Date('2026-09-01T10:01:00Z'),
  )
  assert.equal(r, 'bloqueado')
})

test('código incorrecto dentro de plazo devuelve incorrecto', () => {
  const r = estadoCodigo({ codigoHash: BUENO, creadoEn: T0, intentos: 1, usadoEn: null }, OTRO, new Date('2026-09-01T10:01:00Z'))
  assert.equal(r, 'incorrecto')
})

test('se comprueba PRIMERO el bloqueo y luego el acierto', () => {
  const r = estadoCodigo(
    { codigoHash: BUENO, creadoEn: T0, intentos: MAX_INTENTOS, usadoEn: null },
    OTRO,
    new Date('2026-09-01T10:01:00Z'),
  )
  assert.equal(r, 'bloqueado')
})

// ─────────────────────────────────────────────────────────────────────────────
// El código se guarda HASHEADO (auditoría 20/09/2026)
// ─────────────────────────────────────────────────────────────────────────────

test('🚨 una fila en claro con su código en claro NO abre la puerta', () => {
  // Es el cepo de la decisión: **no se aceptan los dos formatos**. Con la
  // comparación en claro viva, esta llamada devolvería `valido` — o sea, las
  // filas escritas antes del hasheado seguirían siendo utilizables tal cual,
  // que es justo el agujero que este cambio cierra.
  const r = estadoCodigo({ codigoHash: '123456', creadoEn: T0, intentos: 0, usadoEn: null }, '123456', new Date('2026-09-01T10:01:00Z'))
  assert.equal(r, 'caducado')
})

test('una fila ANTERIOR al hasheado (6 dígitos en claro) sale caducado, no incorrecto', () => {
  // `incorrecto` es lo único que gasta uno de los 5 intentos, y encima le echa
  // la culpa a quien ha tecleado bien. `caducado` dice lo que hay que hacer:
  // pedir otro código.
  const r = estadoCodigo({ codigoHash: '123456', creadoEn: T0, intentos: 0, usadoEn: null }, BUENO, new Date('2026-09-01T10:01:00Z'))
  assert.equal(r, 'caducado')
})

test('esHashCodigo distingue un SHA-256 hex de cualquier otra cosa', () => {
  assert.equal(esHashCodigo(BUENO), true)
  assert.equal(esHashCodigo('123456'), false)
  assert.equal(esHashCodigo(BUENO.toUpperCase()), false, 'hex en mayúscula no es lo que produce hashCodigo')
  assert.equal(esHashCodigo(BUENO.slice(0, 63)), false)
  assert.equal(esHashCodigo(BUENO + 'a'), false)
})

test('igualEnTiempoConstante no corta al primer carácter distinto', () => {
  assert.equal(igualEnTiempoConstante(BUENO, BUENO), true)
  // Diferencia en el PRIMER carácter: un `dif = ...` (en vez de `dif |= ...`)
  // dentro del bucle se comería esta y solo miraría el último.
  assert.equal(igualEnTiempoConstante(BUENO, 'b' + BUENO.slice(1)), false)
  // Y en el último, que es lo que caza un bucle que no recorre entero.
  assert.equal(igualEnTiempoConstante(BUENO, BUENO.slice(0, 63) + '0'), false)
  assert.equal(igualEnTiempoConstante(BUENO, BUENO.slice(0, 63)), false, 'longitudes distintas no son iguales')
})
