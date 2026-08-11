// Cursor incremental de las alertas de portales. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avanzarCursor, detalleLectura, planificarLectura, uidsALeer } from './correo-incremental.ts'

const AHORA = Date.UTC(2026, 7, 8, 6, 20)

test('sin cursor se bootstrapea por ventana de días', () => {
  const plan = planificarLectura({ cursor: null, uidValidityActual: 12, dias: 30, ahora: AHORA })
  assert.equal(plan.modo, 'bootstrap')
  assert.equal(plan.modo === 'bootstrap' && plan.motivo, 'sin-cursor')
  assert.equal(plan.modo === 'bootstrap' && plan.desde.getTime(), AHORA - 30 * 86400_000)
})

test('un cursor a 0 no se toma por bueno (es «nunca he leído», no «uid 0»)', () => {
  const plan = planificarLectura({ cursor: { lastUid: 0, uidValidity: 12 }, uidValidityActual: 12, dias: 30, ahora: AHORA })
  assert.equal(plan.modo, 'bootstrap')
})

test('con cursor válido se lee solo lo posterior', () => {
  const plan = planificarLectura({ cursor: { lastUid: 4210, uidValidity: 12 }, uidValidityActual: 12, dias: 30, ahora: AHORA })
  assert.deepEqual(plan, { modo: 'incremental', desdeUid: 4210 })
})

test('si el buzón se renumera (uidvalidity distinto) NO se confía en el uid viejo', () => {
  // Los UID de un uidvalidity anterior no significan nada: leer «desde 4210»
  // podría saltarse todo el buzón nuevo en silencio.
  const plan = planificarLectura({ cursor: { lastUid: 4210, uidValidity: 12 }, uidValidityActual: 99, dias: 30, ahora: AHORA })
  assert.equal(plan.modo, 'bootstrap')
  assert.equal(plan.modo === 'bootstrap' && plan.motivo, 'uidvalidity-cambiado')
})

test('un uidvalidity sin apuntar (cursor viejo) no fuerza bootstrap', () => {
  const plan = planificarLectura({ cursor: { lastUid: 4210, uidValidity: null }, uidValidityActual: 12, dias: 30, ahora: AHORA })
  assert.deepEqual(plan, { modo: 'incremental', desdeUid: 4210 })
})

test('el último correo YA procesado no vuelve (landmine del rango N:* de IMAP)', () => {
  // IMAP devuelve siempre el último mensaje del buzón para `N:*`, aunque su UID
  // sea menor que N: sin el filtro, cada pasada reprocesaría ese correo.
  const plan = planificarLectura({ cursor: { lastUid: 4210, uidValidity: 12 }, uidValidityActual: 12, dias: 30, ahora: AHORA })
  assert.deepEqual(uidsALeer([4210, 4211, 4213], plan, 50), [4211, 4213])
  assert.deepEqual(uidsALeer([4210], plan, 50), [])
})

test('en incremental el lote va de VIEJO a NUEVO para poder truncar sin huecos', () => {
  const plan = planificarLectura({ cursor: { lastUid: 100, uidValidity: 12 }, uidValidityActual: 12, dias: 30, ahora: AHORA })
  const lote = uidsALeer([105, 101, 104, 102, 103], plan, 3)
  assert.deepEqual(lote, [101, 102, 103])
  // El cursor avanza a lo procesado: la pasada siguiente arranca en 104, no en 106.
  assert.deepEqual(avanzarCursor({ lastUid: 100, uidValidity: 12 }, lote, 12), { lastUid: 103, uidValidity: 12 })
})

test('en bootstrap manda lo MÁS NUEVO (conducta histórica de leerAlertas)', () => {
  const plan = planificarLectura({ cursor: null, uidValidityActual: 12, dias: 30, ahora: AHORA })
  assert.deepEqual(uidsALeer([1, 9, 5, 7], plan, 2), [9, 7])
})

test('un lote vacío NO retrocede el cursor, pero sí apunta el uidvalidity', () => {
  assert.deepEqual(avanzarCursor({ lastUid: 4210, uidValidity: null }, [], 12), { lastUid: 4210, uidValidity: 12 })
})

test('un uidvalidity ilegible (0) no borra el que ya había', () => {
  assert.deepEqual(avanzarCursor({ lastUid: 10, uidValidity: 12 }, [11], 0), { lastUid: 11, uidValidity: 12 })
})

test('el parte dice el MODO, no solo cuántos correos', () => {
  // Un bootstrap repetido cada día = el cursor no se guarda. Sin decirlo, se
  // vería igual que una ingesta sana (solo que lenta) — que es el fallo que
  // este cursor viene a arreglar.
  const inc = planificarLectura({ cursor: { lastUid: 7, uidValidity: 1 }, uidValidityActual: 1, dias: 30, ahora: AHORA })
  assert.match(detalleLectura('idealista.com', inc, 3), /idealista\.com: 3 correo\(s\), desde uid 7/)
  const boot = planificarLectura({ cursor: null, uidValidityActual: 1, dias: 30, ahora: AHORA })
  assert.match(detalleLectura('fotocasa.es', boot, 140), /primera lectura \(sin-cursor\)/)
})
